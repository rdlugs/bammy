import { createHmac } from "node:crypto";
import request from "supertest";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../src/app.ts";
import { encrypt } from "../src/lib/crypto.ts";
import { prisma } from "../src/lib/prisma.ts";
import { fetchStub } from "./helpers/fetchStub.ts";
import { createUser } from "./helpers/users.ts";

const SECRET = "webhook-secret";
let userId: string;

async function githubRepo(owner = userId, enabled = true) {
  const connection = await prisma.forgeConnection.create({
    data: { userId: owner, provider: "github", host: "github.com", kind: "github_app", installationId: "55", accountLogin: "acme" },
  });
  return prisma.repository.create({
    data: {
      connectionId: connection.id,
      provider: "github",
      host: "github.com",
      fullPath: "acme/web",
      externalId: "900",
      defaultBranch: "main",
      enabled,
    },
  });
}

async function gitlabRepo() {
  const connection = await prisma.forgeConnection.create({
    data: {
      userId,
      provider: "gitlab",
      host: "gitlab.com",
      kind: "token",
      accountLogin: "bot",
      encryptedToken: encrypt("glpat"),
    },
  });
  return prisma.repository.create({
    data: {
      connectionId: connection.id,
      provider: "gitlab",
      host: "gitlab.com",
      fullPath: "team/app",
      externalId: "77",
      defaultBranch: "main",
      enabled: true,
      webhookId: "h1",
      encryptedWebhookSecret: encrypt("gl-secret"),
    },
  });
}

function sendGithub(event: string, payload: unknown, secret = SECRET) {
  const body = JSON.stringify(payload);
  const signature = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
  return request(app)
    .post("/api/webhooks/github")
    .set("Content-Type", "application/json")
    .set("X-GitHub-Event", event)
    .set("X-Hub-Signature-256", signature)
    .send(body);
}

const prEvent = (action: string, sha = "sha1") => ({
  action,
  installation: { id: 55 },
  repository: { id: 900 },
  pull_request: { number: 42, head: { sha } },
});

beforeEach(async () => {
  await prisma.user.deleteMany();
  ({ user: { id: userId } } = await createUser());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("POST /api/webhooks/github", () => {
  it("rejects a bad signature without touching anything", async () => {
    await githubRepo();
    const res = await sendGithub("pull_request", prEvent("opened"), "wrong-secret");
    expect(res.status).toBe(401);
    expect(await prisma.reviewJob.count()).toBe(0);
  });

  it("answers GitHub's ping", async () => {
    const res = await sendGithub("ping", { zen: "Keep it simple" });
    expect(res.status).toBe(200);
    expect(res.body.outcome).toBe("pong");
  });

  it("queues a webhook review when a pull request opens, once per head", async () => {
    await githubRepo();

    const first = await sendGithub("pull_request", prEvent("opened"));
    const redelivery = await sendGithub("pull_request", prEvent("opened"));

    expect(first.status).toBe(202);
    expect(first.body.outcome).toBe("queued");
    expect(redelivery.body.outcome).toBe("duplicate");
    expect(await prisma.reviewJob.findMany({ select: { number: true, headSha: true, trigger: true } })).toEqual([
      { number: 42, headSha: "sha1", trigger: "webhook" },
    ]);
  });

  it("does not re-review a head that was already reviewed", async () => {
    const repo = await githubRepo();
    await prisma.reviewJob.create({
      data: { repositoryId: repo.id, number: 42, headSha: "sha1", trigger: "webhook", status: "completed" },
    });

    expect((await sendGithub("pull_request", prEvent("synchronize"))).body.outcome).toBe("duplicate");
    expect((await sendGithub("pull_request", prEvent("synchronize", "sha2"))).body.outcome).toBe("queued");
  });

  it("ignores repositories that are not enabled and events it does not handle", async () => {
    await githubRepo(userId, false);
    expect((await sendGithub("pull_request", prEvent("opened"))).body.outcome).toBe("not_enabled");
    expect((await sendGithub("pull_request", prEvent("closed"))).body.outcome).toBe("ignored");
    expect((await sendGithub("push", {})).body.outcome).toBe("ignored");
    expect(await prisma.reviewJob.count()).toBe(0);
  });

  it("reviews a shared installation's PR once, for the earliest enabled repository", async () => {
    const first = await githubRepo();
    const other = await createUser("other@example.com");
    await githubRepo(other.user.id);

    await sendGithub("pull_request", prEvent("opened"));

    const jobs = await prisma.reviewJob.findMany();
    expect(jobs).toHaveLength(1);
    expect(jobs[0]!.repositoryId).toBe(first.id);
  });

  const commentEvent = (association: string, body = "Looks odd.\n/bammy review please") => ({
    action: "created",
    installation: { id: 55 },
    repository: { id: 900 },
    issue: { number: 42, pull_request: {} },
    comment: { body, author_association: association },
  });

  it("queues a review for /bammy review from a collaborator at the current head", async () => {
    await githubRepo();
    vi.stubGlobal(
      "fetch",
      fetchStub([
        {
          method: "POST",
          url: /\/app\/installations\/55\/access_tokens$/,
          body: { token: "inst", expires_at: new Date(Date.now() + 3600_000).toISOString() },
        },
        { url: /\/repos\/acme\/web\/pulls\/42$/, body: { state: "open", title: "T", head: { sha: "headnow" } } },
      ]).fetch,
    );

    const res = await sendGithub("issue_comment", commentEvent("COLLABORATOR"));

    expect(res.body.outcome).toBe("queued");
    expect(await prisma.reviewJob.findFirst()).toMatchObject({ trigger: "comment", headSha: "headnow" });
  });

  it("ignores the command from someone without push access, and comments without it", async () => {
    await githubRepo();
    expect((await sendGithub("issue_comment", commentEvent("NONE"))).body.outcome).toBe("not_allowed");
    expect((await sendGithub("issue_comment", commentEvent("OWNER", "nice work"))).body.outcome).toBe("ignored");
    expect(await prisma.reviewJob.count()).toBe(0);
  });

  it("forgets an installation when the app is uninstalled", async () => {
    await githubRepo();
    const res = await sendGithub("installation", { action: "deleted", installation: { id: 55 } });
    expect(res.body).toEqual({ outcome: "uninstalled", connections: 1 });
    expect(await prisma.repository.count()).toBe(0);
  });
});

function sendGitlab(repoId: string, event: string, payload: unknown, token = "gl-secret") {
  return request(app)
    .post(`/api/webhooks/gitlab/${repoId}`)
    .set("Content-Type", "application/json")
    .set("X-Gitlab-Event", event)
    .set("X-Gitlab-Token", token)
    .send(JSON.stringify(payload));
}

const mrEvent = (action: string, extra: Record<string, unknown> = {}) => ({
  object_kind: "merge_request",
  object_attributes: { action, iid: 7, last_commit: { id: "glsha" }, ...extra },
});

describe("POST /api/webhooks/gitlab/:repoId", () => {
  it("rejects a wrong token and an unknown repository alike", async () => {
    const repo = await gitlabRepo();
    expect((await sendGitlab(repo.id, "Merge Request Hook", mrEvent("open"), "nope")).status).toBe(401);
    expect((await sendGitlab("00000000-0000-4000-8000-000000000000", "Merge Request Hook", mrEvent("open"))).status).toBe(401);
  });

  it("queues on open, and on update only when new commits arrived", async () => {
    const repo = await gitlabRepo();

    expect((await sendGitlab(repo.id, "Merge Request Hook", mrEvent("update"))).body.outcome).toBe("ignored");
    expect((await sendGitlab(repo.id, "Merge Request Hook", mrEvent("open"))).body.outcome).toBe("queued");
    expect(
      (await sendGitlab(repo.id, "Merge Request Hook", mrEvent("update", { oldrev: "x", last_commit: { id: "next" } }))).body
        .outcome,
    ).toBe("queued");
    expect(await prisma.reviewJob.count({ where: { status: { not: "superseded" } } })).toBe(1);
  });

  const noteEvent = { object_kind: "note", user: { id: 5 }, object_attributes: { noteable_type: "MergeRequest", note: "/bammy review" }, merge_request: { iid: 7, last_commit: { id: "glsha" } } };

  it("accepts the command from a developer and refuses a reporter", async () => {
    const repo = await gitlabRepo();
    let level = 30;
    vi.stubGlobal(
      "fetch",
      fetchStub([
        {
          url: /\/projects\/77\/members\/all\/5$/,
          get body() {
            return { access_level: level };
          },
        },
      ]).fetch,
    );

    expect((await sendGitlab(repo.id, "Note Hook", noteEvent)).body.outcome).toBe("queued");
    level = 20;
    await prisma.reviewJob.deleteMany();
    expect((await sendGitlab(repo.id, "Note Hook", noteEvent)).body.outcome).toBe("not_allowed");
  });
});
