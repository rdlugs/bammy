import type { ChangedFile, Hunk } from "../core/models.ts";

// The diff as the model reads it. Every line that exists in the new file
// carries its new-file line number, so the model reports the coordinates the
// rest of the pipeline uses and never has to count. Removed lines have none.
export function renderFileHeader(file: ChangedFile): string {
  const details = [file.changeType, file.language].filter(Boolean).join(", ");
  const renamed = file.previousPath ? ` [renamed from ${file.previousPath}]` : "";
  return `=== FILE: ${file.path} (${details})${renamed} ===`;
}

export function renderHunk(hunk: Hunk): string {
  const lines = hunk.content.split("\n");
  const out = [lines[0] ?? ""];
  let newLine = hunk.newStart;
  for (const line of lines.slice(1)) {
    const marker = line[0];
    const text = line.slice(1);
    if (marker === "+") {
      out.push(`${String(newLine).padStart(6)} + | ${text}`);
      newLine += 1;
    } else if (marker === "-") {
      out.push(`${"".padStart(6)} - | ${text}`);
    } else if (marker === "\\") {
      continue;
    } else {
      out.push(`${String(newLine).padStart(6)}   | ${text}`);
      newLine += 1;
    }
  }
  return out.join("\n");
}

export function renderFileDiff(file: ChangedFile, hunks: Hunk[] = file.hunks): string {
  return [renderFileHeader(file), ...hunks.map(renderHunk)].join("\n");
}
