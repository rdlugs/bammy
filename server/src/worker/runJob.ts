import type { ForgeConnection, ReviewJob } from "../generated/prisma/client.ts";
import { prisma } from "../lib/prisma.ts";
import { loadReviewConfig } from "../review/config/load.ts";
import type { ForgeAdapter } from "../review/forge/types.ts";
import { createGenerate, missingKeys, type ApiKeys, type Generate } from "../review/llm/providers.ts";
import { runReview } from "../review/pipeline.ts";
import { summarize } from "../review/render/json.ts";
import { adapterForConnection } from "../services/forge.ts";
import { apiKeysFor } from "../services/llm.ts";
import { complete } from "./queue.ts";

export interface RunJobDeps {
  adapterFor: (connection: ForgeConnection) => ForgeAdapter;
  generateFor: (keys: ApiKeys) => Generate;
  apiKeysFor: (userId: string) => Promise<ApiKeys>;
}

const defaultDeps: RunJobDeps = {
  adapterFor: adapterForConnection,
  generateFor: createGenerate,
  apiKeysFor,
};

// Loads everything a review needs, runs it, and stores the result. Anything
// thrown here (the repository vanished, the forge is down, no model key) fails
// the job through the worker; problems inside the review are recorded in the
// result instead.
export async function runJob(job: ReviewJob, deps: RunJobDeps = defaultDeps): Promise<void> {
  const repo = await prisma.repository.findUnique({
    where: { id: job.repositoryId },
    include: { connection: true },
  });
  if (!repo) {
    throw new Error("The repository is no longer connected");
  }

  const adapter = deps.adapterFor(repo.connection);
  // The PR may have moved since the job was queued; review what is there now
  // and record which head that was.
  const changeSet = await adapter.getChange(repo.fullPath, job.number);
  const loaded = await loadReviewConfig({
    adapter,
    project: repo.fullPath,
    ref: changeSet.forgeRef.baseSha,
    repoSettings: repo.settings,
  });

  const keys = await deps.apiKeysFor(repo.connection.userId);
  const { config } = loaded;
  if (missingKeys([config.llm.model], keys).length > 0) {
    const provider = config.llm.model.split("/")[0];
    throw new Error(`No API key for ${provider}: store one in settings or configure it on the server`);
  }
  const warnings = [...loaded.warnings];
  const fallbackModels = config.llm.fallbackModels.filter((model) => {
    const usable = missingKeys([model], keys).length === 0;
    if (!usable) warnings.push(`Fallback model ${model} skipped: no API key for its provider`);
    return usable;
  });

  const result = await runReview(
    { changeSet, config: { ...config, llm: { ...config.llm, fallbackModels } }, warnings },
    { generate: deps.generateFor(keys) },
  );

  await complete(job.id, {
    status: result.status,
    verdict: result.verdict.verdict,
    result,
    summary: summarize(result),
    resolvedConfig: { config, sources: loaded.sources, repoFile: loaded.repoFile },
    error: result.errors.length ? result.errors.join("\n") : null,
    headSha: changeSet.forgeRef.headSha,
    baseSha: changeSet.forgeRef.baseSha,
  });
}
