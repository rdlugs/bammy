// Hidden HTML comments Bammy leaves in what it posts, so a later run can find
// its own summary and tell which findings it already commented on.

export const SUMMARY_MARKER = "<!-- bammy:summary -->";

const FINGERPRINT_MARKER = /<!-- bammy:fp=([0-9a-f]{16}) -->/g;

export function fingerprintMarker(fingerprint: string): string {
  return `<!-- bammy:fp=${fingerprint} -->`;
}

export function markersIn(body: string): string[] {
  return [...body.matchAll(FINGERPRINT_MARKER)].map((match) => match[1]!);
}
