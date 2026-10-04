import { Link } from "react-router"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { timeAgo } from "@/lib/time"
import { SeverityBadge, StatusBadge, VerdictBadge } from "./badges"
import { changeLabel } from "./links"
import { SEVERITIES, type ReviewListItem } from "./types"

function FindingCounts({ review }: { review: ReviewListItem }) {
  const summary = review.summary
  if (!summary) return <span className="text-muted-foreground">-</span>
  if (summary.total === 0) return <span className="text-muted-foreground">None</span>
  return (
    <div className="flex flex-wrap gap-1">
      {SEVERITIES.filter((s) => summary.bySeverity[s]).map((s) => (
        <span key={s} className="inline-flex items-center gap-1">
          <SeverityBadge severity={s} />
          <span className="text-xs tabular-nums">{summary.bySeverity[s]}</span>
        </span>
      ))}
    </div>
  )
}

export function ReviewsTable({ reviews }: { reviews: ReviewListItem[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Change</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Verdict</TableHead>
          <TableHead>Findings</TableHead>
          <TableHead className="text-right">Queued</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {reviews.map((review) => (
          <TableRow key={review.id}>
            <TableCell className="max-w-md">
              <Link to={`/reviews/${review.id}`} className="font-medium hover:underline">
                {review.summary?.title ??
                  `${review.repository.provider === "gitlab" ? "Merge" : "Pull"} request ${changeLabel(review.repository.provider, review.number)}`}
              </Link>
              <div className="truncate text-xs text-muted-foreground">
                {review.repository.fullPath} {changeLabel(review.repository.provider, review.number)} ·{" "}
                <code>{review.headSha.slice(0, 7)}</code>
              </div>
            </TableCell>
            <TableCell>
              <StatusBadge status={review.status} />
            </TableCell>
            <TableCell>
              <VerdictBadge verdict={review.verdict} />
            </TableCell>
            <TableCell>
              <FindingCounts review={review} />
            </TableCell>
            <TableCell className="text-right text-muted-foreground">{timeAgo(review.createdAt)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
