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

const DESCRIPTION_BLOCK = /\n*<!-- bammy:walkthrough:start -->[\s\S]*?<!-- bammy:walkthrough:end -->\n*/;

// The description without Bammy's block, so a review never reads its own
// earlier summary as the author's intent.
export function withoutDescriptionBlock(description: string): string {
  return description.replace(DESCRIPTION_BLOCK, "\n\n").trim();
}

// The description with Bammy's old block taken out, or exactly as it was when
// there is none, so the author's own text never triggers an edit.
export function removeDescriptionBlock(description: string): string {
  return DESCRIPTION_BLOCK.test(description) ? withoutDescriptionBlock(description) : description;
}

const FINGERPRINT_MARKER = /<!-- bammy:fp=([0-9a-f]{16}) -->/g;

export function fingerprintMarker(fingerprint: string): string {
  return `<!-- bammy:fp=${fingerprint} -->`;
}

export function markersIn(body: string): string[] {
  return [...body.matchAll(FINGERPRINT_MARKER)].map((match) => match[1]!);
}
