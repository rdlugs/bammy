import { useState, type ReactNode } from "react"
import {
  CircleCheck,
  CircleDot,
  CircleX,
  Clock,
  FileCode,
  GitPullRequest,
  MessageSquare,
  MessageSquareOff,
  RotateCcw,
} from "lucide-react"
import { SearchableSelect } from "@/components/SearchableSelect"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Skeleton } from "@/components/ui/skeleton"
import { PROVIDER_IDS, PROVIDERS } from "@/features/forge/providers"
import { cn } from "@/lib/utils"
import {
  useConfigPreview,
  type ForgeProvider,
  type PreviewPublication,
  type PreviewRequest,
} from "./api"
import { ForgeMarkdown } from "./ForgeMarkdown"

// What a review posts with the settings in the form, drawn as the PR/MR page
// it lands on. The content is not mocked here: the server runs the real
// pipeline and renderers on a sample change (server/src/review/preview), so
// every word matches what Bammy would post.

type Inline = PreviewPublication["inline"][number]
type Status = NonNullable<PreviewPublication["status"]>

const FORGES = PROVIDER_IDS.map((id) => ({ value: id, label: PROVIDERS[id].label, icon: PROVIDERS[id].icon }))

// The summary and the inline threads are previewed one at a time so neither
// is pushed below the fold by the other.
type View = "summary" | "inline"

const VIEWS = [
  { value: "summary", label: "Summary", icon: MessageSquare },
  { value: "inline", label: "In-line", icon: FileCode },
]

// Stand-ins for the colours a project gives its labels.
const LABEL_COLOURS = [
  "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
  "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30",
]

function Avatar(props: { name: string; bot?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
        props.bot ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
      )}
    >
      {props.name[0]!.toUpperCase()}
    </span>
  )
}

// One entry in the conversation (GitHub) or activity (GitLab).
function Note(props: {
  provider: ForgeProvider
  label: string
  author: string
  bot?: boolean
  action: string
  children: ReactNode
}) {
  const github = props.provider === "github"
  const handle = github ? (props.bot ? `${props.author}[bot]` : props.author) : `@${props.author}`
  return (
    <section aria-label={props.label} className="flex gap-2">
      <Avatar name={props.author} bot={props.bot} />
      <div className={cn("min-w-0 flex-1 overflow-hidden border bg-background", github ? "rounded-md" : "rounded-sm")}>
        <header
          className={cn(
            "flex flex-wrap items-center gap-x-1.5 gap-y-0.5 border-b px-3 py-1.5 text-xs",
            github ? "bg-muted/50" : "bg-background",
          )}
        >
          <span className="font-semibold">{github ? handle : props.author}</span>
          {!github && <span className="text-muted-foreground">{handle}</span>}
          {props.bot && github && <span className="rounded-full border px-1.5 text-[10px] text-muted-foreground">bot</span>}
          <span className="text-muted-foreground">{props.action}</span>
        </header>
        <div className="p-3">{props.children}</div>
      </div>
    </section>
  )
}

function DiffHunk({ comment }: { comment: Inline }) {
  return (
    <div className="overflow-hidden rounded-md border text-xs">
      <div className="border-b bg-muted/50 px-3 py-1.5 font-mono">{comment.path}</div>
      <div className="overflow-x-auto">
        <table className="w-full font-mono">
          <tbody>
            {comment.diff.map((line) => (
              <tr key={line.newLine} className={line.type === "add" ? "bg-green-600/10" : undefined}>
                <td className="w-8 px-1 text-right text-muted-foreground select-none">{line.oldLine ?? ""}</td>
                <td className="w-8 px-1 text-right text-muted-foreground select-none">{line.newLine}</td>
                <td className="px-2 whitespace-pre">
                  {line.type === "add" ? "+" : " "}
                  {line.text}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function InlineThread(props: { provider: ForgeProvider; comment: Inline }) {
  const { comment, provider } = props
  const original = comment.diff
    .filter((line) => line.newLine >= comment.startLine && line.newLine <= comment.endLine)
    .map((line) => line.text)
  return (
    <div className="flex flex-col gap-2">
      <DiffHunk comment={comment} />
      <div className="ml-4 border-l-2 pl-3">
        <ForgeMarkdown provider={provider} original={original}>
          {comment.body}
        </ForgeMarkdown>
      </div>
    </div>
  )
}

const STATUS_TEXT: Record<ForgeProvider, Record<Status["state"], string>> = {
  github: { success: "Successful", failure: "Failing", error: "Errored", pending: "Pending" },
  gitlab: { success: "passed", failure: "failed", error: "failed", pending: "pending" },
}

function StatusRow(props: { provider: ForgeProvider; status: Status }) {
  const { state } = props.status
  const Icon = state === "success" ? CircleCheck : state === "pending" ? Clock : CircleX
  const github = props.provider === "github"
  return (
    <section
      aria-label="Commit status"
      className="flex flex-wrap items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm"
    >
      <Icon className={cn("size-4 shrink-0", state === "success" ? "text-green-600" : "text-destructive")} />
      {github ? (
        <>
          <code className="text-xs font-semibold">bammy/review</code>
          <span className="text-muted-foreground">
            {STATUS_TEXT.github[state]}: {props.status.description}
          </span>
        </>
      ) : (
        <span className="text-muted-foreground">
          External status <code className="text-xs font-semibold text-foreground">bammy/review</code>{" "}
          {STATUS_TEXT.gitlab[state]}: {props.status.description}
        </span>
      )}
    </section>
  )
}

function PageHeader({ preview }: { preview: PreviewPublication }) {
  const { pr, provider } = preview
  const github = provider === "github"
  return (
    <header className="flex flex-col gap-2 border-b pb-3">
      <h4 className="text-base font-semibold">
        {pr.title} <span className="font-normal text-muted-foreground">{github ? `#${pr.number}` : `!${pr.number}`}</span>
      </h4>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span
          className={cn(
            "inline-flex items-center gap-1 px-2 py-0.5 font-medium text-white",
            github ? "rounded-full bg-green-600" : "rounded-sm bg-sky-600",
          )}
        >
          {github ? <GitPullRequest className="size-3.5" /> : <CircleDot className="size-3.5" />}
          Open
        </span>
        <span>
          <strong className="text-foreground">{pr.author}</strong>{" "}
          {github ? (
            <>
              wants to merge into <code>{pr.targetBranch}</code> from <code>{pr.sourceBranch}</code>
            </>
          ) : (
            <>
              requested to merge <code>{pr.sourceBranch}</code> into <code>{pr.targetBranch}</code>
            </>
          )}
        </span>
      </div>
      {pr.labels.length > 0 && (
        <ul aria-label="Labels" className="flex flex-wrap gap-1">
          {pr.labels.map((label, i) => (
            <li
              key={label}
              className={cn(
                "border px-2 py-0.5 text-xs font-medium",
                github ? "rounded-full" : "rounded-sm",
                LABEL_COLOURS[i % LABEL_COLOURS.length],
              )}
            >
              {label}
            </li>
          ))}
        </ul>
      )}
    </header>
  )
}

function NothingPosted({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed bg-background p-6 text-center text-sm text-muted-foreground">
      <MessageSquareOff className="size-5" />
      {children}
    </div>
  )
}

function ForgePage({ preview, view }: { preview: PreviewPublication; view: View }) {
  const { pr, provider } = preview
  const github = provider === "github"

  if (view === "inline") {
    // One thread shows the format; the sample change has several findings,
    // and repeating them only makes the preview longer.
    const [example] = preview.inline
    return (
      <div className="flex flex-col gap-3">
        <PageHeader preview={preview} />
        {!example ? (
          <NothingPosted>Bammy posts no inline comments on the diff.</NothingPosted>
        ) : (
          <>
            <Note
              provider={provider}
              label="Inline comments"
              author="bammy"
              bot
              action={github ? "reviewed" : "started a thread on the diff"}
            >
              <InlineThread provider={provider} comment={example} />
            </Note>
            <p className="text-xs text-muted-foreground">
              One example. Bammy posts a thread like this for each finding on the diff.
            </p>
          </>
        )}
      </div>
    )
  }

  const nothing = !preview.summaryComment && !preview.walkthroughComment && !preview.status && pr.labels.length === 0
  return (
    <div className="flex flex-col gap-3">
      <PageHeader preview={preview} />
      {/* GitLab shows the status in the merge request widget, above the activity. */}
      {!github && preview.status && <StatusRow provider={provider} status={preview.status} />}
      {nothing && <NothingPosted>Bammy posts no summary to the change. Reviews still show up in the dashboard.</NothingPosted>}
      {preview.summaryComment && (
        <Note provider={provider} label="Summary comment" author="bammy" bot action="commented">
          <ForgeMarkdown provider={provider}>{preview.summaryComment}</ForgeMarkdown>
        </Note>
      )}
      {preview.walkthroughComment && (
        <Note provider={provider} label="PR summary comment" author="bammy" bot action="commented">
          <ForgeMarkdown provider={provider}>{preview.walkthroughComment}</ForgeMarkdown>
        </Note>
      )}
      {github && preview.status && <StatusRow provider={provider} status={preview.status} />}
    </div>
  )
}

// `request` is null while the form holds values the server would reject; the
// last good preview then stays up.
export function ReviewPreview({ request }: { request: Omit<PreviewRequest, "provider"> | null }) {
  const [provider, setProvider] = useState<ForgeProvider>("github")
  // Only filters the loaded preview, so switching never refetches.
  const [view, setView] = useState<View>("summary")
  const preview = useConfigPreview(request && { provider, ...request })

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        <Field className="w-full sm:w-56">
          <FieldLabel htmlFor="preview-forge">Forge</FieldLabel>
          <SearchableSelect
            id="preview-forge"
            value={provider}
            onValueChange={(value) => setProvider(value as ForgeProvider)}
            options={FORGES}
          />
        </Field>
        <Field className="w-full sm:w-56">
          <FieldLabel htmlFor="preview-view">View</FieldLabel>
          <SearchableSelect
            id="preview-view"
            value={view}
            onValueChange={(value) => setView(value as View)}
            options={VIEWS}
          />
        </Field>
      </div>
      {!request && preview.data && (
        <p className="text-xs text-muted-foreground">Fix the highlighted fields to update the preview.</p>
      )}
      {preview.isError && !preview.data ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-6 text-center text-sm">
          <p className="text-destructive">Could not render the preview.</p>
          <Button type="button" variant="outline" size="sm" onClick={() => preview.refetch()}>
            <RotateCcw />
            Try again
          </Button>
        </div>
      ) : preview.data ? (
        <div className={cn("transition-opacity", preview.isPlaceholderData && "opacity-60")}>
          <ForgePage preview={preview.data} view={view} />
        </div>
      ) : (
        <div aria-label="Loading preview" className="flex flex-col gap-3">
          <Skeleton className="h-12" />
          <Skeleton className="h-24" />
          <Skeleton className="h-40" />
        </div>
      )}
    </div>
  )
}
