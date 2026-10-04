import { env } from "../config/env.ts";
import type { ForgeConnection, ReviewJob } from "../generated/prisma/client.ts";
import { prisma } from "../lib/prisma.ts";
import { skipFilterReason } from "../review/config/filters.ts";
import { loadReviewConfig } from "../review/config/load.ts";
import type { Config } from "../review/config/schema.ts";
import {
  createGenerate,
  missingKeys,
  type ApiKeys,
  type Endpoint,
  type Generate,
  type ProviderBaseUrls,
} from "../review/llm/providers.ts";
import { runReview } from "../review/pipeline.ts";
import { publishes, publishReview } from "../review/publish/publisher.ts";
import { pendingStatus } from "../review/publish/status.ts";
import { summarize } from "../review/render/json.ts";
import { progressMarkdown } from "../review/render/progress.ts";
import { adapterForConnection, type Forge } from "../services/forge.ts";
import { llmCredentialsFor, type StoredLlmConnections } from "../services/llm.ts";
import { complete } from "./queue.ts";

export interface RunJobDeps {
  adapterFor: (connection: ForgeConnection) => Forge;
  generateFor: (keys: ApiKeys, endpoint?: Endpoint, baseUrls?: ProviderBaseUrls) => Generate;
  credentialsFor: (
    userId: string,
  ) => Promise<{ keys: ApiKeys; baseUrls: ProviderBaseUrls; connections: StoredLlmConnections }>;
}

const defaultDeps: RunJobDeps = {
  adapterFor: adapterForConnection,
  generateFor: createGenerate,
  credentialsFor: llmCredentialsFor,
};

// Decided here rather than in the webhook handler, because only now is the
// full configuration known, including the repository file. A manual review is
// never skipped; someone asked for it, and so did a permitted review command.
export function skipReason(
  job: { trigger: ReviewJob["trigger"]; event?: string | null; actor?: string | null },
  config: Config,
  change: Parameters<typeof skipFilterReason>[1] & { isDraft: boolean },
): string | null {
  const { triggers } = config;
  if (job.trigger === "webhook") {
    if (triggers.review === "manual") return "Automatic reviews are turned off for this repository";
    if (change.isDraft && triggers.review !== "all") return "Draft changes are not reviewed automatically";
    if (job.event === "push" && !triggers.reviewOnPush) return "New commits are not reviewed automatically";
    return skipFilterReason(triggers, change, job.actor);
  }
  if (job.trigger === "comment" && !triggers.command) {
    return "Review commands are turned off for this repository";
  }
  return null;
}

// Automatic reviews include the walkthrough only when the summary trigger
// allows it; a requested review follows the walkthrough setting alone.
export function walkthroughEnabled(trigger: ReviewJob["trigger"], config: Config, isDraft: boolean): boolean {
  if (!config.output.walkthrough) return false;
  if (trigger !== "webhook") return true;
  return config.triggers.summary === "published" && !isDraft;
}

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
    include: { connection: { include: { user: { select: { reviewSettings: true } } } } },
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
    globalSettings: repo.connection.user.reviewSettings,
    repoSettings: repo.settings,
    followGlobal: repo.followGlobal,
  });

  const { config } = loaded;
  const skip = skipReason(job, config, changeSet);
  if (skip) {
    await complete(job.id, {
      status: "skipped",
      verdict: null,
      resolvedConfig: { config, sources: loaded.sources, repoFile: loaded.repoFile },
      error: skip,
      headSha: changeSet.forgeRef.headSha,
      baseSha: changeSet.forgeRef.baseSha,
    });
    return;
  }

  const { keys, baseUrls, connections } = await deps.credentialsFor(repo.connection.userId);
  const { connection, baseUrl, endpointKey } = config.llm;
  let endpoint: Endpoint | undefined;
  if (connection) {
    const selected = connections[connection];
    if (!selected) {
      throw new Error(`The selected ${connection} LLM connection no longer exists: configure it in settings`);
    }
    if (selected.baseUrl) {
      endpoint = { baseUrl: selected.baseUrl, apiKey: selected.apiKey };
    } else {
      const incompatible = [config.llm.model, ...config.llm.fallbackModels].find(
        (model) => model.split("/")[0] !== connection,
      );
      if (incompatible) {
        throw new Error(
          `The ${connection} LLM connection uses its official API and cannot run model ${incompatible}`,
        );
      }
    }
  } else if (baseUrl) {
    // Compatibility for settings saved before connections were referenced live.
    if (endpointKey && !keys[endpointKey]) {
      throw new Error(`No API key for ${endpointKey}: store one in settings or configure it on the server`);
    }
    endpoint = { baseUrl, apiKey: endpointKey ? keys[endpointKey] : undefined };
  } else {
    throw new Error("No LLM connection selected: choose one in Configuration > LLM Config");
  }
  if (missingKeys([config.llm.model], keys, endpoint, baseUrls).length > 0) {
    const provider = config.llm.model.split("/")[0];
    throw new Error(`No API key for ${provider}: store one in settings or configure it on the server`);
  }
  const warnings = [...loaded.warnings];
  const fallbackModels = config.llm.fallbackModels.filter((model) => {
    const usable = missingKeys([model], keys, endpoint, baseUrls).length === 0;
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

  const walkthrough = walkthroughEnabled(job.trigger, config, changeSet.isDraft);
  const result = await runReview(
    {
      changeSet,
      config: {
        ...config,
        llm: { ...config.llm, fallbackModels },
        output: { ...config.output, walkthrough },
      },
      warnings,
    },
    { generate: deps.generateFor(keys, endpoint, baseUrls) },
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
