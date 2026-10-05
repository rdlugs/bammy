import { BUCKET_TITLE, SUMMARY_BUCKETS } from "../core/buckets.ts";
import type { Finding, Omission, ReviewResult } from "../core/models.ts";
import { SEVERITIES } from "../core/severity.ts";
import { SUMMARY_MARKER } from "../core/markers.ts";
import { agentPromptBlock, allFindingsPrompt } from "./agentPrompt.ts";
import { summarize } from "./json.ts";

export { SUMMARY_MARKER };

// Forges fetch the image themselves, so it must be a public absolute URL.
const LOGO_URL = "https://raw.githubusercontent.com/rdlugs/bammy/main/client/public/bammy-32.png";

// The only place Bammy names itself in what it posts: a small credit at the
// bottom of every comment, so the content reads as the review, not the tool.
export const BRAND_FOOTER = `<sub><img src="${LOGO_URL}" alt="" width="14" height="14" align="absmiddle"> Bammy</sub>`;

const VERDICT_LINE = {
  pass: "✅ **Pass**",
  blocked: "⛔ **Blocked**",
  error: "⚠️ **Review incomplete**",
} as const;

const OMISSION_TEXT: Record<Omission["reason"], string> = {
  ignored: "ignored by configuration",
  binary: "binary file",
  deleted: "deleted",
  patch_unavailable: "diff not provided by the forge",
  too_large: "too large for one review pass",
  budget: "review pass limit reached",
  chunk_failed: "review pass failed",
};

// Model text is posted under Bammy's name, so it must not ping people, close
// HTML it did not open, or forge Bammy's own markers.
export function sanitize(text: string): string {
  return text
    .replace(/<!--\s*bammy:/gi, "<!-- (quoted) bammy:")
    .replace(/(^|[^\w`])@(?=[\w-])/g, "$1@​");
}

// For text inside HTML (summary tags) and table cells.
function inline(text: string): string {
  return sanitize(text).replace(/[<>]/g, (c) => (c === "<" ? "&lt;" : "&gt;")).replace(/\|/g, "\\|").replace(/\n+/g, " ");
}

function location(finding: Finding): string {
  const lines = finding.startLine === finding.endLine ? `${finding.startLine}` : `${finding.startLine}-${finding.endLine}`;
  return `\`${finding.file}:${lines}\``;
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

export function fence(code: string, language = ""): string {
  const longest = Math.max(2, ...[...code.matchAll(/`+/g)].map((m) => m[0].length));
  const ticks = "`".repeat(longest + 1);
  return `${ticks}${language}\n${code.replace(/\n$/, "")}\n${ticks}`;
}

function verdictSection(result: ReviewResult): string[] {
  const { verdict, blockOn, blocking } = result.verdict;
  const lines: string[] = [];
  if (verdict === "blocked") {
    lines.push(`${VERDICT_LINE.blocked}: ${plural(blocking.length, "finding")} at or above ${blockOn}.`);
  } else if (verdict === "pass") {
    lines.push(`${VERDICT_LINE.pass}: no findings at or above ${blockOn}.`);
  } else {
    const why = result.status === "failed" ? "the review did not complete" : "part of the change was not reviewed";
    lines.push(`${VERDICT_LINE.error}: ${why}, so the absence of findings is not a pass.`);
  }

  if (blocking.length) {
    const byPrint = new Map(result.findings.map((f) => [f.fingerprint, f]));
    lines.push("");
    for (const print of blocking) {
      const finding = byPrint.get(print);
      if (finding) lines.push(`- **${finding.severity}** ${location(finding)}: ${inline(finding.title)}`);
    }
  }
  return lines;
}

function countsLine(result: ReviewResult): string {
  const summary = summarize(result);
  if (summary.total === 0) return "No findings.";
  const severities = SEVERITIES.filter((s) => summary.bySeverity[s])
    .map((s) => `${summary.bySeverity[s]} ${s}`)
    .join(", ");
  const inlineCount = summary.byBucket.actionable ?? 0;
  const rest = summary.total - inlineCount;
  return `${plural(summary.total, "finding")} (${severities}): ${inlineCount} actionable, ${rest} in the sections below.`;
}

function walkthroughSection(result: ReviewResult): string[] {
  const walkthrough = result.walkthrough;
  if (!walkthrough) return [];
  const lines = ["### Walkthrough", "", sanitize(walkthrough.overview)];
  const meta = [
    walkthrough.labels.length ? `Labels: ${walkthrough.labels.map((l) => `\`${inline(l)}\``).join(", ")}` : "",
    `Review effort: ${walkthrough.estimatedEffort}/5`,
    walkthrough.blastRadius ? `Blast radius: ${walkthrough.blastRadius}` : "",
  ].filter(Boolean);
  lines.push("", meta.join(" · "));
  if (walkthrough.fileSummaries.length) {
    lines.push("", "<details>", `<summary>Changes (${plural(walkthrough.fileSummaries.length, "file")})</summary>`, "");
    lines.push("| File | Summary |", "| --- | --- |");
    for (const entry of walkthrough.fileSummaries) {
      lines.push(`| \`${inline(entry.path)}\` | ${inline(entry.summary)} |`);
    }
    lines.push("", "</details>");
  }
  return lines;
}

function findingDetail(finding: Finding): string[] {
  const lines = [
    `#### ${location(finding)}: ${inline(finding.title)}`,
    "",
    `*${finding.severity} · ${finding.category} · ${finding.kind.replace(/_/g, " ")}*`,
    "",
    sanitize(finding.body),
  ];
  if (finding.evidenceNote) lines.push("", `**Evidence:** ${sanitize(finding.evidenceNote)}`);
  if (finding.suggestion) lines.push("", fence(finding.suggestion));
  return lines;
}

function bucketSections(result: ReviewResult): string[] {
  const lines: string[] = [];
  const actionable = result.findings.filter((f) => f.bucket === "actionable");
  if (actionable.length) {
    // Each has its own inline thread; the summary only indexes them.
    lines.push("", "<details>", `<summary>${BUCKET_TITLE.actionable} (${actionable.length})</summary>`, "");
    for (const finding of actionable) {
      lines.push(`- **${finding.severity}** ${location(finding)}: ${inline(finding.title)}`);
    }
    lines.push("", "</details>");
  }
  for (const bucket of SUMMARY_BUCKETS) {
    const findings = result.findings.filter((f) => f.bucket === bucket);
    if (!findings.length) continue;
    lines.push("", "<details>", `<summary>${BUCKET_TITLE[bucket]} (${findings.length})</summary>`, "");
    findings.forEach((finding, index) => {
      if (index) lines.push("");
      lines.push(...findingDetail(finding));
    });
    lines.push("", "</details>");
  }
  return lines;
}

function coverageSection(result: ReviewResult): string[] {
  const lines: string[] = [];
  const { omissions } = result.coverage;
  if (omissions.length) {
    lines.push("", "<details>", `<summary>Not reviewed (${plural(omissions.length, "item")})</summary>`, "");
    for (const omission of omissions) {
      const detail = omission.detail ? `, ${inline(omission.detail)}` : "";
      lines.push(`- \`${inline(omission.path)}\`: ${OMISSION_TEXT[omission.reason]}${detail}`);
    }
    lines.push("", "</details>");
  }
  const notes = [...result.errors, ...result.warnings];
  if (notes.length) {
    lines.push("", "**Notes**", "", ...notes.map((note) => `- ${inline(note)}`));
  }
  return lines;
}

function footer(result: ReviewResult): string {
  const models = [...new Set(result.usage.map((u) => u.model))].join(", ") || "no model call";
  const passes = plural(result.coverage.passes, "review pass");
  return `<sub>Reviewed \`${result.change.headSha.slice(0, 7)}\` with ${models} · ${passes} · ${plural(result.coverage.reviewedFiles.length, "file")} reviewed</sub>`;
}

// The one markdown document for a review. The forge summary comment and the
// dashboard's "copy markdown" are this function's output, byte for byte; it
// depends only on the result, so re-rendering a stored review reproduces it.
// The walkthrough, when there is one, opens the document under the same
// heading, so one comment carries what the change does and what the review
// found. `walkthrough: false` leaves it out, and `stats: false` the line
// naming the commit, models and coverage (output.reviewStats), and
// `agentPrompt: false` the one prompt covering every finding
// (output.agentPromptAll).
export function toMarkdown(
  result: ReviewResult,
  options: { walkthrough?: boolean; stats?: boolean; agentPrompt?: boolean } = {},
): string {
  const walkthrough = options.walkthrough === false ? [] : walkthroughSection(result);
  const lines = ["## Summary"];
  if (walkthrough.length) lines.push(...walkthrough.slice(1));
  lines.push("", ...verdictSection(result), "", countsLine(result));
  lines.push(...bucketSections(result));
  if (options.agentPrompt !== false && result.findings.length) {
    lines.push("", ...agentPromptBlock("Prompt for all review comments with AI agents", allFindingsPrompt(result.findings)));
  }
  lines.push(...coverageSection(result));
  if (options.stats !== false) lines.push("", footer(result));
  lines.push("", BRAND_FOOTER, "", SUMMARY_MARKER);
  return `${lines.join("\n")}\n`;
}

// The walkthrough on its own, for a comment of its own while the review
// comment is turned off. Empty when the review has none.
export function walkthroughMarkdown(result: ReviewResult): string {
  const section = walkthroughSection(result);
  if (!section.length) return "";
  return `${["## Summary", ...section.slice(1), "", BRAND_FOOTER].join("\n")}\n`;
}
