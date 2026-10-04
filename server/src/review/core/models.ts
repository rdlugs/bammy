import { z } from "zod";

// The intermediate representation every forge produces and every later stage
// reads. Line numbers are new-file coordinates everywhere; only publishers
// translate them into a forge's position payload.

export const forgeProviderSchema = z.enum(["github", "gitlab"]);
export type ForgeProvider = z.infer<typeof forgeProviderSchema>;

export const hunkSchema = z.object({
  oldStart: z.number().int().min(0),
  oldLines: z.number().int().min(0),
  newStart: z.number().int().min(0),
  newLines: z.number().int().min(0),
  header: z.string(),
  content: z.string(),
  // New-file lines this hunk adds; the only lines a finding may target unless
  // the review allows context lines.
  addedLines: z.array(z.number().int().positive()),
  // New-file line to its position in the file's patch (1 = the line below the
  // first @@). Covers added and context lines; a line missing here cannot carry
  // an inline comment.
  newLineToPosition: z.record(z.string(), z.number().int().positive()),
});
export type Hunk = z.infer<typeof hunkSchema>;

export const changeTypeSchema = z.enum(["added", "modified", "deleted", "renamed"]);
export type ChangeType = z.infer<typeof changeTypeSchema>;

export const changedFileSchema = z.object({
  path: z.string(),
  previousPath: z.string().optional(),
  changeType: changeTypeSchema,
  language: z.string().optional(),
  isBinary: z.boolean(),
  // The forge withheld the patch (too large, or truncated); the file changed but
  // there is nothing to anchor against.
  patchUnavailable: z.boolean(),
  hunks: z.array(hunkSchema),
});
export type ChangedFile = z.infer<typeof changedFileSchema>;

export const forgeRefSchema = z.object({
  provider: forgeProviderSchema,
  host: z.string(),
  project: z.string(),
  number: z.number().int().positive(),
  baseSha: z.string(),
  startSha: z.string(),
  headSha: z.string(),
  webUrl: z.string().optional(),
});
export type ForgeRef = z.infer<typeof forgeRefSchema>;

export const changeSetSchema = z.object({
  forgeRef: forgeRefSchema,
  title: z.string(),
  description: z.string(),
  baseRef: z.string().optional(),
  headRef: z.string().optional(),
  isDraft: z.boolean(),
  files: z.array(changedFileSchema),
});
export type ChangeSet = z.infer<typeof changeSetSchema>;

export function diffPosition(file: ChangedFile, newLine: number): number | undefined {
  for (const hunk of file.hunks) {
    const position = hunk.newLineToPosition[String(newLine)];
    if (position !== undefined) {
      return position;
    }
  }
  return undefined;
}

export function isAddedLine(file: ChangedFile, newLine: number): boolean {
  return file.hunks.some((hunk) => hunk.addedLines.includes(newLine));
}
