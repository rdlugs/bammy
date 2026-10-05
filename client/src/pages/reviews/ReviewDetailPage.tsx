import { Link, useNavigate, useParams } from "react-router"
import { AlertTriangle, ArrowLeft, Copy, ExternalLink, Loader2, RotateCw } from "lucide-react"
import { toast } from "sonner"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { fetchReviewMarkdown, useRerunReview, useReview } from "@/features/reviews/api"
import { StatusBadge, VerdictBadge } from "@/features/reviews/badges"
import { FindingCard } from "@/features/reviews/FindingCard"
import { PROVIDERS } from "@/features/forge/providers"
import { changeLabel } from "@/features/reviews/links"
import {
  BUCKET_ORDER,
  BUCKET_TITLE,
  isActive,
  type Finding,
  type Publication,
  type ReviewResult,
} from "@/features/reviews/types"

const OMISSION_TEXT: Record<string, string> = {
  ignored: "ignored by configuration",
  binary: "binary file",
  deleted: "deleted",
  patch_unavailable: "diff not provided by the forge",
  too_large: "too large for one review pass",
  budget: "review pass limit reached",
  chunk_failed: "review pass failed",
}

function BackToReviews() {
  return (
    <Button asChild variant="ghost" size="sm" className="self-start">
      <Link to="/reviews">
        <ArrowLeft />
        Back to reviews
      </Link>
    </Button>
  )
}

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? "" : "s"}`
}

// One line on what reached the forge, so nobody has to go and check.
function publicationText(publication: Publication, forge: string) {
  const parts: string[] = []
  if (publication.inlinePosted.length) parts.push(plural(publication.inlinePosted.length, "inline comment"))
  if (publication.inlineSkipped) parts.push(`${publication.inlineSkipped} already posted`)
  if (publication.summaryCommentId) parts.push("summary")
  if (publication.statusState) parts.push(`commit status (${publication.statusState})`)
  return parts.length ? `Posted to ${forge}: ${parts.join(", ")}` : `Nothing posted to ${forge}`
}

function groupByFile(findings: Finding[]) {
  const groups = new Map<string, Finding[]>()
  for (const finding of findings) {
    groups.set(finding.file, [...(groups.get(finding.file) ?? []), finding])
  }
  return [...groups.entries()]
}

function Findings({ result }: { result: ReviewResult }) {
  if (result.findings.length === 0) {
    return <p className="text-sm text-muted-foreground">No findings.</p>
  }
  return (
    <>
      {BUCKET_ORDER.map((bucket) => {
        const findings = result.findings.filter((f) => f.bucket === bucket)
        if (!findings.length) return null
        return (
          <section key={bucket} aria-label={BUCKET_TITLE[bucket]} className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">
              {BUCKET_TITLE[bucket]} <span className="text-muted-foreground">({findings.length})</span>
            </h2>
            {groupByFile(findings).map(([file, items]) => (
              <div key={file} className="flex flex-col gap-2">
                <h3 className="font-mono text-sm text-muted-foreground">{file}</h3>
                {items.map((finding) => (
                  <FindingCard key={finding.fingerprint} finding={finding} change={result.change} />
                ))}
              </div>
            ))}
          </section>
        )
      })}
    </>
  )
}

function ResultView({ result }: { result: ReviewResult }) {
  const notes = [...result.errors, ...result.warnings]
  return (
    <>
      {notes.length > 0 && (
        <Alert>
          <AlertTriangle />
          <AlertTitle>{result.status === "completed" ? "Notes" : "This review is incomplete"}</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4">
              {notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
      {result.walkthrough && (
        <Card>
          <CardHeader>
            <CardTitle>Walkthrough</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <p className="whitespace-pre-wrap">{result.walkthrough.overview}</p>
            <div className="flex flex-wrap items-center gap-2">
              {result.walkthrough.labels.map((label) => (
                <Badge key={label} variant="secondary">
                  {label}
                </Badge>
              ))}
              <span className="text-muted-foreground">Review effort {result.walkthrough.estimatedEffort}/5</span>
            </div>
            {result.walkthrough.fileSummaries.length > 0 && (
              <ul className="flex flex-col gap-1">
                {result.walkthrough.fileSummaries.map((entry) => (
                  <li key={entry.path}>
                    <code className="text-xs">{entry.path}</code>: {entry.summary}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
      <Findings result={result} />
      <Card>
        <CardHeader>
          <CardTitle>Coverage</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <p>
            {result.coverage.reviewedFiles.length} of {result.files.length} files reviewed in {result.coverage.passes}{" "}
            {result.coverage.passes === 1 ? "pass" : "passes"} · {result.usageTotals.inputTokens.toLocaleString()} input
            and {result.usageTotals.outputTokens.toLocaleString()} output tokens
          </p>
          {result.coverage.omissions.length > 0 && (
            <ul className="list-disc pl-4 text-muted-foreground">
              {result.coverage.omissions.map((o, i) => (
                <li key={`${o.path}-${i}`}>
                  <code className="text-xs">{o.path}</code>: {OMISSION_TEXT[o.reason] ?? o.reason}
                  {o.detail ? `, ${o.detail}` : ""}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  )
}

export function ReviewDetailPage() {
  const { id = "" } = useParams()
  const navigate = useNavigate()
  const { data, isPending, isError } = useReview(id)
  const rerun = useRerunReview()

  if (isPending) {
    return (
      <main className="flex flex-1 flex-col gap-6 p-6">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </main>
    )
  }
  if (isError) {
    return (
      <main className="flex flex-1 flex-col gap-6 p-6">
        <BackToReviews />
        <p className="text-sm text-destructive">Review not found.</p>
      </main>
    )
  }

  const { review } = data
  const result = review.result?.schemaVersion === 1 ? review.result : null
  const title = review.summary?.title ?? result?.change.title ?? review.repository.fullPath
  const webUrl = review.summary?.webUrl ?? result?.change.webUrl

  async function copyMarkdown() {
    try {
      await navigator.clipboard.writeText(await fetchReviewMarkdown(review.id))
      toast.success("Markdown copied")
    } catch {
      toast.error("Could not copy the markdown")
    }
  }

  async function runAgain() {
    try {
      const { review: next } = await rerun.mutateAsync(review.id)
      navigate(`/reviews/${next.id}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start a new review")
    }
  }

  return (
    <main className="flex flex-1 flex-col gap-6 p-6">
      <BackToReviews />
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
          <p className="text-sm text-muted-foreground">
            {review.repository.fullPath} {changeLabel(review.repository.provider, review.number)} ·{" "}
            <code>{review.headSha.slice(0, 7)}</code>
            {webUrl && (
              <>
                {" · "}
                <a href={webUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:underline">
                  Open on {PROVIDERS[review.repository.provider].label}
                  <ExternalLink className="size-3" />
                </a>
              </>
            )}
          </p>
          <div className="flex items-center gap-2 pt-1">
            <StatusBadge status={review.status} />
            <VerdictBadge verdict={review.verdict} />
            {review.publication && (
              <span className="text-xs text-muted-foreground">
                {publicationText(review.publication, PROVIDERS[review.repository.provider].label)}
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={copyMarkdown} disabled={!result}>
            <Copy />
            Copy markdown
          </Button>
          <Button variant="outline" onClick={runAgain} disabled={rerun.isPending || isActive(review.status)}>
            {rerun.isPending ? <Loader2 className="animate-spin" /> : <RotateCw />}
            Re-run
          </Button>
        </div>
      </div>

      {isActive(review.status) ? (
        <Card>
          <CardContent className="flex items-center gap-3 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            {review.status === "queued" ? "Waiting for a worker..." : "Reviewing the change..."}
          </CardContent>
        </Card>
      ) : result ? (
        <ResultView result={result} />
      ) : (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>
            {review.status === "superseded"
              ? "Superseded by a newer push"
              : review.status === "skipped"
                ? "Skipped"
                : "The review did not run"}
          </AlertTitle>
          {review.error && <AlertDescription>{review.error}</AlertDescription>}
        </Alert>
      )}
    </main>
  )
}
