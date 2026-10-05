import type { Config } from "../config/schema.ts";
import type { ChangeSet, ReviewResult } from "../core/models.ts";
import type { ForgePublisher, PostedComment } from "../forge/types.ts";
import { WALKTHROUGH_MARKER, removeDescriptionBlock } from "../core/markers.ts";
import { toMarkdown, walkthroughMarkdown } from "../render/markdown.ts";
import { inlineComments } from "./inline.ts";
import { labelChanges } from "./labels.ts";
import { commitStatus } from "./status.ts";

export interface PublishInput {
  publisher: ForgePublisher;
  changeSet: ChangeSet;
  result: ReviewResult;
  config: Config;
  // Fingerprints already posted on this change, from the database.
  postedFingerprints: Set<string>;
  // Where the commit status links: the review in the dashboard.
  targetUrl?: string;
}

export interface Publication {
  inlinePosted: PostedComment[];
  inlineSkipped: number;
  inlineFailed: { fingerprint: string; error: string }[];
  summaryCommentId: string | null;
  statusState: string | null;
  // Where the walkthrough went, when it was published. Older rows may say
  // "description", from before it moved into the review comment.
  walkthroughLocation?: "description" | "comment" | null;
  labels?: string[];
  errors: string[];
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// Inline comments, the summary and the commit status are published
// independently: one failing never stops the others, and each failure is
// recorded rather than thrown.
export async function publishReview(input: PublishInput): Promise<Publication> {
  const { publisher, changeSet, result, config } = input;
  const ref = changeSet.forgeRef;
  const publication: Publication = {
    inlinePosted: [],
    inlineSkipped: 0,
    inlineFailed: [],
    summaryCommentId: null,
    statusState: null,
    walkthroughLocation: null,
    labels: [],
    errors: [],
  };
  const placement = summaryPlacement(config, result);

  // The summary goes first so it sits at the top of the conversation, above
  // the inline comments, even when no progress comment was posted.
  if (placement.summary !== null) {
    try {
      publication.summaryCommentId = await publisher.upsertSummaryComment(ref, placement.summary);
      if (placement.walkthrough) publication.walkthroughLocation = "comment";
    } catch (err) {
      publication.errors.push(`Summary comment failed: ${message(err)}`);
    }
  }

  if (placement.walkthroughComment !== null) {
    try {
      await publisher.upsertComment(ref, WALKTHROUGH_MARKER, placement.walkthroughComment);
      publication.walkthroughLocation = "comment";
    } catch (err) {
      publication.errors.push(`Summary comment failed: ${message(err)}`);
    }
  }

  if (config.output.postInline) {
    try {
      // The forge's own markers cover a database row that was never written.
      const onForge = await publisher.listPostedFingerprints(ref).catch(() => new Set<string>());
      const posted = new Set([...input.postedFingerprints, ...onForge]);
      const comments = inlineComments(result.findings, changeSet, ref.provider, posted, {
        agentPrompt: config.output.agentPrompts,
      });
      publication.inlineSkipped = result.findings.filter((f) => f.bucket === "actionable" && posted.has(f.fingerprint)).length;
      const outcome = await publisher.postInlineComments(ref, comments);
      publication.inlinePosted = outcome.posted;
      publication.inlineFailed = outcome.failed;
      if (outcome.failed.length) {
        publication.errors.push(`${outcome.failed.length} inline comment(s) could not be posted`);
      }
    } catch (err) {
      publication.errors.push(`Inline comments failed: ${message(err)}`);
    }
  }

  // Housekeeping for changes an earlier version wrote the walkthrough into.
  // Failures are ignored: a token that cannot edit the PR/MR body must not
  // mark every review partial. Adapters skip the write when nothing changed.
  await publisher.updateDescription(ref, removeDescriptionBlock).catch(() => undefined);

  if (result.walkthrough) {
    const { add, remove } = labelChanges(result.walkthrough, config.output);
    if (add.length || remove.length) {
      try {
        await publisher.setLabels(ref, add, remove);
        publication.labels = add;
      } catch (err) {
        publication.errors.push(`Labels failed: ${message(err)}`);
      }
    }
  }

  if (config.output.postCheck) {
    const status = commitStatus(result, input.targetUrl);
    try {
      await publisher.setCommitStatus(ref, status);
      publication.statusState = status.state;
    } catch (err) {
      publication.errors.push(`Commit status failed: ${message(err)}`);
    }
  }

  return publication;
}

export interface SummaryPlacement {
  // The review comment's body, or null when it is turned off.
  summary: string | null;
  // The walkthrough as rendered on its own; empty when the review has none.
  walkthrough: string;
  // A comment of its own for the walkthrough, only while the review comment
  // is off; otherwise the walkthrough opens the review comment.
  walkthroughComment: string | null;
}

// One comment per review. Shared with the preview so the two cannot disagree.
export function summaryPlacement(config: Config, result: ReviewResult): SummaryPlacement {
  const walkthrough = walkthroughMarkdown(result);
  const { postSummary, reviewStats, agentPromptAll } = config.output;
  return {
    summary: postSummary
      ? toMarkdown(result, { walkthrough: true, stats: reviewStats, agentPrompt: agentPromptAll })
      : null,
    walkthrough,
    walkthroughComment: !postSummary && walkthrough ? `${walkthrough}\n${WALKTHROUGH_MARKER}\n` : null,
  };
}

export function publishes(config: Config): boolean {
  const { output } = config;
  return (
    output.postInline ||
    output.postSummary ||
    output.postCheck ||
    output.walkthrough ||
    output.blastRadiusLabel ||
    output.effortLabel
  );
}
