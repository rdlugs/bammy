import type { ReactNode } from "react"
import { Link, useNavigate, useParams } from "react-router"
import { AlertTriangle, ArrowLeft, Bot, Copy, ExternalLink, Loader2, RotateCw } from "lucide-react"
import { toast } from "sonner"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { allFindingsPrompt } from "@/features/reviews/agentPrompt"
import { fetchReviewMarkdown, useRerunReview, useReview } from "@/features/reviews/api"
import { StatusBadge, VerdictBadge } from "@/features/reviews/badges"
import { FindingsSection } from "@/features/reviews/detail/FindingsSection"
import { ReviewSidebar } from "@/features/reviews/detail/ReviewSidebar"
import { PROVIDERS } from "@/features/forge/providers"
import { changeLabel } from "@/features/reviews/links"
import { copyToClipboard } from "@/lib/clipboard"
import { MermaidDiagram } from "@/components/MermaidDiagram"
import { ForgeMarkdown } from "@/features/config/ForgeMarkdown"
import { isActive, type IssueAssessment, type IssueRef, type ReviewResult } from "@/features/reviews/types"

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

const ASSESSMENT_LABEL: Record<IssueAssessment, string> = {
  addressed: "Addressed",
  partial: "Partly addressed",
  not_addressed: "Not addressed",
  unclear: "Unclear",
}

function IssueLink({ issue }: { issue: IssueRef }) {
  const label = (
    <>
      <span className="font-mono text-xs">{issue.ref}</span> {issue.title}
    </>
  )
  return issue.url && /^https?:\/\//.test(issue.url) ? (
    <a href={issue.url} target="_blank" rel="noreferrer" className="underline-offset-4 hover:underline">
      {label}
    </a>
  ) : (
    <span>{label}</span>
  )
}

function WalkthroughBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2 border-t pt-4">
      <h3 className="text-sm font-medium">{title}</h3>
      {children}
    </section>
  )
}

function Walkthrough({
  walkthrough,
  provider,
}: {
  walkthrough: NonNullable<ReviewResult["walkthrough"]>
  provider: ReviewResult["change"]["provider"]
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Walkthrough</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 text-sm">
        <p className="whitespace-pre-wrap">{walkthrough.overview}</p>
        <div className="flex flex-wrap items-center gap-2">
          {walkthrough.labels.map((label) => (
            <Badge key={label} variant="secondary">
              {label}
            </Badge>
          ))}
          <span className="text-muted-foreground">Review effort {walkthrough.estimatedEffort}/5</span>
        </div>
        {walkthrough.fileSummaries.length > 0 && (
          <dl className="grid gap-x-4 gap-y-2 border-t pt-4 sm:grid-cols-[minmax(0,16rem)_1fr]">
            {walkthrough.fileSummaries.map((entry) => (
              <div key={entry.path} className="contents">
                <dt className="font-mono text-xs break-all text-muted-foreground sm:pt-0.5">{entry.path}</dt>
                <dd className="mb-2 sm:mb-0">{entry.summary}</dd>
              </div>
            ))}
          </dl>
        )}
        {walkthrough.highLevelSummary && (
          <WalkthroughBlock title="High-level summary">
            <ForgeMarkdown provider={provider}>{walkthrough.highLevelSummary}</ForgeMarkdown>
          </WalkthroughBlock>
        )}
        {walkthrough.sequenceDiagram && (
          <WalkthroughBlock title="Sequence diagram">
            <MermaidDiagram source={walkthrough.sequenceDiagram} />
          </WalkthroughBlock>
        )}
        {walkthrough.linkedIssues && walkthrough.linkedIssues.length > 0 && (
          <WalkthroughBlock title="Linked issues">
            <ul className="flex flex-col gap-2">
              {walkthrough.linkedIssues.map((issue) => (
                <li key={issue.ref} className="flex flex-col gap-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <IssueLink issue={issue} />
                    <Badge variant="outline">{ASSESSMENT_LABEL[issue.assessment]}</Badge>
                  </div>
                  {issue.note && <p className="text-muted-foreground">{issue.note}</p>}
                </li>
              ))}
            </ul>
          </WalkthroughBlock>
        )}
        {walkthrough.relatedIssues && walkthrough.relatedIssues.length > 0 && (
          <WalkthroughBlock title="Possibly related issues">
            <ul className="flex flex-col gap-1">
              {walkthrough.relatedIssues.map((issue) => (
                <li key={issue.ref}>
                  <IssueLink issue={issue} />
                  {issue.reason && <span className="text-muted-foreground">: {issue.reason}</span>}
                </li>
              ))}
            </ul>
          </WalkthroughBlock>
        )}
      </CardContent>
    </Card>
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
      {result.walkthrough && <Walkthrough walkthrough={result.walkthrough} provider={result.change.provider} />}
      <FindingsSection result={result} />
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
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
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
      <header className="flex flex-wrap items-start gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 className="text-2xl font-semibold tracking-tight break-words">{title}</h2>
          <p className="text-sm text-muted-foreground">
            {review.repository.fullPath} {changeLabel(review.repository.provider, review.number)}
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
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => result && copyToClipboard(allFindingsPrompt(result.findings), "Agent prompt")}
            disabled={!result?.findings.length}
          >
            <Bot />
            Copy prompt for all findings
          </Button>
          <Button
            variant="outline"
            onClick={() => copyToClipboard(fetchReviewMarkdown(review.id), "Markdown")}
            disabled={!result}
          >
            <Copy />
            Copy markdown
          </Button>
          <Button variant="outline" onClick={runAgain} disabled={rerun.isPending || isActive(review.status)}>
            {rerun.isPending ? <Loader2 className="animate-spin" /> : <RotateCw />}
            Re-run
          </Button>
        </div>
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-6">
          {isActive(review.status) ? (
            <Card>
              <CardContent className="flex items-center gap-3 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                {review.status === "queued" ? "Waiting for a worker..." : "Reviewing the change..."}
              </CardContent>
            </Card>
          ) : result ? (
            // Keyed so a re-run navigating here starts with fresh collapse state.
            <ResultView key={review.id} result={result} />
          ) : (
            <Alert variant="destructive">
              <AlertTriangle />
              <AlertTitle>
                {review.status === "superseded"
                  ? "Superseded by a newer push"
                  : review.status === "skipped"
                    ? "Skipped"
                    : review.status === "cancelled"
                      ? "Cancelled because the change was closed"
                      : "The review did not run"}
              </AlertTitle>
              {review.error && <AlertDescription>{review.error}</AlertDescription>}
            </Alert>
          )}
        </div>
        <ReviewSidebar review={review} result={result} />
      </div>
    </main>
  )
}
