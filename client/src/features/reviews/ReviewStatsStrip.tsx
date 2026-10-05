import type { ReactNode } from "react"
import { CircleX, GitPullRequest, ShieldX, Timer, type LucideIcon } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { formatDuration } from "@/lib/time"
import { useReviewStats } from "./api"

export function Stat({ label, icon: Icon, children }: { label: string; icon?: LucideIcon; children: ReactNode }) {
  return (
    <Card className="py-4">
      <CardContent className="flex flex-col gap-1 px-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">{label}</span>
          {Icon && <Icon className="size-4 text-muted-foreground" aria-hidden />}
        </div>
        <div className="text-2xl font-semibold tabular-nums">{children}</div>
      </CardContent>
    </Card>
  )
}

// A glance at the last few days; stays out of the way if it cannot load.
export function ReviewStatsStrip() {
  const { data, isPending, isError } = useReviewStats()
  if (isError) return null
  if (isPending) return <Skeleton className="h-24 w-full" />

  const finished = data.blocked + data.passed
  const blockedRate = finished ? Math.round((data.blocked / finished) * 100) : 0
  const period = `last ${data.days} days`
  const { median, max } = data.duration

  return (
    <section aria-label="Review stats" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Stat label={`Reviews, ${period}`} icon={GitPullRequest}>
        {data.runs}
      </Stat>
      <Stat label="Blocked" icon={ShieldX}>
        {finished ? `${blockedRate}%` : "-"}
        <span className="ml-2 text-xs font-normal text-muted-foreground">
          {data.blocked} of {finished}
        </span>
      </Stat>
      <Stat label="Failed" icon={CircleX}>
        {data.failed}
      </Stat>
      <Stat label="Median review time" icon={Timer}>
        {median === null ? "-" : formatDuration(median)}
        {max !== null && (
          <span className="ml-2 text-xs font-normal text-muted-foreground">slowest {formatDuration(max)}</span>
        )}
      </Stat>
    </section>
  )
}
