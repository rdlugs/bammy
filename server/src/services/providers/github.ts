import { createHmac } from "node:crypto";
import { env } from "../../config/env.ts";
import { decrypt } from "../../lib/crypto.ts";
import { HttpError } from "../../lib/httpError.ts";
import { parseJson, REVIEW_COMMAND, safeEqual } from "../../lib/webhook.ts";
import type { ForgeConnection } from "../../generated/prisma/client.ts";
import { GitHubAdapter } from "../../review/forge/github.ts";
import { githubConnectSchema } from "../../schemas/connections.schema.ts";
import { enqueue, enqueueFromWebhook } from "../../worker/queue.ts";
import { getGitHubApp, githubConfigured } from "../githubApp.ts";
import type { HeaderReader, ProviderDefinition, RepoWithConnection, WebhookOutcome } from "./types.ts";

const PR_ACTIONS = new Set(["opened", "synchronize", "reopened", "ready_for_review"]);
// Who may ask for a review in a comment: people who can already push.
const TRUSTED = new Set(["OWNER", "MEMBER", "COLLABORATOR"]);

export interface GitHubPayload {
  action?: string;
  installation?: { id: number };
  repository?: { id: number };
  pull_request?: { number: number; head: { sha: string } };
  issue?: { number: number; pull_request?: unknown };
  comment?: { body: string; author_association: string };
}

function adapterFor(connection: ForgeConnection): GitHubAdapter {
  if (connection.kind === "token") {
    const encryptedToken = connection.encryptedToken;
    if (!encryptedToken) {
      throw new HttpError(500, "GitHub connection has no token");
    }
    return new GitHubAdapter({
      host: connection.host,
      token: async () => decrypt(encryptedToken),
      selfLogin: connection.accountLogin,
      repoSource: "user",
    });
  }

  const app = getGitHubApp();
  const installationId = connection.installationId;
  if (!app || !installationId) {
    throw new HttpError(503, "GitHub is not configured on this server");
  }
  return new GitHubAdapter({
    host: connection.host,
    token: () => app.installationToken(installationId),
    account: async () => ({ login: connection.accountLogin }),
    // An app posts as "<slug>[bot]", not as the account it is installed on.
    selfLogin: env.GITHUB_APP_SLUG ? `${env.GITHUB_APP_SLUG}[bot]` : undefined,
  });
}

export function verifyGithubSignature(header: HeaderReader, raw: Buffer, secret: string): boolean {
  const expected = `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`;
  return safeEqual(header("x-hub-signature-256") ?? "", expected);
}

function isPullRequestPush(event: string | undefined, payload: GitHubPayload): boolean {
  return event === "pull_request" && PR_ACTIONS.has(payload.action ?? "");
}

function isReviewCommand(event: string | undefined, payload: GitHubPayload): boolean {
  return (
    event === "issue_comment" &&
    payload.action === "created" &&
    Boolean(payload.issue?.pull_request) &&
    REVIEW_COMMAND.test(payload.comment?.body ?? "")
  );
}

export function isGithubReviewEvent(event: string | undefined, payload: GitHubPayload): boolean {
  return isPullRequestPush(event, payload) || isReviewCommand(event, payload);
}

// Shared by the app's webhook and per-repository hooks once the repository is
// known and the event is one isGithubReviewEvent accepts.
export async function handleGithubEvent(
  repo: RepoWithConnection,
  event: string | undefined,
  payload: GitHubPayload,
): Promise<WebhookOutcome> {
  if (isPullRequestPush(event, payload)) {
    const pull = payload.pull_request!;
    const result = await enqueueFromWebhook({
      repositoryId: repo.id,
      number: pull.number,
      headSha: pull.head.sha,
      trigger: "webhook",
    });
    return { body: result.queued ? { outcome: "queued", reviewId: result.job.id } : { outcome: result.reason } };
  }

  if (!TRUSTED.has(payload.comment!.author_association)) {
    return { body: { outcome: "not_allowed" } };
  }
  const number = payload.issue!.number;
  const head = await adapterFor(repo.connection).getChangeHead(repo.fullPath, number);
  const job = await enqueue({ repositoryId: repo.id, number, headSha: head.headSha, trigger: "comment" });
  return { body: { outcome: "queued", reviewId: job.id } };
}

export const githubProvider: ProviderDefinition = {
  adapterFor,

  // GitHub.com connects through the app; a token is for Enterprise Server.
  tokenConnect: {
    schema: githubConnectSchema,
    account: (host, token) => new GitHubAdapter({ host, token: async () => token }).currentAccount(),
  },

  appAvailable: githubConfigured,

  // The app delivers every installation's events to its single webhook.
  appWebhook(connection) {
    if (connection.kind !== "github_app") return null;
    return env.GITHUB_WEBHOOK_SECRET
      ? { active: true }
      : { active: false, error: "GITHUB_WEBHOOK_SECRET is not set on this server" };
  },

  repoWebhook: {
    verify: verifyGithubSignature,
    async handle(repo, header, raw) {
      const event = header("x-github-event");
      const payload = parseJson<GitHubPayload>(raw);
      if (event === "ping") return { status: 200, body: { outcome: "pong" } };
      if (!repo.enabled) return { body: { outcome: "not_enabled" } };
      if (!isGithubReviewEvent(event, payload)) return { body: { outcome: "ignored" } };
      return handleGithubEvent(repo, event, payload);
    },
  },
};
