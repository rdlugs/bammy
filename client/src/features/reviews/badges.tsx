import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { JobStatus, Severity, Verdict } from "./types"

const STATUS_LABEL: Record<JobStatus, string> = {
  queued: "Queued",
  running: "Running",
  completed: "Completed",
  partial: "Partial",
  failed: "Failed",
  superseded: "Superseded",
  skipped: "Skipped",
}

export function StatusBadge({ status }: { status: JobStatus }) {
  const variant = status === "failed" ? "destructive" : status === "completed" ? "secondary" : "outline"
  return <Badge variant={variant}>{STATUS_LABEL[status]}</Badge>
}

const VERDICT_LABEL: Record<Verdict, string> = { pass: "Pass", blocked: "Blocked", error: "Incomplete" }

export function VerdictBadge({ verdict }: { verdict: Verdict | null }) {
  if (!verdict) return <span className="text-muted-foreground">-</span>
  return (
    <Badge
      variant={verdict === "blocked" ? "destructive" : "outline"}
      className={cn(
        verdict === "pass" && "border-emerald-600/40 text-emerald-700 dark:text-emerald-400",
        verdict === "error" && "border-amber-600/40 text-amber-700 dark:text-amber-400",
      )}
    >
      {VERDICT_LABEL[verdict]}
    </Badge>
  )
}

const SEVERITY_CLASS: Record<Severity, string> = {
  critical: "bg-destructive/15 text-destructive",
  major: "bg-orange-500/15 text-orange-700 dark:text-orange-400",
  minor: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
  info: "bg-muted text-muted-foreground",
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  return <Badge className={cn("border-transparent", SEVERITY_CLASS[severity])}>{severity}</Badge>
}
