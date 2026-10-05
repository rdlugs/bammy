import { MessageSquare, MousePointerClick, Webhook } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { STATUS_LABEL, VERDICT_LABEL } from "./options"
import type { JobStatus, Severity, Trigger, Verdict } from "./types"

// With a reason (why it failed or was skipped), the badge explains itself on hover.
export function StatusBadge({ status, reason }: { status: JobStatus; reason?: string | null }) {
  const variant = status === "failed" ? "destructive" : status === "completed" ? "secondary" : "outline"
  const badge = <Badge variant={variant}>{STATUS_LABEL[status]}</Badge>
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
  comment: { label: "Started by a /bammy review comment", icon: MessageSquare },
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
