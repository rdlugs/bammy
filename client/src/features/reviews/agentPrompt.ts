import type { Finding } from "./types"

// Same text as the prompts in the forge comment (server/src/review/render/agentPrompt.ts),
// so copying from the dashboard and from the PR gives the agent the same thing. Keep the
// two in sync. The server also escapes forge mentions; a clipboard paste needs none of that.
const VERIFY = "Verify this against the current code first; it may already be fixed."

function lines(finding: Finding) {
  return finding.startLine === finding.endLine
    ? `line ${finding.startLine}`
    : `lines ${finding.startLine}-${finding.endLine}`
}

function describe(finding: Finding) {
  const parts = [`In ${finding.file} around ${lines(finding)}: ${finding.title.trim()}`, "", finding.body.trim()]
  if (finding.suggestion) parts.push("", "Suggested replacement for those lines:", "", finding.suggestion.replace(/\n$/, ""))
  return parts
}

export function findingPrompt(finding: Finding) {
  return [...describe(finding), "", VERIFY].join("\n")
}

export function allFindingsPrompt(findings: Finding[]) {
  const ordered = [...findings].sort((a, b) => a.file.localeCompare(b.file) || a.startLine - b.startLine)
  const parts = ["Verify each finding against the current code and only fix it if it still applies.", ""]
  ordered.forEach((finding, index) => {
    const [first = "", ...rest] = describe(finding)
    parts.push(`${index + 1}. ${first}`, ...rest.map((line) => (line ? `   ${line}` : "")), "")
  })
  return parts.join("\n").trimEnd()
}

