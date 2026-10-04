import request from "supertest";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../src/app.ts";
import { encrypt } from "../src/lib/crypto.ts";
import { prisma } from "../src/lib/prisma.ts";
import { summarize } from "../src/review/render/json.ts";
import { toMarkdown } from "../src/review/render/markdown.ts";
import { fetchStub } from "./helpers/fetchStub.ts";
import { sampleResult } from "./helpers/result.ts";
import { createUser } from "./helpers/users.ts";

let cookie: string;
let repoId: string;

const MR_URL = "https://gitlab.com/Team/Web/-/merge_requests/7";
const mrRoute = (sha = "abc123") => ({
  url: /\/api\/v4\/projects\/team%2Fweb\/merge_requests\/7$/,
  body: { state: "opened", sha, title: "T", diff_refs: { base_sha: "b", start_sha: "s", head_sha: sha } },
});

beforeEach(async () => {
  await prisma.user.deleteMany();
  const created = await createUser();
  cookie = created.cookie;
  const connection = await prisma.forgeConnection.create({
    data: {
      userId: created.user.id,
      provider: "gitlab",
      host: "gitlab.com",
      kind: "token",
      accountLogin: "dev",
      encryptedToken: encrypt("glpat"),
    },
  });
  const repo = await prisma.repository.create({
    data: {
      connectionId: connection.id,
      provider: "gitlab",
      host: "gitlab.com",
      fullPath: "team/web",
      externalId: "1",
      defaultBranch: "main",
      enabled: true,
    },
  });
  repoId = repo.id;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function completedJob(number = 7) {
  const result = await sampleResult();
  return prisma.reviewJob.create({
    data: {
      repositoryId: repoId,
      number,
      headSha: "head",
      trigger: "manual",
      status: "completed",
      verdict: "blocked",
      result,
      summary: summarize(result) as object,
    },
  });
}

describe("POST /api/reviews", () => {
  it("queues a review of the PR's current head", async () => {
    vi.stubGlobal("fetch", fetchStub([mrRoute("abc123")]).fetch);

    const res = await request(app).post("/api/reviews").set("Cookie", cookie).send({ url: MR_URL });

    expect(res.status).toBe(202);
    expect(res.body.review).toMatchObject({
      number: 7,
      headSha: "abc123",
      status: "queued",
      trigger: "manual",
      repository: { fullPath: "team/web" },
    });
  });

  it("returns the same job when that head is already queued", async () => {
    vi.stubGlobal("fetch", fetchStub([mrRoute()]).fetch);

    const first = await request(app).post("/api/reviews").set("Cookie", cookie).send({ url: MR_URL });
    const second = await request(app).post("/api/reviews").set("Cookie", cookie).send({ url: MR_URL });

    expect(second.body.review.id).toBe(first.body.review.id);
  });

  it("rejects a URL that is not a pull or merge request", async () => {
    const res = await request(app).post("/api/reviews").set("Cookie", cookie).send({ url: "https://gitlab.com/team/web" });
    expect(res.status).toBe(400);
  });

  it("404s for a repository that is not connected and 409s for a disabled one", async () => {
    const missing = await request(app)
      .post("/api/reviews")
      .set("Cookie", cookie)
      .send({ url: "https://gitlab.com/team/other/-/merge_requests/1" });
    expect(missing.status).toBe(404);

    await prisma.repository.update({ where: { id: repoId }, data: { enabled: false } });
    const disabled = await request(app).post("/api/reviews").set("Cookie", cookie).send({ url: MR_URL });
    expect(disabled.status).toBe(409);
  });

  it("does not let another user review through someone else's connection", async () => {
    const other = await createUser("other@example.com");
    const res = await request(app).post("/api/reviews").set("Cookie", other.cookie).send({ url: MR_URL });
    expect(res.status).toBe(404);
  });
});

describe("GET /api/reviews", () => {
  it("lists newest first with a cursor and without full results", async () => {
    for (const number of [1, 2, 3]) await completedJob(number);

    const first = await request(app).get("/api/reviews?limit=2").set("Cookie", cookie);
    expect(first.status).toBe(200);
    expect(first.body.reviews.map((r: { number: number }) => r.number)).toEqual([3, 2]);
    expect(first.body.reviews[0].result).toBeUndefined();
    expect(first.body.reviews[0].summary).toMatchObject({ total: 4, hasBlocking: true });

    const second = await request(app).get(`/api/reviews?limit=2&cursor=${first.body.nextCursor}`).set("Cookie", cookie);
    expect(second.body.reviews.map((r: { number: number }) => r.number)).toEqual([1]);
    expect(second.body.nextCursor).toBeNull();
  });

  it("filters by status and hides other users' reviews", async () => {
    await completedJob();
    const other = await createUser("other@example.com");

    expect((await request(app).get("/api/reviews?status=queued").set("Cookie", cookie)).body.reviews).toEqual([]);
    expect((await request(app).get("/api/reviews").set("Cookie", other.cookie)).body.reviews).toEqual([]);
  });
});

describe("GET /api/reviews/:id and /markdown", () => {
  it("serves the result with its summary", async () => {
    const job = await completedJob();

    const res = await request(app).get(`/api/reviews/${job.id}`).set("Cookie", cookie);

    expect(res.status).toBe(200);
    expect(res.body.review.result.findings).toHaveLength(4);
    expect(res.body.review.result.summary.total).toBe(4);
    expect(res.body.review.result.usageTotals.calls).toBe(2);
  });

  it("serves exactly the document toMarkdown renders", async () => {
    const job = await completedJob();

    const res = await request(app).get(`/api/reviews/${job.id}/markdown`).set("Cookie", cookie);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/^text\/markdown/);
    expect(res.text).toBe(toMarkdown(await sampleResult()));
  });

  it("409s for markdown before there is a result", async () => {
    const job = await prisma.reviewJob.create({
      data: { repositoryId: repoId, number: 7, headSha: "h", trigger: "manual" },
    });
    const res = await request(app).get(`/api/reviews/${job.id}/markdown`).set("Cookie", cookie);
    expect(res.status).toBe(409);
  });

  it("404s for another user's review", async () => {
    const job = await completedJob();
    const other = await createUser("other@example.com");
    expect((await request(app).get(`/api/reviews/${job.id}`).set("Cookie", other.cookie)).status).toBe(404);
  });
});

describe("POST /api/reviews/:id/rerun", () => {
  it("queues a fresh review of the latest head", async () => {
    const job = await completedJob();
    vi.stubGlobal("fetch", fetchStub([mrRoute("newsha")]).fetch);

    const res = await request(app).post(`/api/reviews/${job.id}/rerun`).set("Cookie", cookie);

    expect(res.status).toBe(202);
    expect(res.body.review.id).not.toBe(job.id);
    expect(res.body.review).toMatchObject({ number: 7, headSha: "newsha", status: "queued" });
  });
});
