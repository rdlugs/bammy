import { ExternalLink } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { SeverityBadge } from "./badges"
import { forgeFileUrl } from "./links"
import type { Finding, ReviewResult } from "./types"

export function FindingCard({ finding, change }: { finding: Finding; change: ReviewResult["change"] }) {
  const lines = finding.startLine === finding.endLine ? `${finding.startLine}` : `${finding.startLine}-${finding.endLine}`
  return (
    <article className="flex flex-col gap-3 rounded-lg border p-4" aria-label={finding.title}>
      <div className="flex flex-wrap items-center gap-2">
        <SeverityBadge severity={finding.severity} />
        <Badge variant="outline">{finding.category}</Badge>
        {finding.kind !== "potential_issue" && <Badge variant="outline">{finding.kind.replace(/_/g, " ")}</Badge>}
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
      <h3 className="font-medium">{finding.title}</h3>
      {/* Model text is shown as plain text; it is never rendered as HTML. */}
      <p className="text-sm whitespace-pre-wrap">{finding.body}</p>
      {finding.evidenceNote && (
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Evidence ({finding.evidence.replace(/_/g, " ")}):</span>{" "}
          {finding.evidenceNote}
        </p>
      )}
      {finding.suggestion && (
        <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">
          <code>{finding.suggestion}</code>
        </pre>
      )}
      <p className="text-xs text-muted-foreground">
        Confidence {Math.round(finding.confidence * 100)}% · {finding.effort.replace(/_/g, " ")}
      </p>
    </article>
  )
}
