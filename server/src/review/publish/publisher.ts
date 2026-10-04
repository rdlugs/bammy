import type { Config } from "../config/schema.ts";
import type { ChangeSet, ReviewResult } from "../core/models.ts";
import type { ForgePublisher, PostedComment } from "../forge/types.ts";
import { toMarkdown } from "../render/markdown.ts";
import { inlineComments } from "./inline.ts";
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
    errors: [],
  };

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
      publication.summaryCommentId = await publisher.upsertSummaryComment(ref, toMarkdown(result));
    } catch (err) {
      publication.errors.push(`Summary comment failed: ${message(err)}`);
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
  return config.output.postInline || config.output.postSummary || config.output.postCheck;
}
