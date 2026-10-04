import type { ChangeType, ChangedFile, Hunk } from "../core/models.ts";
import { detectLanguage } from "./language.ts";

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@ ?(.*)$/;

// Parses the hunk portion of one file's diff, the shape both forges hand back
// per file (GitHub's `patch`, GitLab's `diff`). Positions follow GitHub's
// definition: the line below the first @@ is 1, and every later line in the
// patch, including further @@ headers and "\ No newline" markers, counts.
export function parsePatch(patch: string): Hunk[] {
  const hunks: Hunk[] = [];
  const lines = patch.replace(/\r\n/g, "\n").split("\n");
  if (lines.at(-1) === "") {
    lines.pop();
  }

  let current: (Hunk & { lines: string[] }) | null = null;
  let oldLine = 0;
  let newLine = 0;
  let position = 0;
  let seenHeader = false;

  const finish = () => {
    if (current) {
      const { lines: body, ...hunk } = current;
      hunks.push({ ...hunk, content: body.join("\n") });
    }
  };

  for (const line of lines) {
    const header = HUNK_HEADER.exec(line);
    if (header) {
      if (seenHeader) {
        position += 1;
      }
      seenHeader = true;
      finish();
      oldLine = Number(header[1]);
      newLine = Number(header[3]);
      current = {
        oldStart: oldLine,
        oldLines: header[2] === undefined ? 1 : Number(header[2]),
        newStart: newLine,
        newLines: header[4] === undefined ? 1 : Number(header[4]),
        header: header[5] ?? "",
        content: "",
        addedLines: [],
        newLineToPosition: {},
        contextOldLines: {},
        lines: [line],
      };
      continue;
    }
    if (!current) {
      continue;
    }

    position += 1;
    current.lines.push(line);
    const marker = line[0];
    if (marker === "+") {
      current.addedLines.push(newLine);
      current.newLineToPosition[String(newLine)] = position;
      newLine += 1;
    } else if (marker === "-") {
      oldLine += 1;
    } else if (marker === "\\") {
      // "\ No newline at end of file": occupies a position, maps to no line.
    } else {
      current.newLineToPosition[String(newLine)] = position;
      current.contextOldLines[String(newLine)] = oldLine;
      oldLine += 1;
      newLine += 1;
    }
  }
  finish();
  return hunks;
}

export interface FileDiffInput {
  path: string;
  previousPath?: string;
  changeType: ChangeType;
  patch: string | null | undefined;
  isBinary?: boolean;
}

export function toChangedFile(input: FileDiffInput): ChangedFile {
  const patch = input.patch ?? "";
  const isBinary = input.isBinary ?? /^Binary files .* differ$/m.test(patch);
  const hunks = isBinary ? [] : parsePatch(patch);
  return {
    path: input.path,
    ...(input.previousPath && input.previousPath !== input.path
      ? { previousPath: input.previousPath }
      : {}),
    changeType: input.changeType,
    language: detectLanguage(input.path),
    isBinary,
    // A text change with no hunks means the forge withheld the patch, except for
    // a pure rename or an empty new/deleted file, which genuinely have none.
    patchUnavailable: !isBinary && hunks.length === 0 && input.patch == null,
    hunks,
  };
}

// Parses a full multi-file `git diff` (with `diff --git` headers). Used for
// fixtures and any source that hands over raw unified diff text.
export function parseUnifiedDiff(text: string): ChangedFile[] {
  const files: ChangedFile[] = [];
  const sections = text.replace(/\r\n/g, "\n").split(/^(?=diff --git )/m);

  for (const section of sections) {
    if (!section.startsWith("diff --git ")) {
      continue;
    }
    const lines = section.split("\n");
    const gitHeader = /^diff --git a\/(.+) b\/(.+)$/.exec(lines[0] ?? "");
    let oldPath = gitHeader?.[1];
    let newPath = gitHeader?.[2];
    let changeType: ChangeType = "modified";
    let isBinary = false;
    let hunkStart = lines.length;

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i]!;
      if (line.startsWith("@@")) {
        hunkStart = i;
        break;
      }
      if (line.startsWith("new file mode")) changeType = "added";
      else if (line.startsWith("deleted file mode")) changeType = "deleted";
      else if (line.startsWith("rename from ")) {
        oldPath = line.slice("rename from ".length);
        changeType = "renamed";
      } else if (line.startsWith("rename to ")) newPath = line.slice("rename to ".length);
      else if (line.startsWith("--- a/")) oldPath = line.slice(6);
      else if (line.startsWith("+++ b/")) newPath = line.slice(6);
      else if (line.startsWith("Binary files ") || line === "GIT binary patch") isBinary = true;
    }

    const path = changeType === "deleted" ? oldPath : newPath;
    if (!path) {
      continue;
    }
    files.push(
      toChangedFile({
        path,
        previousPath: oldPath,
        changeType,
        patch: lines.slice(hunkStart).join("\n"),
        isBinary,
      }),
    );
  }
  return files;
}
