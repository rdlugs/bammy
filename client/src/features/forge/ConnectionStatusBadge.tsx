import { Loader2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { STATUS_LABELS, type ConnectionStatus } from "./api"

// Same palette as the review verdict badges in features/reviews/badges.tsx.
const STATUS_BADGES: Record<ConnectionStatus, { className: string; title: string }> = {
  active: {
    className: "border-emerald-600/40 text-emerald-700 dark:text-emerald-400",
    title: "The forge accepts the stored credentials",
  },
  revoked: {
    className: "border-destructive/40 text-destructive",
    title: "The forge rejected the stored credentials; reconnect the account",
  },
  unreachable: {
    className: "border-amber-600/40 text-amber-700 dark:text-amber-400",
    title: "Could not reach the forge",
  },
}

export function ConnectionStatusBadge({ status }: { status: ConnectionStatus | undefined }) {
  if (!status) {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" />
        Checking...
      </span>
    )
  }
  const badge = STATUS_BADGES[status]
  return (
    <Badge variant="outline" className={cn(badge.className)} title={badge.title}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {STATUS_LABELS[status]}
    </Badge>
  )
}
