import { Bot, ChevronRight, Copy, ExternalLink } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { copyToClipboard } from "@/lib/clipboard"
import { cn } from "@/lib/utils"
import { findingPrompt } from "./agentPrompt"
import { SeverityBadge } from "./badges"
import { SEVERITY_BORDER } from "./severity"
import { forgeFileUrl } from "./links"
import type { Finding, ReviewResult } from "./types"

export function FindingCard({
  finding,
  change,
  open,
  onOpenChange,
}: {
  finding: Finding
  change: ReviewResult["change"]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const lines = finding.startLine === finding.endLine ? `${finding.startLine}` : `${finding.startLine}-${finding.endLine}`
  return (
    <Collapsible asChild open={open} onOpenChange={onOpenChange}>
      <article
        className={cn("rounded-lg border border-l-4 bg-card", SEVERITY_BORDER[finding.severity])}
        aria-label={finding.title}
      >
        <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
          <ChevronRight
            aria-hidden
            className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")}
          />
          <SeverityBadge severity={finding.severity} />
          <h4 className="min-w-0 flex-1 truncate text-sm font-medium">{finding.title}</h4>
          <span className="hidden shrink-0 font-mono text-xs text-muted-foreground sm:inline">L{lines}</span>
        </CollapsibleTrigger>
        <CollapsibleContent className="flex flex-col gap-3 border-t px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{finding.category}</Badge>
            {finding.kind !== "potential_issue" && <Badge variant="outline">{finding.kind.replace(/_/g, " ")}</Badge>}
            <span className="text-xs text-muted-foreground">
              Confidence {Math.round(finding.confidence * 100)}% · {finding.effort.replace(/_/g, " ")}
            </span>
            <a
              href={forgeFileUrl(change, finding.file, finding.startLine, finding.endLine)}
              target="_blank"
              rel="noreferrer"
              className="ml-auto inline-flex items-center gap-1 font-mono text-xs text-muted-foreground hover:underline"
            >
              {finding.file}:{lines}
              <ExternalLink className="size-3" />
            </a>
          </div>
          {/* Model text is shown as plain text; it is never rendered as HTML. */}
          <p className="text-sm whitespace-pre-wrap">{finding.body}</p>
          {finding.evidenceNote && (
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Evidence ({finding.evidence.replace(/_/g, " ")}):</span>{" "}
              {finding.evidenceNote}
            </p>
          )}
          {finding.suggestion && (
            <div className="relative">
              <pre className="overflow-x-auto rounded-md bg-muted p-3 pr-10 text-xs">
                <code>{finding.suggestion}</code>
              </pre>
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-1 right-1 size-7"
                aria-label="Copy suggestion"
                onClick={() => copyToClipboard(finding.suggestion!, "Suggestion")}
              >
                <Copy />
              </Button>
            </div>
          )}
          <div>
            <Button variant="outline" size="sm" onClick={() => copyToClipboard(findingPrompt(finding), "Agent prompt")}>
              <Bot />
              Copy agent prompt
            </Button>
          </div>
        </CollapsibleContent>
      </article>
    </Collapsible>
  )
}
