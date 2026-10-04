import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma.ts";
import type { InlineComment } from "../src/review/forge/types.ts";
import type { Forge } from "../src/services/forge.ts";
import { claimNext, enqueue } from "../src/worker/queue.ts";
import { runJob, type RunJobDeps } from "../src/worker/runJob.ts";
import { makeChangeSet } from "./helpers/changeSet.ts";
import { WALKTHROUGH, fakeModel, modelFinding } from "./helpers/model.ts";

let repositoryId: string;

beforeEach(async () => {
  await prisma.user.deleteMany();
  const user = await prisma.user.create({ data: { name: "W", email: "w@example.com", passwordHash: "x" } });
  const connection = await prisma.forgeConnection.create({
    data: { userId: user.id, provider: "github", host: "github.com", kind: "github_app", installationId: "1", accountLogin: "acme" },
  });
  const repo = await prisma.repository.create({
    data: {
      connectionId: connection.id,
      provider: "github",
      host: "github.com",
      fullPath: "acme/web",
      externalId: "1",
      defaultBranch: "main",
      enabled: true,
      settings: { review: { blockOn: "major" } },
    },
  });
  repositoryId = repo.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

interface Published {
  inline: { fingerprint: string; startLine: number }[];
  summaries: string[];
  statuses: string[];
}

function deps(
  files: Record<string, string>,
  answers: Parameters<typeof fakeModel>[0],
  keys = { anthropic: "k" },
  options: { failSummary?: boolean; onForge?: string[] } = {},
) {
  const reads: string[] = [];
  const published: Published = { inline: [], summaries: [], statuses: [] };
  const forge = {
    getChange: async () => ({ ...makeChangeSet(), forgeRef: { ...makeChangeSet().forgeRef, headSha: "newhead" } }),
    getFileAtRef: async (_p: string, path: string, ref: string) => {
      reads.push(`${ref}:${path}`);
      return files[`${ref}:${path}`] ?? null;
    },
    listPostedFingerprints: async () => new Set(options.onForge ?? []),
    postInlineComments: async (_ref: unknown, comments: InlineComment[]) => {
      published.inline.push(...comments.map((c) => ({ fingerprint: c.fingerprint, startLine: c.startLine })));
      return { posted: comments.map((c) => ({ fingerprint: c.fingerprint, forgeCommentId: `c-${c.fingerprint}` })), failed: [] };
    },
    upsertSummaryComment: async (_ref: unknown, body: string) => {
      if (options.failSummary && !body.includes("Reviewing")) throw new Error("403 Forbidden");
      published.summaries.push(body);
      return "note-1";
    },
    setCommitStatus: async (_ref: unknown, status: { state: string }) => {
      published.statuses.push(status.state);
    },
  } as unknown as Forge;
  const model = fakeModel(answers);
  const runDeps: RunJobDeps = {
    adapterFor: () => forge,
    generateFor: () => model.generate,
    apiKeysFor: async () => keys,
  };
  return { runDeps, reads, model, published };
}

async function claimedJob() {
  await enqueue({ repositoryId, number: 42, headSha: "oldhead", trigger: "manual" });
  return (await claimNext())!;
}

describe("runJob", () => {
  it("reviews the change and stores result, verdict, config and the actual head", async () => {
    const job = await claimedJob();
    const { runDeps, reads } = deps(
      { "base:.bammy.yaml": "output:\n  walkthrough: true\n" },
      { code_review: { findings: [modelFinding()] }, walkthrough: WALKTHROUGH },
    );

    await runJob(job, runDeps);

    const stored = await prisma.reviewJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(stored).toMatchObject({ status: "completed", verdict: "blocked", headSha: "newhead", baseSha: "base", error: null });
    expect(stored.lockedAt).toBeNull();
    const result = stored.result as { findings: unknown[]; verdict: { blockOn: string } };
    expect(result.findings).toHaveLength(1);
    // blockOn came from the saved repository settings.
    expect(result.verdict.blockOn).toBe("major");
    expect(stored.resolvedConfig).toMatchObject({ repoFile: ".bammy.yaml", sources: { "review.blockOn": "repoSettings" } });
    // The repository file is read at the base revision, never the head.
    expect(reads).toEqual(["base:.bammy.yaml"]);
  });

  it("stores a failed review as failed with its errors", async () => {
    const job = await claimedJob();
    const { runDeps } = deps({}, { code_review: new Error("provider down"), walkthrough: WALKTHROUGH });

    await runJob(job, runDeps);

    const stored = await prisma.reviewJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(stored).toMatchObject({ status: "failed", verdict: "error", error: "Review pass 1 failed: provider down" });
  });

  it("refuses to run without a key for the configured model", async () => {
    const job = await claimedJob();
    const { runDeps, model } = deps({}, {}, {} as never);

    await expect(runJob(job, runDeps)).rejects.toThrow(/No API key for anthropic/);
    expect(model.requests).toHaveLength(0);
  });

  it("skips fallback models with no key, with a warning", async () => {
    const job = await claimedJob();
    await prisma.repository.update({
      where: { id: repositoryId },
      data: { settings: { llm: { fallbackModels: ["openai/gpt-5"] } } },
    });
    const { runDeps } = deps({}, { code_review: { findings: [] }, walkthrough: WALKTHROUGH });

    await runJob(job, runDeps);

    const stored = await prisma.reviewJob.findUniqueOrThrow({ where: { id: job.id } });
    expect((stored.result as { warnings: string[] }).warnings).toEqual([
      "Fallback model openai/gpt-5 skipped: no API key for its provider",
    ]);
  });

  it("posts progress first, then inline comments, the summary and the status", async () => {
    const job = await claimedJob();
    const { runDeps, published } = deps({}, { code_review: { findings: [modelFinding()] }, walkthrough: WALKTHROUGH });

    await runJob(job, runDeps);

    expect(published.summaries).toHaveLength(2);
    expect(published.summaries[0]).toContain("Reviewing `newhead`");
    expect(published.summaries[1]).toContain("## Bammy review");
    expect(published.statuses).toEqual(["pending", "failure"]);
    expect(published.inline).toHaveLength(1);

    const stored = await prisma.reviewJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(stored.publication).toMatchObject({ summaryCommentId: "note-1", statusState: "failure", errors: [] });
    expect(await prisma.postedFinding.count({ where: { repositoryId, number: 42 } })).toBe(1);
  });

  it("never posts the same finding twice across runs", async () => {
    const answers = { code_review: { findings: [modelFinding()] }, walkthrough: WALKTHROUGH };
    await runJob(await claimedJob(), deps({}, answers).runDeps);

    const second = deps({}, answers);
    await enqueue({ repositoryId, number: 42, headSha: "again", trigger: "manual" });
    await runJob((await claimNext())!, second.runDeps);

    expect(second.published.inline).toEqual([]);
    expect(await prisma.postedFinding.count()).toBe(1);
  });

  it("trusts markers already on the forge when the database has no row", async () => {
    const answers = { code_review: { findings: [modelFinding()] }, walkthrough: WALKTHROUGH };
    const first = deps({}, answers);
    await runJob(await claimedJob(), first.runDeps);
    await prisma.postedFinding.deleteMany();

    const second = deps({}, answers, { anthropic: "k" }, { onForge: [first.published.inline[0]!.fingerprint] });
    await enqueue({ repositoryId, number: 42, headSha: "again", trigger: "manual" });
    await runJob((await claimNext())!, second.runDeps);

    expect(second.published.inline).toEqual([]);
  });

  it("marks the job partial when publishing fails, keeping the result", async () => {
    const job = await claimedJob();
    const { runDeps, published } = deps(
      {},
      { code_review: { findings: [] }, walkthrough: WALKTHROUGH },
      { anthropic: "k" },
      { failSummary: true },
    );

    await runJob(job, runDeps);

    const stored = await prisma.reviewJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(stored).toMatchObject({ status: "partial", verdict: "pass", error: "Summary comment failed: 403 Forbidden" });
    expect(stored.result).not.toBeNull();
    // The status still went out even though the summary did not.
    expect(published.statuses).toEqual(["pending", "success"]);
  });

  it("publishes nothing when every output is turned off", async () => {
    await prisma.repository.update({
      where: { id: repositoryId },
      data: { settings: { output: { postInline: false, postSummary: false, postCheck: false } } },
    });
    const job = await claimedJob();
    const { runDeps, published } = deps({}, { code_review: { findings: [modelFinding()] }, walkthrough: WALKTHROUGH });

    await runJob(job, runDeps);

    expect(published).toEqual({ inline: [], summaries: [], statuses: [] });
    const stored = await prisma.reviewJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(stored.publication).toBeNull();
  });
});
