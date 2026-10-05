import type { ChangeSet } from "../core/models.ts";
import { SUMMARY_MARKER } from "../core/markers.ts";
import { BRAND_FOOTER } from "./markdown.ts";

// Posted when a review starts and replaced by the summary when it ends; it
// carries the summary marker so the replacement edits this same comment.
export function progressMarkdown(changeSet: ChangeSet): string {
  return [
    "## Summary",
    "",
    `⏳ Reviewing \`${changeSet.forgeRef.headSha.slice(0, 7)}\`. This comment will be updated with the review.`,
    "",
    BRAND_FOOTER,
    "",
    SUMMARY_MARKER,
    "",
  ].join("\n");
}
