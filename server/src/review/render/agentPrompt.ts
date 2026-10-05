import type { Finding } from "../core/models.ts";
import { fence, sanitize } from "./markdown.ts";

// Plain text a reader pastes into a coding agent. Each prompt stands on its own
// (file, lines, what is wrong, the proposed fix) because the agent sees none of
// the surrounding comment. Findings can be stale by the time someone acts on
// them, so the agent is told to check before editing.
const VERIFY = "Verify this against the current code first; it may already be fixed.";

function lines(finding: Finding): string {
  return finding.startLine === finding.endLine
    ? `line ${finding.startLine}`
    : `lines ${finding.startLine}-${finding.endLine}`;
}

function describe(finding: Finding): string[] {
  const parts = [`In ${finding.file} around ${lines(finding)}: ${finding.title.trim()}`, "", finding.body.trim()];
  if (finding.suggestion) parts.push("", "Suggested replacement for those lines:", "", finding.suggestion.replace(/\n$/, ""));
  return parts;
}

export function findingPrompt(finding: Finding): string {
  return sanitize([...describe(finding), "", VERIFY].join("\n"));
}

// Every finding in the review, in file order, so one paste covers the change.
export function allFindingsPrompt(findings: Finding[]): string {
  const ordered = [...findings].sort((a, b) => a.file.localeCompare(b.file) || a.startLine - b.startLine);
  const parts = ["Verify each finding against the current code and only fix it if it still applies.", ""];
  ordered.forEach((finding, index) => {
    const [first = "", ...rest] = describe(finding);
    parts.push(`${index + 1}. ${first}`, ...rest.map((line) => (line ? `   ${line}` : "")), "");
  });
  return sanitize(parts.join("\n").trimEnd());
}

// Collapsed, so it never crowds out the comment a person reads first.
export function agentPromptBlock(title: string, prompt: string): string[] {
  return ["<details>", `<summary>🤖 ${title}</summary>`, "", fence(prompt), "", "</details>"];
}
