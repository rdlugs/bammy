import { MessageSquare, MousePointerClick, Webhook } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { SEVERITY_ICON, VERDICT_ICON } from "./icons"
import { STATUS_LABEL, VERDICT_LABEL } from "./options"
import { SEVERITY_CLASS } from "./severity"
import type { JobStatus, Severity, Trigger, Verdict } from "./types"

// Same palette as VerdictBadge below and features/forge/ConnectionStatusBadge.tsx.
// Runs that never produced a review (superseded, skipped, cancelled) stay muted.
const STATUS_CLASS: Record<JobStatus, string> = {
  completed: "border-emerald-600/40 text-emerald-700 dark:text-emerald-400",
  partial: "border-amber-600/40 text-amber-700 dark:text-amber-400",
  failed: "border-destructive/40 text-destructive",
  running: "border-sky-600/40 text-sky-700 dark:text-sky-400",
  queued: "border-violet-600/40 text-violet-700 dark:text-violet-400",
  superseded: "text-muted-foreground",
  skipped: "border-dashed text-muted-foreground",
  cancelled: "border-dashed text-muted-foreground",
}

// With a reason (why it failed or was skipped), the badge explains itself on hover.
export function StatusBadge({ status, reason }: { status: JobStatus; reason?: string | null }) {
  const badge = (
    <Badge variant="outline" className={STATUS_CLASS[status]}>
      <span className={cn("size-1.5 rounded-full bg-current", status === "running" && "animate-pulse")} aria-hidden />
      {STATUS_LABEL[status]}
    </Badge>
  )
  if (!reason) return badge
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="cursor-help">
          {badge}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{reason}</TooltipContent>
    </Tooltip>
  )
}

const TRIGGER = {
  manual: { label: "Started from the dashboard", icon: MousePointerClick },
  webhook: { label: "Started by a push or a new pull request", icon: Webhook },
  comment: { label: "Started by a /sentryward review comment", icon: MessageSquare },
} satisfies Record<Trigger, { label: string; icon: unknown }>

export function TriggerIcon({ trigger }: { trigger: Trigger }) {
  const { label, icon: Icon } = TRIGGER[trigger]
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} aria-label={label} className="inline-flex text-muted-foreground">
          <Icon className="size-3.5" />
        </span>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

export function VerdictBadge({ verdict }: { verdict: Verdict | null }) {
  if (!verdict) return <span className="text-muted-foreground">-</span>
  const Icon = VERDICT_ICON[verdict]
  return (
    <Badge
      variant={verdict === "blocked" ? "destructive" : "outline"}
      className={cn(
        verdict === "pass" && "border-emerald-600/40 text-emerald-700 dark:text-emerald-400",
        verdict === "error" && "border-amber-600/40 text-amber-700 dark:text-amber-400",
      )}
    >
      <Icon data-icon="inline-start" aria-hidden />
      {VERDICT_LABEL[verdict]}
    </Badge>
  )
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  const Icon = SEVERITY_ICON[severity]
  return (
    <Badge className={cn("border-transparent", SEVERITY_CLASS[severity])}>
      <Icon data-icon="inline-start" aria-hidden />
      {severity}
    </Badge>
  )
}
