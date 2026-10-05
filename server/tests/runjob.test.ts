import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma.ts";
import type { InlineComment } from "../src/review/forge/types.ts";
import type { Forge } from "../src/services/forge.ts";
import { claimNext, enqueue } from "../src/worker/queue.ts";
import { runJob, skipReason, walkthroughEnabled, type RunJobDeps } from "../src/worker/runJob.ts";
import { DEFAULT_CONFIG } from "../src/review/config/schema.ts";
import { makeChangeSet } from "./helpers/changeSet.ts";
import { WALKTHROUGH, fakeModel, modelFinding } from "./helpers/model.ts";

let repositoryId: string;

beforeEach(async () => {
  await prisma.user.deleteMany();
  const user = await prisma.user.create({
    data: {
      name: "W",
      email: "w@example.com",
      passwordHash: "x",
      reviewSettings: { llm: { connection: "anthropic" } },
    },
  });
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
      followGlobal: false,
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
  descriptions: string[];
  labels: string[][];
}

function deps(
  files: Record<string, string>,
  answers: Parameters<typeof fakeModel>[0],
  keys = { anthropic: "k" },
  options: { failSummary?: boolean; onForge?: string[] } = {},
) {
  const reads: string[] = [];
  const published: Published = { inline: [], summaries: [], statuses: [], descriptions: [], labels: [] };
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
    upsertComment: async (_ref: unknown, _marker: string, body: string) => {
      published.summaries.push(body);
      return "note-2";
    },
    updateDescription: async (_ref: unknown, transform: (description: string) => string) => {
      // Like the adapters: only an actual change is written.
      const next = transform("");
      if (next !== "") published.descriptions.push(next);
    },
    setLabels: async (_ref: unknown, add: string[]) => {
      published.labels.push(add);
    },
    setCommitStatus: async (_ref: unknown, status: { state: string }) => {
      published.statuses.push(status.state);
    },
  } as unknown as Forge;
  const model = fakeModel(answers);
  const connections = Object.fromEntries(
    Object.entries(keys).map(([provider, apiKey]) => [provider, { apiKey }]),
  );
  const runDeps: RunJobDeps = {
    adapterFor: () => forge,
    generateFor: () => model.generate,
    credentialsFor: async () => ({ keys, baseUrls: {}, connections }),
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

    await expect(runJob(job, runDeps)).rejects.toThrow(/selected anthropic LLM connection no longer exists/);
    expect(model.requests).toHaveLength(0);
  });

  it("rejects a fallback that cannot use the selected official connection", async () => {
    const job = await claimedJob();
    await prisma.repository.update({
      where: { id: repositoryId },
      data: { settings: { llm: { fallbackModels: ["openai/gpt-5"] } } },
    });
    const { runDeps } = deps({}, { code_review: { findings: [] }, walkthrough: WALKTHROUGH });

    await expect(runJob(job, runDeps)).rejects.toThrow(/anthropic LLM connection.*cannot run model openai\/gpt-5/);
  });

  it("sends every model call to the endpoint with the chosen key", async () => {
    const job = await claimedJob();
    const baseUrl = "http://host.docker.internal:20128/v1";
    await prisma.repository.update({
      where: { id: repositoryId },
      data: { settings: { llm: { model: "openai/cx/gpt-5.6-sol(medium)", connection: "openai" } } },
    });
    const keys = { anthropic: "k", openai: "router-key" };
    const { runDeps, model } = deps({}, { code_review: { findings: [] }, walkthrough: WALKTHROUGH }, keys);
    const generateFor: unknown[][] = [];
    runDeps.generateFor = (...args) => {
      generateFor.push(args);
      return model.generate;
    };
    runDeps.credentialsFor = async () => ({
      keys,
      baseUrls: { openai: baseUrl },
      connections: { anthropic: { apiKey: "k" }, openai: { apiKey: "router-key", baseUrl } },
    });

    await runJob(job, runDeps);

    const stored = await prisma.reviewJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(stored.status).toBe("completed");
    expect(generateFor).toEqual([[keys, { baseUrl, apiKey: "router-key" }, { openai: baseUrl }]]);
  });

  it("refuses to run when the selected connection is not stored", async () => {
    const job = await claimedJob();
    await prisma.repository.update({
      where: { id: repositoryId },
      data: { settings: { llm: { connection: "google" } } },
    });
    const { runDeps, model } = deps({}, {});

    await expect(runJob(job, runDeps)).rejects.toThrow(/selected google LLM connection no longer exists/);
    expect(model.requests).toHaveLength(0);
  });

  it("posts progress first, then inline comments, the summary and the status", async () => {
    const job = await claimedJob();
    const { runDeps, published } = deps({}, { code_review: { findings: [modelFinding()] }, walkthrough: WALKTHROUGH });

    await runJob(job, runDeps);

    expect(published.summaries).toHaveLength(2);
    expect(published.summaries[0]).toContain("Reviewing `newhead`");
    expect(published.summaries[1]).toMatch(/^## Summary\n/);
    expect(published.statuses).toEqual(["pending", "failure"]);
    expect(published.inline).toHaveLength(1);
    // The walkthrough opens the review comment; the description is left alone.
    expect(published.descriptions).toEqual([]);
    expect(published.summaries[1]).not.toContain("### Walkthrough");
    expect(published.summaries[1]).toContain("Review effort:");

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

  it("adds the estimate labels when they are turned on", async () => {
    await prisma.repository.update({
      where: { id: repositoryId },
      data: { settings: { output: { blastRadiusLabel: true, effortLabel: true } } },
    });
    const job = await claimedJob();
    const { runDeps, published } = deps({}, { code_review: { findings: [] }, walkthrough: WALKTHROUGH });

    await runJob(job, runDeps);

    expect(published.labels).toEqual([["Small blast radius", "1-5 Minutes"]]);
    const stored = await prisma.reviewJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(stored.publication).toMatchObject({ labels: ["Small blast radius", "1-5 Minutes"], walkthroughLocation: "comment" });
  });

  it("publishes nothing when every output is turned off", async () => {
    await prisma.repository.update({
      where: { id: repositoryId },
      data: { settings: { output: { postInline: false, postSummary: false, postCheck: false, walkthrough: false } } },
    });
    const job = await claimedJob();
    const { runDeps, published } = deps({}, { code_review: { findings: [modelFinding()] }, walkthrough: WALKTHROUGH });

    await runJob(job, runDeps);

    expect(published).toEqual({ inline: [], summaries: [], statuses: [], descriptions: [], labels: [] });
    const stored = await prisma.reviewJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(stored.publication).toBeNull();
  });
});

describe("runJob with the global config", () => {
  it("applies the owner's global config beneath the repository settings", async () => {
    const repo = await prisma.repository.findUniqueOrThrow({ where: { id: repositoryId }, include: { connection: true } });
    await prisma.user.update({
      where: { id: repo.connection.userId },
      data: { reviewSettings: { llm: { connection: "anthropic" }, review: { blockOn: "minor", maxFindings: 5 } } },
    });
    const job = await claimedJob();
    const { runDeps } = deps({}, { code_review: { findings: [] }, walkthrough: WALKTHROUGH });

    await runJob(job, runDeps);

    const stored = await prisma.reviewJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(stored.resolvedConfig).toMatchObject({
      config: { review: { blockOn: "major", maxFindings: 5 } },
      sources: { "review.blockOn": "repoSettings", "review.maxFindings": "global" },
    });
  });

  it("ignores the repository settings while the repository follows the global config", async () => {
    const repo = await prisma.repository.update({ where: { id: repositoryId }, data: { followGlobal: true }, include: { connection: true } });
    await prisma.user.update({
      where: { id: repo.connection.userId },
      data: { reviewSettings: { llm: { connection: "anthropic" }, review: { blockOn: "minor" } } },
    });
    const job = await claimedJob();
    const { runDeps } = deps({}, { code_review: { findings: [] }, walkthrough: WALKTHROUGH });

    await runJob(job, runDeps);

    const stored = await prisma.reviewJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(stored.resolvedConfig).toMatchObject({
      config: { review: { blockOn: "minor" } },
      sources: { "review.blockOn": "global" },
    });
  });
});

describe("skipReason", () => {
  const triggers = (t: Partial<typeof DEFAULT_CONFIG.triggers>) => ({ ...DEFAULT_CONFIG, triggers: { ...DEFAULT_CONFIG.triggers, ...t } });
  const change = (c: Partial<ReturnType<typeof makeChangeSet>> = {}) => ({ ...makeChangeSet(), ...c });
  const opened = { trigger: "webhook" as const, event: "open", actor: null };
  const pushed = { trigger: "webhook" as const, event: "push", actor: null };

  it("follows the code review trigger for automatic reviews", () => {
    expect(skipReason(opened, DEFAULT_CONFIG, change({ isDraft: true }))).toMatch(/Draft/);
    expect(skipReason(opened, DEFAULT_CONFIG, change())).toBeNull();
    expect(skipReason(opened, triggers({ review: "all" }), change({ isDraft: true }))).toBeNull();
    expect(skipReason(opened, triggers({ review: "manual" }), change())).toMatch(/turned off/);
    expect(skipReason(pushed, triggers({ review: "manual" }), change())).toMatch(/turned off/);
  });

  it("reviews new commits only while review on push is on", () => {
    expect(skipReason(pushed, DEFAULT_CONFIG, change())).toBeNull();
    expect(skipReason(pushed, triggers({ reviewOnPush: false }), change())).toMatch(/New commits/);
    expect(skipReason(opened, triggers({ reviewOnPush: false }), change())).toBeNull();
  });

  it("applies the skip lists to automatic reviews only", () => {
    const skipAll = triggers({ ignoreTitles: ["wip"], skipAuthors: ["dependabot"] });
    expect(skipReason(opened, skipAll, change({ title: "WIP: add b" }))).toMatch(/title contains "wip"/);
    expect(skipReason(opened, skipAll, change({ author: "Dependabot" }))).toMatch(/Dependabot/);
    expect(skipReason({ ...pushed, actor: "dependabot" }, skipAll, change({ author: "alice" }))).toMatch(/dependabot/);
    expect(skipReason({ trigger: "manual" }, skipAll, change({ title: "WIP" }))).toBeNull();
    expect(skipReason({ trigger: "comment" }, skipAll, change({ title: "WIP" }))).toBeNull();
  });

  it("honours the command switch and never skips a manual review", () => {
    expect(skipReason({ trigger: "comment" }, triggers({ command: false }), change())).toMatch(/commands/);
    expect(skipReason({ trigger: "comment" }, DEFAULT_CONFIG, change({ isDraft: true }))).toBeNull();
    expect(skipReason({ trigger: "manual" }, triggers({ review: "manual", command: false }), change({ isDraft: true }))).toBeNull();
  });
});

describe("walkthroughEnabled", () => {
  const withTriggers = (summary: "manual" | "published") => ({
    ...DEFAULT_CONFIG,
    triggers: { ...DEFAULT_CONFIG.triggers, summary },
  });

  it("limits automatic summaries to published changes, or none when manual", () => {
    expect(walkthroughEnabled("webhook", withTriggers("published"), false)).toBe(true);
    expect(walkthroughEnabled("webhook", withTriggers("published"), true)).toBe(false);
    expect(walkthroughEnabled("webhook", withTriggers("manual"), false)).toBe(false);
    expect(walkthroughEnabled("manual", withTriggers("manual"), true)).toBe(true);
    expect(walkthroughEnabled("comment", { ...DEFAULT_CONFIG, output: { ...DEFAULT_CONFIG.output, walkthrough: false } }, false)).toBe(false);
  });
});

describe("runJob with automatic triggers", () => {
  it("records a skipped webhook job without calling the model or the forge", async () => {
    await enqueue({ repositoryId, number: 42, headSha: "oldhead", trigger: "webhook" });
    const job = (await claimNext())!;
    const { runDeps, model, published } = deps({ "base:.bammy.yaml": "triggers:\n  on_push: false\n" }, {});

    await runJob(job, runDeps);

    const stored = await prisma.reviewJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(stored).toMatchObject({ status: "skipped", verdict: null, result: null });
    expect(stored.error).toMatch(/turned off/);
    expect(model.requests).toHaveLength(0);
    expect(published).toEqual({ inline: [], summaries: [], statuses: [], descriptions: [], labels: [] });
  });
});
