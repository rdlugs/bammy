import { env } from "../config/env.ts";
import type { ForgeConnection, ReviewJob } from "../generated/prisma/client.ts";
import { prisma } from "../lib/prisma.ts";
import { loadReviewConfig } from "../review/config/load.ts";
import { createGenerate, missingKeys, type ApiKeys, type Generate } from "../review/llm/providers.ts";
import { runReview } from "../review/pipeline.ts";
import { publishes, publishReview } from "../review/publish/publisher.ts";
import { pendingStatus } from "../review/publish/status.ts";
import { summarize } from "../review/render/json.ts";
import { progressMarkdown } from "../review/render/progress.ts";
import { adapterForConnection, type Forge } from "../services/forge.ts";
import { apiKeysFor } from "../services/llm.ts";
import { complete } from "./queue.ts";

export interface RunJobDeps {
  adapterFor: (connection: ForgeConnection) => Forge;
  generateFor: (keys: ApiKeys) => Generate;
  apiKeysFor: (userId: string) => Promise<ApiKeys>;
}

const defaultDeps: RunJobDeps = {
  adapterFor: adapterForConnection,
  generateFor: createGenerate,
  apiKeysFor,
};

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// Loads everything a review needs, runs it, publishes it and stores the
// result. Anything thrown before the review starts (the repository vanished,
// the forge is down, no model key) fails the job through the worker, and
// nothing has been posted yet. Problems inside the review or while publishing
// are recorded instead.
export async function runJob(job: ReviewJob, deps: RunJobDeps = defaultDeps): Promise<void> {
  const repo = await prisma.repository.findUnique({
    where: { id: job.repositoryId },
    include: { connection: true },
  });
  if (!repo) {
    throw new Error("The repository is no longer connected");
  }

  const forge = deps.adapterFor(repo.connection);
  // The PR may have moved since the job was queued; review what is there now
  // and record which head that was.
  const changeSet = await forge.getChange(repo.fullPath, job.number);
  const loaded = await loadReviewConfig({
    adapter: forge,
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

  const targetUrl = `${env.CLIENT_ORIGIN}/reviews/${job.id}`;
  const ref = changeSet.forgeRef;
  if (publishes(config)) {
    // Best effort: a review must not fail because its progress note did.
    if (config.output.postSummary) {
      await forge.upsertSummaryComment(ref, progressMarkdown(changeSet)).catch((err: unknown) => {
        warnings.push(`Progress comment failed: ${message(err)}`);
      });
    }
    if (config.output.postCheck) {
      await forge.setCommitStatus(ref, pendingStatus(targetUrl)).catch((err: unknown) => {
        warnings.push(`Pending status failed: ${message(err)}`);
      });
    }
  }

  const result = await runReview(
    { changeSet, config: { ...config, llm: { ...config.llm, fallbackModels } }, warnings },
    { generate: deps.generateFor(keys) },
  );

  let publication = null;
  if (publishes(config)) {
    const already = await prisma.postedFinding.findMany({
      where: { repositoryId: repo.id, number: job.number },
      select: { fingerprint: true },
    });
    publication = await publishReview({
      publisher: forge,
      changeSet,
      result,
      config,
      postedFingerprints: new Set(already.map((row) => row.fingerprint)),
      targetUrl,
    });
    if (publication.inlinePosted.length) {
      await prisma.postedFinding.createMany({
        data: publication.inlinePosted.map((posted) => ({
          repositoryId: repo.id,
          number: job.number,
          fingerprint: posted.fingerprint,
          forgeCommentId: posted.forgeCommentId,
        })),
        skipDuplicates: true,
      });
    }
  }

  // A review that ran but could not be fully published is partial: the result
  // stands, and the job says what did not reach the forge.
  const errors = [...result.errors, ...(publication?.errors ?? [])];
  const status = result.status === "completed" && publication?.errors.length ? "partial" : result.status;
  await complete(job.id, {
    status,
    verdict: result.verdict.verdict,
    result,
    summary: summarize(result),
    publication,
    resolvedConfig: { config, sources: loaded.sources, repoFile: loaded.repoFile },
    error: errors.length ? errors.join("\n") : null,
    headSha: ref.headSha,
    baseSha: ref.baseSha,
  });
}
