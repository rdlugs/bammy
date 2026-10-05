import type { JobStatus, Trigger, Verdict } from "./types"

export const STATUS_LABEL: Record<JobStatus, string> = {
  queued: "Queued",
  running: "Running",
  completed: "Completed",
  partial: "Partial",
  failed: "Failed",
  superseded: "Superseded",
  skipped: "Skipped",
}

export const VERDICT_LABEL: Record<Verdict, string> = { pass: "Pass", blocked: "Blocked", error: "Incomplete" }

const options = <T extends string>(labels: Record<T, string>) =>
  (Object.keys(labels) as T[]).map((value) => ({ value, label: labels[value] }))

export const STATUS_OPTIONS = options(STATUS_LABEL)
export const VERDICT_OPTIONS = options(VERDICT_LABEL)
export const TRIGGER_OPTIONS = options<Trigger>({ manual: "Manual", webhook: "Webhook", comment: "Comment" })
