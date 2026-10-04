import type { Config } from "../config/schema.ts";
import type { ChangeSet, ReviewResult } from "../core/models.ts";
import type { ForgePublisher, PostedComment } from "../forge/types.ts";
import { WALKTHROUGH_MARKER, withDescriptionBlock } from "../core/markers.ts";
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
  // Where the walkthrough went, when it was published.
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
  const walkthrough = walkthroughMarkdown(result);

  if (config.output.postInline) {
    try {
      // The forge's own markers cover a database row that was never written.
      const onForge = await publisher.listPostedFingerprints(ref).catch(() => new Set<string>());
      const posted = new Set([...input.postedFingerprints, ...onForge]);
      const comments = inlineComments(result.findings, changeSet, ref.provider, posted);
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

  if (config.output.postSummary) {
    try {
      // The walkthrough is published on its own below.
      publication.summaryCommentId = await publisher.upsertSummaryComment(ref, toMarkdown(result, { walkthrough: false }));
    } catch (err) {
      publication.errors.push(`Summary comment failed: ${message(err)}`);
    }
  }

  if (walkthrough) {
    // Dynamic fills the description only when the author left it empty (the
    // change set's description already excludes Bammy's earlier block).
    const location =
      config.output.summaryLocation === "dynamic"
        ? changeSet.description.trim()
          ? "comment"
          : "description"
        : config.output.summaryLocation;
    try {
      if (location === "description") {
        await publisher.updateDescription(ref, (description) => withDescriptionBlock(description, walkthrough));
      } else {
        await publisher.upsertComment(ref, WALKTHROUGH_MARKER, `${walkthrough}\n${WALKTHROUGH_MARKER}\n`);
      }
      publication.walkthroughLocation = location;
    } catch (err) {
      publication.errors.push(`Summary ${location === "description" ? "description" : "comment"} failed: ${message(err)}`);
    }
  }

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
