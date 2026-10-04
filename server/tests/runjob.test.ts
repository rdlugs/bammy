import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma.ts";
import type { ForgeAdapter } from "../src/review/forge/types.ts";
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

function deps(files: Record<string, string>, answers: Parameters<typeof fakeModel>[0], keys = { anthropic: "k" }) {
  const reads: string[] = [];
  const adapter = {
    getChange: async () => ({ ...makeChangeSet(), forgeRef: { ...makeChangeSet().forgeRef, headSha: "newhead" } }),
    getFileAtRef: async (_p: string, path: string, ref: string) => {
      reads.push(`${ref}:${path}`);
      return files[`${ref}:${path}`] ?? null;
    },
  } as unknown as ForgeAdapter;
  const model = fakeModel(answers);
  const runDeps: RunJobDeps = {
    adapterFor: () => adapter,
    generateFor: () => model.generate,
    apiKeysFor: async () => keys,
  };
  return { runDeps, reads, model };
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
});
