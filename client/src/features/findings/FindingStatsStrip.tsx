import { Skeleton } from "@/components/ui/skeleton"
import { SeverityBadge } from "@/features/reviews/badges"
import { Stat } from "@/features/reviews/ReviewStatsStrip"
import { SEVERITIES } from "@/features/reviews/types"
import { useFindingStats } from "./api"

// What is still waiting on someone, and whether findings get acted on.
// Stays out of the way if it cannot load.
export function FindingStatsStrip() {
  const { data, isPending, isError } = useFindingStats()
  if (isError) return null
  if (isPending) return <Skeleton className="h-24 w-full" />

  return (
    <section aria-label="Finding stats" className="grid gap-4 sm:grid-cols-3">
      <Stat label="Open findings">{data.open}</Stat>
      <Stat label={`Resolved, last ${data.days} days`}>
        {data.resolutionRate === null ? "-" : `${data.resolutionRate}%`}
        <span className="ml-2 text-xs font-normal text-muted-foreground">
          {data.resolved} of {data.total}
        </span>
      </Stat>
      <Stat label="Open by severity">
        <div className="flex flex-wrap gap-2 pt-1 text-sm font-normal">
          {SEVERITIES.map((s) => (
            <span key={s} className="inline-flex items-center gap-1">
              <SeverityBadge severity={s} />
              <span className="tabular-nums">{data.openBySeverity[s]}</span>
            </span>
          ))}
        </div>
      </Stat>
    </section>
  )
}
