import { CircleCheck, CircleX, MessageSquareOff } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

// What the settings on the Display tab change about a review, shown on a made
// up change: the PR/MR itself (labels, and the walkthrough when it goes in the
// description), then each comment and the status. The layout follows
// server/src/review/render/markdown.ts and the placement rules in
// server/src/review/publish/publisher.ts, without rendering markdown.

export interface PreviewSettings {
  walkthrough: boolean
  postInline: boolean
  postSummary: boolean
  postCheck: boolean
  committableSuggestions: boolean
  severityFloor?: string
  blockOn?: string
  model?: string
  summaryLocation: "dynamic" | "description" | "comment"
  blastRadiusLabel: boolean
  effortLabel: boolean
}

// The sample's estimates, named as server/src/review/publish/labels.ts names them.
const SAMPLE_BLAST_RADIUS = "medium"
const SAMPLE_BLAST_RADIUS_LABEL = "Medium blast radius"
const SAMPLE_EFFORT_LABEL = "5-10 Minutes"

// Mirrors server/src/review/core/severity.ts.
const RANK: Record<string, number> = { critical: 3, major: 2, minor: 1, info: 0 }
const rank = (severity: string | undefined) => (severity ? (RANK[severity] ?? 0) : 0)

interface SampleFinding {
  severity: string
  category: string
  bucket: "actionable" | "nitpick"
  file: string
  line: number
  title: string
}

const FINDINGS: SampleFinding[] = [
  {
    severity: "major",
    category: "security",
    bucket: "actionable",
    file: "src/api/users.ts",
    line: 42,
    title: "User id is interpolated into the SQL query",
  },
  {
    severity: "minor",
    category: "maintainability",
    bucket: "nitpick",
    file: "src/api/users.ts",
    line: 7,
    title: "Unused import of formatDate",
  },
  { severity: "info", category: "docs", bucket: "nitpick", file: "README.md", line: 18, title: "Typo in the setup steps" },
]

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`

function Location({ finding }: { finding: SampleFinding }) {
  return <code className="rounded bg-muted px-1 text-xs">{`${finding.file}:${finding.line}`}</code>
}

function Comment(props: { title: string; children: React.ReactNode; label: string }) {
  return (
    <section aria-label={props.label} className="overflow-hidden rounded-lg border bg-background">
      <header className="flex items-center gap-2 border-b bg-muted/50 px-3 py-2 text-xs">
        <span className="flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
          B
        </span>
        <span className="font-medium">bammy</span>
        <span className="text-muted-foreground">{props.title}</span>
      </header>
      <div className="flex flex-col gap-3 p-3 text-sm">{props.children}</div>
    </section>
  )
}

function Fold({ summary, children }: { summary: string; children: React.ReactNode }) {
  return (
    <details className="rounded-md border px-3 py-2">
      <summary className="cursor-pointer text-sm font-medium">{summary}</summary>
      <div className="mt-2 flex flex-col gap-1">{children}</div>
    </details>
  )
}

function StatusCheck({ blocked, blockOn, blocking }: { blocked: boolean; blockOn?: string; blocking: number }) {
  const Icon = blocked ? CircleX : CircleCheck
  return (
    <section aria-label="Commit status" className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm">
      <Icon className={cn("size-4 shrink-0", blocked ? "text-destructive" : "text-green-600")} />
      <code className="text-xs font-medium">bammy/review</code>
      <span className="truncate text-muted-foreground">
        {blocked ? `Blocked: ${plural(blocking, "finding")} at or above ${blockOn}` : "Pass"}
      </span>
    </section>
  )
}

function InlineComment({ finding, committable }: { finding: SampleFinding; committable: boolean }) {
  return (
    <Comment label="Inline comment" title={`commented on ${finding.file}`}>
      <pre className="overflow-x-auto rounded-md bg-muted p-2 text-xs">
        <span className="text-muted-foreground">{finding.line} </span>
        {"+ db.query(`SELECT * FROM users WHERE id = ${id}`)"}
      </pre>
      <p>
        <Badge variant="secondary" className="mr-1">
          {finding.severity}
        </Badge>
        <strong>{finding.title}</strong>
      </p>
      <p className="text-muted-foreground">The id comes from the request path, so a crafted value runs arbitrary SQL.</p>
      {committable ? (
        <div className="overflow-hidden rounded-md border">
          <div className="flex items-center justify-between border-b bg-muted/50 px-2 py-1 text-xs">
            <span className="font-medium">Suggested change</span>
            <span className="rounded border bg-background px-1.5 py-0.5">Commit suggestion</span>
          </div>
          <pre className="overflow-x-auto text-xs">
            <div className="bg-destructive/10 px-2">{"- db.query(`SELECT * FROM users WHERE id = ${id}`)"}</div>
            <div className="bg-green-600/10 px-2">{'+ db.query("SELECT * FROM users WHERE id = $1", [id])'}</div>
          </pre>
        </div>
      ) : (
        <pre className="overflow-x-auto rounded-md bg-muted p-2 text-xs">
          {'db.query("SELECT * FROM users WHERE id = $1", [id])'}
        </pre>
      )}
    </Comment>
  )
}

function Walkthrough() {
  return (
    <div className="flex flex-col gap-2" aria-label="Walkthrough" role="group">
      <h5 className="font-semibold">Bammy summary</h5>
      <p>Adds a lookup endpoint for users and documents how to run it locally.</p>
      <p className="text-xs text-muted-foreground">
        Labels: <code>api</code>, <code>security</code> · Review effort: 2/5 · Blast radius: {SAMPLE_BLAST_RADIUS}
      </p>
      <Fold summary="Changes (2 files)">
        <p className="text-xs">
          <code>src/api/users.ts</code>: new GET /users/:id handler
        </p>
        <p className="text-xs">
          <code>README.md</code>: setup steps for the API
        </p>
      </Fold>
    </div>
  )
}

// The sample PR has no description of its own, so "dynamic" fills it.
function PullRequest(props: { settings: PreviewSettings; inDescription: boolean }) {
  const { settings } = props
  const labels = settings.walkthrough
    ? [
        settings.blastRadiusLabel && SAMPLE_BLAST_RADIUS_LABEL,
        settings.effortLabel && SAMPLE_EFFORT_LABEL,
      ].filter((label): label is string => Boolean(label))
    : []
  return (
    <section aria-label="Pull request" className="overflow-hidden rounded-lg border bg-background">
      <header className="flex flex-col gap-2 border-b bg-muted/50 px-3 py-2">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-semibold">Add user lookup endpoint</span>
          <span className="text-muted-foreground">#42</span>
        </div>
        {labels.length > 0 && (
          <ul aria-label="Labels" className="flex flex-wrap gap-1">
            {labels.map((label) => (
              <li key={label}>
                <Badge variant="outline">{label}</Badge>
              </li>
            ))}
          </ul>
        )}
      </header>
      <div className="flex flex-col gap-3 p-3 text-sm">
        {props.inDescription ? (
          <>
            <Walkthrough />
            {settings.summaryLocation === "dynamic" && (
              <p className="text-xs text-muted-foreground">
                Dynamic: this change had no description, so the summary fills it. With one, it is posted as a comment.
              </p>
            )}
          </>
        ) : (
          <p className="text-muted-foreground italic">No description provided.</p>
        )}
      </div>
    </section>
  )
}

function SummaryComment(props: {
  settings: PreviewSettings
  reported: SampleFinding[]
  blocking: SampleFinding[]
}) {
  const { settings, reported, blocking } = props
  const actionable = reported.filter((f) => f.bucket === "actionable")
  const nitpicks = reported.filter((f) => f.bucket === "nitpick")
  const severities = Object.keys(RANK)
    .map((severity) => [severity, reported.filter((f) => f.severity === severity).length] as const)
    .filter(([, count]) => count > 0)
    .map(([severity, count]) => `${count} ${severity}`)
    .join(", ")

  return (
    <Comment label="Summary comment" title="commented">
      <h4 className="text-base font-semibold">Bammy review</h4>
      {blocking.length > 0 ? (
        <div>
          <p>
            ⛔ <strong>Blocked</strong>: {plural(blocking.length, "finding")} at or above {settings.blockOn}.
          </p>
          <ul className="mt-1 list-disc pl-5">
            {blocking.map((finding) => (
              <li key={finding.title}>
                <strong>{finding.severity}</strong> <Location finding={finding} />: {finding.title}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p>
          ✅ <strong>Pass</strong>: no findings at or above {settings.blockOn}.
        </p>
      )}
      <p>
        {reported.length === 0
          ? "No findings."
          : `${plural(reported.length, "finding")} (${severities}): ${actionable.length} actionable, ${
              reported.length - actionable.length
            } in the sections below.`}
      </p>
      {actionable.length > 0 && (
        <Fold summary={`Actionable comments (${actionable.length})`}>
          {actionable.map((finding) => (
            <p key={finding.title} className="text-xs">
              <strong>{finding.severity}</strong> <Location finding={finding} />: {finding.title}
            </p>
          ))}
        </Fold>
      )}
      {nitpicks.length > 0 && (
        <Fold summary={`Nitpick comments (${nitpicks.length})`}>
          {nitpicks.map((finding) => (
            <p key={finding.title} className="text-xs">
              <Location finding={finding} />: {finding.title}{" "}
              <em className="text-muted-foreground">
                {finding.severity} · {finding.category}
              </em>
            </p>
          ))}
        </Fold>
      )}
      <p className="text-xs text-muted-foreground">
        Reviewed <code>a1b2c3d</code> with {settings.model ?? "the configured model"} · 1 review pass · 2 files
        reviewed
      </p>
    </Comment>
  )
}

export function ReviewPreview({ settings }: { settings: PreviewSettings }) {
  const reported = FINDINGS.filter((f) => rank(f.severity) >= rank(settings.severityFloor))
  const blocking = reported.filter((f) => settings.blockOn !== undefined && rank(f.severity) >= rank(settings.blockOn))
  const inline = reported.find((f) => f.bucket === "actionable")
  // Mirrors publishes() in server/src/review/publish/publisher.ts; labels need the walkthrough.
  const nothing = !settings.postInline && !settings.postSummary && !settings.postCheck && !settings.walkthrough
  const inDescription = settings.walkthrough && settings.summaryLocation !== "comment"

  return (
    <div className="flex flex-col gap-3">
      {nothing ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed bg-background p-6 text-center text-sm text-muted-foreground">
          <MessageSquareOff className="size-5" />
          Bammy posts nothing to the change. Reviews still show up in the dashboard.
        </div>
      ) : (
        <>
          <PullRequest settings={settings} inDescription={inDescription} />
          {settings.postCheck && (
            <StatusCheck blocked={blocking.length > 0} blockOn={settings.blockOn} blocking={blocking.length} />
          )}
          {settings.postSummary && <SummaryComment settings={settings} reported={reported} blocking={blocking} />}
          {settings.walkthrough && !inDescription && (
            <Comment label="PR summary comment" title="commented">
              <Walkthrough />
            </Comment>
          )}
          {settings.postInline && inline && (
            <InlineComment finding={inline} committable={settings.committableSuggestions} />
          )}
        </>
      )}
    </div>
  )
}
