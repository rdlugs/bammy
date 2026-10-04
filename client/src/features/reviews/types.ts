// Mirrors the server's review result (server/src/review/core/models.ts),
// schemaVersion 1, as served by GET /api/reviews/:id.

export type Severity = "critical" | "major" | "minor" | "info"
export type Bucket = "actionable" | "outside_diff" | "nitpick" | "requirement_gap"
export type JobStatus = "queued" | "running" | "completed" | "partial" | "failed" | "superseded"
export type Verdict = "pass" | "blocked" | "error"
export type Provider = "github" | "gitlab"

export const SEVERITIES: Severity[] = ["critical", "major", "minor", "info"]
export const BUCKET_ORDER: Bucket[] = ["actionable", "requirement_gap", "outside_diff", "nitpick"]
export const BUCKET_TITLE: Record<Bucket, string> = {
  actionable: "Actionable comments",
  requirement_gap: "Requirements not met",
  outside_diff: "Outside diff range comments",
  nitpick: "Nitpick comments",
}

export interface Finding {
  file: string
  startLine: number
  endLine: number
  severity: Severity
  category: string
  kind: string
  effort: string
  title: string
  body: string
  suggestion?: string
  confidence: number
  evidence: string
  evidenceNote: string
  evidenceFiles: string[]
  source: "llm" | "static" | "rule"
  fingerprint: string
  bucket: Bucket
}

export interface Omission {
  path: string
  reason: string
  detail?: string
}

export interface ReviewSummary {
  title: string
  webUrl?: string
  total: number
  bySeverity: Partial<Record<Severity, number>>
  byBucket: Partial<Record<Bucket, number>>
  hasBlocking: boolean
}

export interface ReviewResult {
  schemaVersion: 1
  status: "completed" | "partial" | "failed"
  errors: string[]
  warnings: string[]
  change: {
    provider: Provider
    host: string
    project: string
    number: number
    baseSha: string
    headSha: string
    webUrl?: string
    title: string
    baseRef?: string
    headRef?: string
    isDraft: boolean
  }
  files: { path: string; changeType: string; additions: number; deletions: number }[]
  findings: Finding[]
  walkthrough?: {
    overview: string
    fileSummaries: { path: string; summary: string }[]
    labels: string[]
    estimatedEffort: number
  }
  coverage: { reviewedFiles: string[]; omissions: Omission[]; passes: number }
  validation: { dropped: Record<string, number>; demoted: number }
  usage: { purpose: string; model: string; inputTokens: number; outputTokens: number; latencyMs: number }[]
  usageTotals: { calls: number; inputTokens: number; outputTokens: number }
  verdict: { verdict: Verdict; blockOn: Severity; blocking: string[] }
  summary: ReviewSummary
}

export interface ReviewListItem {
  id: string
  number: number
  headSha: string
  trigger: "manual" | "webhook" | "comment"
  status: JobStatus
  verdict: Verdict | null
  summary: ReviewSummary | null
  error: string | null
  createdAt: string
  startedAt: string | null
  finishedAt: string | null
  repository: { id: string; provider: Provider; host: string; fullPath: string }
}

export interface ReviewDetail extends ReviewListItem {
  baseSha: string | null
  attempts: number
  result: ReviewResult | null
}

export function isActive(status: JobStatus) {
  return status === "queued" || status === "running"
}
