import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma.ts";
import { claimNext, complete, enqueue, enqueueFromWebhook, fail, recoverStale } from "../src/worker/queue.ts";

let repositoryId: string;

beforeEach(async () => {
  await prisma.user.deleteMany();
  const user = await prisma.user.create({
    data: { name: "Queue Test", email: "queue@example.com", passwordHash: "x" },
  });
  const connection = await prisma.forgeConnection.create({
    data: {
      userId: user.id,
      provider: "github",
      host: "github.com",
      kind: "github_app",
      installationId: "1",
      accountLogin: "acme",
    },
  });
  const repository = await prisma.repository.create({
    data: {
      connectionId: connection.id,
      provider: "github",
      host: "github.com",
      fullPath: "acme/web",
      externalId: "100",
      defaultBranch: "main",
      enabled: true,
    },
  });
  repositoryId = repository.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

const job = (headSha: string, number = 7) =>
  enqueue({ repositoryId, number, headSha, trigger: "webhook" });

describe("enqueue", () => {
  it("returns the existing job for the same head instead of duplicating it", async () => {
    const first = await job("aaa");
    const second = await job("aaa");

    expect(second.id).toBe(first.id);
    expect(await prisma.reviewJob.count()).toBe(1);
  });

  it("supersedes a queued job when a newer head arrives", async () => {
    const old = await job("aaa");
    const latest = await job("bbb");

    expect((await prisma.reviewJob.findUniqueOrThrow({ where: { id: old.id } })).status).toBe(
      "superseded",
    );
    expect(latest.status).toBe("queued");
  });

  it("leaves other pull requests alone", async () => {
    const other = await job("aaa", 8);
    await job("bbb", 7);

    expect((await prisma.reviewJob.findUniqueOrThrow({ where: { id: other.id } })).status).toBe(
      "queued",
    );
  });
});

describe("claimNext", () => {
  it("claims the oldest queued job and marks it running", async () => {
    const first = await job("aaa", 1);
    await job("bbb", 2);

    const claimed = await claimNext();

    expect(claimed?.id).toBe(first.id);
    expect(claimed?.status).toBe("running");
    expect(claimed?.attempts).toBe(1);
    expect(claimed?.lockedAt).toBeInstanceOf(Date);
  });

  it("never hands the same job to two concurrent claims", async () => {
    await Promise.all([1, 2, 3].map((n) => job(`sha${n}`, n)));

    const claims = await Promise.all(Array.from({ length: 6 }, () => claimNext()));
    const ids = claims.filter((c) => c !== null).map((c) => c.id);

    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(3);
  });

  it("returns null when nothing is queued", async () => {
    expect(await claimNext()).toBeNull();
  });
});

describe("complete and fail", () => {
  it("stores the result and verdict and releases the lock", async () => {
    await job("aaa");
    const claimed = (await claimNext())!;

    await complete(claimed.id, {
      status: "completed",
      verdict: "blocked",
      result: { findings: [{ title: "x" }] },
    });

    const stored = await prisma.reviewJob.findUniqueOrThrow({ where: { id: claimed.id } });
    expect(stored).toMatchObject({ status: "completed", verdict: "blocked", lockedAt: null });
    expect(stored.result).toEqual({ findings: [{ title: "x" }] });
    expect(stored.finishedAt).toBeInstanceOf(Date);
  });

  it("records a failure as an error verdict", async () => {
    await job("aaa");
    const claimed = (await claimNext())!;

    await fail(claimed.id, "boom");

    const stored = await prisma.reviewJob.findUniqueOrThrow({ where: { id: claimed.id } });
    expect(stored).toMatchObject({ status: "failed", verdict: "error", error: "boom" });
  });
});

describe("recoverStale", () => {
  it("requeues a stale job with attempts left and fails one without", async () => {
    const retry = await job("aaa", 1);
    const exhausted = await job("bbb", 2);
    const longAgo = new Date(Date.now() - 60 * 60 * 1000);
    await prisma.reviewJob.update({
      where: { id: retry.id },
      data: { status: "running", lockedAt: longAgo, attempts: 1 },
    });
    await prisma.reviewJob.update({
      where: { id: exhausted.id },
      data: { status: "running", lockedAt: longAgo, attempts: 3 },
    });

    expect(await recoverStale(15 * 60 * 1000, 3)).toBe(2);
    expect((await prisma.reviewJob.findUniqueOrThrow({ where: { id: retry.id } })).status).toBe(
      "queued",
    );
    expect(
      await prisma.reviewJob.findUniqueOrThrow({ where: { id: exhausted.id } }),
    ).toMatchObject({ status: "failed", verdict: "error" });
  });

  it("leaves a fresh running job alone", async () => {
    await job("aaa");
    await claimNext();

    expect(await recoverStale(15 * 60 * 1000, 3)).toBe(0);
  });
});

describe("per-user concurrency", () => {
  it("skips a user at their running limit and serves the next user", async () => {
    const other = await prisma.user.create({ data: { name: "O", email: "o@example.com", passwordHash: "x" } });
    const conn = await prisma.forgeConnection.create({
      data: { userId: other.id, provider: "gitlab", host: "gitlab.com", kind: "token", accountLogin: "o" },
    });
    const otherRepo = await prisma.repository.create({
      data: { connectionId: conn.id, provider: "gitlab", host: "gitlab.com", fullPath: "o/r", externalId: "2", defaultBranch: "main" },
    });
    await job("a", 1);
    await job("b", 2);
    const theirs = await enqueue({ repositoryId: otherRepo.id, number: 1, headSha: "c", trigger: "manual" });

    expect((await claimNext(1))?.number).toBe(1);
    // The first user is at their limit of one, so their second job waits.
    expect((await claimNext(1))?.id).toBe(theirs.id);
    expect(await claimNext(1)).toBeNull();
  });
});

describe("enqueueFromWebhook", () => {
  it("refuses a head it has seen in any state but superseded", async () => {
    const done = await job("aaa");
    await prisma.reviewJob.update({ where: { id: done.id }, data: { status: "failed" } });
    expect(await enqueueFromWebhook({ repositoryId, number: 7, headSha: "aaa", trigger: "webhook" })).toEqual({
      queued: false,
      reason: "duplicate",
    });
  });

  it("stops queueing once a repository's queue is full", async () => {
    for (let n = 1; n <= 10; n++) await job(`s${n}`, n);
    expect(await enqueueFromWebhook({ repositoryId, number: 99, headSha: "z", trigger: "webhook" })).toEqual({
      queued: false,
      reason: "queue_full",
    });
  });
});
