import { BUCKET_ORDER } from "../core/buckets.ts";
import type { Bucket, ReviewResult } from "../core/models.ts";
import { SEVERITIES, type Severity } from "../core/severity.ts";

export interface ResultSummary {
  title: string;
  webUrl?: string;
  total: number;
  bySeverity: Partial<Record<Severity, number>>;
  byBucket: Partial<Record<Bucket, number>>;
  hasBlocking: boolean;
}

// The digest stored beside the result, for lists that must not load results.
export function summarize(result: ReviewResult): ResultSummary {
  const bySeverity: Partial<Record<Severity, number>> = {};
  const byBucket: Partial<Record<Bucket, number>> = {};
  for (const finding of result.findings) {
    bySeverity[finding.severity] = (bySeverity[finding.severity] ?? 0) + 1;
    byBucket[finding.bucket] = (byBucket[finding.bucket] ?? 0) + 1;
  }
  return {
    title: result.change.title,
    ...(result.change.webUrl ? { webUrl: result.change.webUrl } : {}),
    total: result.findings.length,
    bySeverity: Object.fromEntries(SEVERITIES.filter((s) => bySeverity[s]).map((s) => [s, bySeverity[s]])),
    byBucket: Object.fromEntries(BUCKET_ORDER.filter((b) => byBucket[b]).map((b) => [b, byBucket[b]])),
    hasBlocking: result.verdict.blocking.length > 0,
  };
}

// The result as the API serves it: everything stored, plus the summary and
// token totals a client would otherwise recompute.
export function toJson(result: ReviewResult) {
  const tokens = result.usage.reduce(
    (total, call) => ({
      inputTokens: total.inputTokens + call.inputTokens,
      outputTokens: total.outputTokens + call.outputTokens,
    }),
    { inputTokens: 0, outputTokens: 0 },
  );
  return {
    ...result,
    summary: summarize(result),
    usageTotals: { calls: result.usage.length, ...tokens },
  };
}
