import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";
import { env } from "../config/env.ts";
import { HttpError } from "../lib/httpError.ts";
import { prisma } from "../lib/prisma.ts";
import { GitLabAdapter } from "../review/forge/gitlab.ts";
import { adapterForConnection } from "../services/forge.ts";
import { webhookSecret } from "../services/webhooks.ts";
import { enqueue, enqueueFromWebhook } from "../worker/queue.ts";

// "/bammy review" at the start of any line of a comment.
const COMMAND = /^\/bammy\s+review\b/im;

const GITHUB_PR_ACTIONS = new Set(["opened", "synchronize", "reopened", "ready_for_review"]);
// Who may ask for a review in a comment: people who can already push.
const GITHUB_TRUSTED = new Set(["OWNER", "MEMBER", "COLLABORATOR"]);
const GITLAB_DEVELOPER = 30;

// Equal-length digests so the comparison takes the same time whatever the input.
function safeEqual(a: string, b: string): boolean {
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(a), digest(b));
}

function rawBody(req: Request): Buffer {
  if (!Buffer.isBuffer(req.body)) throw new HttpError(400, "Expected a raw request body");
  return req.body;
}

function parse<T>(raw: Buffer): T {
  try {
    return JSON.parse(raw.toString("utf8")) as T;
  } catch {
    throw new HttpError(400, "Body is not JSON");
  }
}

interface GitHubPayload {
  action?: string;
  installation?: { id: number };
  repository?: { id: number };
  pull_request?: { number: number; head: { sha: string } };
  issue?: { number: number; pull_request?: unknown };
  comment?: { body: string; author_association: string };
}

export async function githubWebhook(req: Request, res: Response) {
  const secret = env.GITHUB_WEBHOOK_SECRET;
  if (!secret) throw new HttpError(503, "GitHub webhooks are not configured");
  const raw = rawBody(req);
  const expected = `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`;
  if (!safeEqual(req.get("x-hub-signature-256") ?? "", expected)) {
    throw new HttpError(401, "Invalid signature");
  }

  const event = req.get("x-github-event");
  const payload = parse<GitHubPayload>(raw);

  if (event === "ping") return res.json({ outcome: "pong" });

  if (event === "installation" && payload.action === "deleted" && payload.installation) {
    const { count } = await prisma.forgeConnection.deleteMany({
      where: { provider: "github", installationId: String(payload.installation.id) },
    });
    return res.status(202).json({ outcome: "uninstalled", connections: count });
  }

  const isPush = event === "pull_request" && GITHUB_PR_ACTIONS.has(payload.action ?? "");
  const isCommand =
    event === "issue_comment" &&
    payload.action === "created" &&
    Boolean(payload.issue?.pull_request) &&
    COMMAND.test(payload.comment?.body ?? "");
  if (!isPush && !isCommand) return res.status(202).json({ outcome: "ignored" });
  if (!payload.repository || !payload.installation) throw new HttpError(400, "Missing repository or installation");

  // Several Bammy users may share one installation; the earliest enabled
  // repository owns automatic reviews so a PR is never reviewed twice.
  const repo = await prisma.repository.findFirst({
    where: {
      provider: "github",
      externalId: String(payload.repository.id),
      enabled: true,
      connection: { installationId: String(payload.installation.id) },
    },
    orderBy: { createdAt: "asc" },
    include: { connection: true },
  });
  if (!repo) return res.status(202).json({ outcome: "not_enabled" });

  if (isPush) {
    const pull = payload.pull_request!;
    const result = await enqueueFromWebhook({
      repositoryId: repo.id,
      number: pull.number,
      headSha: pull.head.sha,
      trigger: "webhook",
    });
    return res.status(202).json(result.queued ? { outcome: "queued", reviewId: result.job.id } : { outcome: result.reason });
  }

  if (!GITHUB_TRUSTED.has(payload.comment!.author_association)) {
    return res.status(202).json({ outcome: "not_allowed" });
  }
  const number = payload.issue!.number;
  const head = await adapterForConnection(repo.connection).getChangeHead(repo.fullPath, number);
  const job = await enqueue({ repositoryId: repo.id, number, headSha: head.headSha, trigger: "comment" });
  res.status(202).json({ outcome: "queued", reviewId: job.id });
}

interface GitLabPayload {
  object_kind?: string;
  user?: { id: number };
  object_attributes?: {
    action?: string;
    iid?: number;
    oldrev?: string;
    noteable_type?: string;
    note?: string;
    last_commit?: { id: string };
  };
  merge_request?: { iid: number; last_commit: { id: string } };
}

export async function gitlabWebhook(req: Request, res: Response) {
  const repo = await prisma.repository.findUnique({
    where: { id: String(req.params.repoId) },
    include: { connection: true },
  });
  const secret = repo ? webhookSecret(repo) : null;
  // The same answer for an unknown repository and a wrong token, so the URL
  // cannot be used to probe which repositories exist.
  if (!repo || !secret || !safeEqual(req.get("x-gitlab-token") ?? "", secret)) {
    throw new HttpError(401, "Invalid token");
  }
  const raw = rawBody(req);
  if (!repo.enabled) return res.status(202).json({ outcome: "not_enabled" });

  const event = req.get("x-gitlab-event");
  const payload = parse<GitLabPayload>(raw);
  const attrs = payload.object_attributes ?? {};

  if (event === "Merge Request Hook") {
    // An update only matters when it brought new commits (oldrev is set).
    const relevant = attrs.action === "open" || attrs.action === "reopen" || (attrs.action === "update" && attrs.oldrev);
    if (!relevant || !attrs.iid || !attrs.last_commit) return res.status(202).json({ outcome: "ignored" });
    const result = await enqueueFromWebhook({
      repositoryId: repo.id,
      number: attrs.iid,
      headSha: attrs.last_commit.id,
      trigger: "webhook",
    });
    return res.status(202).json(result.queued ? { outcome: "queued", reviewId: result.job.id } : { outcome: result.reason });
  }

  if (event === "Note Hook" && attrs.noteable_type === "MergeRequest" && COMMAND.test(attrs.note ?? "")) {
    const mr = payload.merge_request;
    if (!mr || !payload.user) return res.status(202).json({ outcome: "ignored" });
    const adapter = adapterForConnection(repo.connection);
    // GitLab's note payload does not say what the author may do; ask.
    const level = adapter instanceof GitLabAdapter ? await adapter.memberAccessLevel(repo.externalId, payload.user.id) : 0;
    if (level < GITLAB_DEVELOPER) return res.status(202).json({ outcome: "not_allowed" });
    const job = await enqueue({ repositoryId: repo.id, number: mr.iid, headSha: mr.last_commit.id, trigger: "comment" });
    return res.status(202).json({ outcome: "queued", reviewId: job.id });
  }

  res.status(202).json({ outcome: "ignored" });
}
