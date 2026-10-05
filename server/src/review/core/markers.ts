// Hidden HTML comments Bammy leaves in what it posts, so a later run can find
// its own summary and tell which findings it already commented on.

export const SUMMARY_MARKER = "<!-- bammy:summary -->";
// A walkthrough posted as a comment of its own.
export const WALKTHROUGH_MARKER = "<!-- bammy:walkthrough -->";
// Earlier versions wrote the walkthrough into the PR/MR description between
// these. It now lives in the review comment; the markers remain so a change
// read from the forge, and the description itself, can be cleaned of it.
export const DESCRIPTION_START = "<!-- bammy:walkthrough:start -->";
export const DESCRIPTION_END = "<!-- bammy:walkthrough:end -->";

// The high-level summary (output.highLevelSummary) written into the
// description; a run replaces the block it finds.
export const DESCRIPTION_SUMMARY_START = "<!-- bammy:summary:start -->";
export const DESCRIPTION_SUMMARY_END = "<!-- bammy:summary:end -->";

const LEGACY_BLOCK = /\n*<!-- bammy:walkthrough:start -->[\s\S]*?<!-- bammy:walkthrough:end -->\n*/g;
const SUMMARY_BLOCK = /\n*<!-- bammy:summary:start -->[\s\S]*?<!-- bammy:summary:end -->\n*/g;

// The description without Bammy's blocks, so a review never reads its own
// earlier summary as the author's intent.
export function withoutDescriptionBlock(description: string): string {
  return description.replace(LEGACY_BLOCK, "\n\n").replace(SUMMARY_BLOCK, "\n\n").trim();
}

// The description Bammy leaves behind: `summary` as its only block, at the
// end; or, when `summary` is null, the current summary block kept (a run
// without one, such as a failed walkthrough, does not erase it); or, when
// `summary` is "", no block at all. Exactly the input when nothing changes, so
// the author's own text never triggers an edit.
export function withDescriptionSummary(description: string, summary: string | null): string {
  let next: string;
  if (summary === null) {
    next = description.replace(LEGACY_BLOCK, "\n\n").trim();
  } else {
    const base = withoutDescriptionBlock(description);
    next = summary ? (base ? `${base}\n\n${summary}` : summary) : base;
  }
  return next === description.trim() ? description : next;
}

const FINGERPRINT_MARKER = /<!-- bammy:fp=([0-9a-f]{16}) -->/g;

export function fingerprintMarker(fingerprint: string): string {
  return `<!-- bammy:fp=${fingerprint} -->`;
}

export function markersIn(body: string): string[] {
  return [...body.matchAll(FINGERPRINT_MARKER)].map((match) => match[1]!);
}
