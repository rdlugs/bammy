import picomatch from "picomatch";
import type { ChangedFile, Omission } from "../core/models.ts";

export interface Classified {
  reviewable: ChangedFile[];
  omissions: Omission[];
}

// Splits the change into what the model will see and what it will not, with a
// reason for every file left out. Nothing is skipped silently except a pure
// rename, which has no content to review.
export function classifyFiles(files: ChangedFile[], ignorePaths: string[]): Classified {
  const ignored = picomatch(ignorePaths.length ? ignorePaths : ["\0"], { dot: true });
  const reviewable: ChangedFile[] = [];
  const omissions: Omission[] = [];

  for (const file of files) {
    if (ignored(file.path)) {
      omissions.push({ path: file.path, reason: "ignored" });
    } else if (file.changeType === "deleted") {
      omissions.push({ path: file.path, reason: "deleted" });
    } else if (file.isBinary) {
      omissions.push({ path: file.path, reason: "binary" });
    } else if (file.patchUnavailable) {
      omissions.push({ path: file.path, reason: "patch_unavailable", detail: "the forge withheld the diff" });
    } else if (file.hunks.length > 0) {
      reviewable.push(file);
    }
  }
  return { reviewable, omissions };
}
