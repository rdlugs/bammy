import { diffPosition, type Bucket, type ChangeSet } from "./models.ts";
import type { Kind } from "./severity.ts";

export const BUCKET_ORDER: Bucket[] = ["actionable", "requirement_gap", "outside_diff", "nitpick"];

// The buckets a forge summary carries, because no inline thread can hold them.
export const SUMMARY_BUCKETS: Bucket[] = ["requirement_gap", "outside_diff", "nitpick"];

export const BUCKET_TITLE: Record<Bucket, string> = {
  actionable: "Actionable comments",
  requirement_gap: "Requirements not met",
  outside_diff: "Outside diff range comments",
  nitpick: "Nitpick comments",
};

export function canAnchor(file: string, line: number, changeSet: ChangeSet): boolean {
  const changed = changeSet.files.find((f) => f.path === file);
  return changed !== undefined && diffPosition(changed, line) !== undefined;
}

// The single decision of which channel a finding belongs on. Terminal-style
// views, the summary comment and the publisher all read the stored bucket
// rather than deciding again. Order matters: a gap has no line by nature, so it
// is never "outside" the diff; anchorability comes next, because a nitpick the
// forge cannot attach is still reported in the summary.
export function bucketFor(
  finding: { file: string; startLine: number; kind: Kind },
  changeSet: ChangeSet,
): Bucket {
  if (finding.kind === "requirement_gap") return "requirement_gap";
  if (!canAnchor(finding.file, finding.startLine, changeSet)) return "outside_diff";
  if (finding.kind === "nitpick") return "nitpick";
  return "actionable";
}
