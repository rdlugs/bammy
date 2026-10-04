// Hidden HTML comments Bammy leaves in what it posts, so a later run can find
// its own summary and tell which findings it already commented on.

export const SUMMARY_MARKER = "<!-- bammy:summary -->";
// A walkthrough posted as a comment of its own.
export const WALKTHROUGH_MARKER = "<!-- bammy:walkthrough -->";
// A walkthrough written into the PR/MR description sits between these, so a
// later run replaces only its own block and leaves the author's text alone.
export const DESCRIPTION_START = "<!-- bammy:walkthrough:start -->";
export const DESCRIPTION_END = "<!-- bammy:walkthrough:end -->";

const DESCRIPTION_BLOCK = /\n*<!-- bammy:walkthrough:start -->[\s\S]*?<!-- bammy:walkthrough:end -->\n*/;

// The description without Bammy's block, so a review never reads its own
// earlier summary as the author's intent.
export function withoutDescriptionBlock(description: string): string {
  return description.replace(DESCRIPTION_BLOCK, "\n\n").trim();
}

// The description with `block` in place of Bammy's earlier one, or appended.
export function withDescriptionBlock(description: string, block: string): string {
  const wrapped = `${DESCRIPTION_START}\n${block.trim()}\n${DESCRIPTION_END}`;
  const author = withoutDescriptionBlock(description);
  return author ? `${author}\n\n${wrapped}\n` : `${wrapped}\n`;
}

const FINGERPRINT_MARKER = /<!-- bammy:fp=([0-9a-f]{16}) -->/g;

export function fingerprintMarker(fingerprint: string): string {
  return `<!-- bammy:fp=${fingerprint} -->`;
}

export function markersIn(body: string): string[] {
  return [...body.matchAll(FINGERPRINT_MARKER)].map((match) => match[1]!);
}
