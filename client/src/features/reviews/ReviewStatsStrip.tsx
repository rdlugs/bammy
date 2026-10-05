import type { ReactNode } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { useReviewStats } from "./api"
import { SeverityBadge } from "./badges"
import { SEVERITIES } from "./types"

export function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Card className="py-4">
      <CardContent className="flex flex-col gap-1 px-4">
        <span className="text-xs text-muted-foreground">{label}</span>
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

  return (
    <section aria-label="Review stats" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Stat label={`Reviews, ${period}`}>{data.runs}</Stat>
      <Stat label="Blocked">
        {finished ? `${blockedRate}%` : "-"}
        <span className="ml-2 text-xs font-normal text-muted-foreground">
          {data.blocked} of {finished}
        </span>
      </Stat>
      <Stat label="Failed">{data.failed}</Stat>
      <Stat label="Findings">
        <div className="flex flex-wrap gap-2 pt-1 text-sm font-normal">
          {SEVERITIES.map((s) => (
            <span key={s} className="inline-flex items-center gap-1">
              <SeverityBadge severity={s} />
              <span className="tabular-nums">{data.findings[s]}</span>
            </span>
          ))}
        </div>
      </Stat>
    </section>
  )
}
