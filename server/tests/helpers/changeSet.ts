import type { ChangeSet } from "../../src/review/core/models.ts";
import { toChangedFile, type FileDiffInput } from "../../src/review/diff/parse.ts";

// src/app.ts: lines 10-14 are a hunk where 11 and 12 are added.
export const APP_PATCH = [
  "@@ -10,3 +10,5 @@ export function main() {",
  " const a = 1;",
  "+const b = a + 1;",
  "+const c = b * 2;",
  " const d = 4;",
  " return d;",
].join("\n");

export function makeChangeSet(files: FileDiffInput[] = [{ path: "src/app.ts", changeType: "modified", patch: APP_PATCH }]): ChangeSet {
  return {
    forgeRef: {
      provider: "github",
      host: "github.com",
      project: "acme/web",
      number: 42,
      baseSha: "base",
      startSha: "base",
      headSha: "head",
      webUrl: "https://github.com/acme/web/pull/42",
    },
    title: "Add b and c",
    description: "",
    baseRef: "main",
    headRef: "feature",
    isDraft: false,
    files: files.map(toChangedFile),
  };
}
