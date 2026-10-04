import type { Finding, ReviewStatus, Verdict } from "./models.ts";
import { atLeast, severityRank, type Severity } from "./severity.ts";

// The findings that reach the blocking floor, worst first. The one predicate
// behind the verdict, the summary's blocking section and the commit status.
export function blockingFindings(findings: Finding[], blockOn: Severity): Finding[] {
  return findings
    .filter((finding) => atLeast(finding.severity, blockOn))
    .sort(
      (a, b) =>
        severityRank(b.severity) - severityRank(a.severity) ||
        b.confidence - a.confidence ||
        a.file.localeCompare(b.file) ||
        a.startLine - b.startLine,
    );
}

// Blocking findings block whatever else happened. Without them, only a review
// that covered everything it set out to may pass: a partial or failed review's
// silence means nothing.
export function verdictFor(status: ReviewStatus, findings: Finding[], blockOn: Severity): Verdict {
  if (blockingFindings(findings, blockOn).length > 0) return "blocked";
  return status === "completed" ? "pass" : "error";
}
