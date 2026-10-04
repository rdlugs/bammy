import { z } from "zod";
import { categorySchema, effortSchema, evidenceSchema, severitySchema } from "../core/severity.ts";

// What the model is asked to return. Numeric ranges and string lengths are
// described rather than enforced in the schema, because providers' structured
// output modes support different subsets of JSON Schema; the validator clamps
// and checks afterwards.
export const modelFindingSchema = z.object({
  file: z.string().describe("Path exactly as given in the FILE header"),
  startLine: z.number().describe("New-file line number from the diff's left column"),
  endLine: z.number().describe("Last new-file line of the issue; equal to startLine for one line"),
  severity: severitySchema,
  category: categorySchema,
  kind: z.enum(["potential_issue", "refactor_suggestion", "nitpick"]),
  effort: effortSchema,
  title: z.string().describe("One short sentence naming the problem"),
  body: z.string().describe("Why it is a problem and what to do; markdown"),
  suggestion: z
    .string()
    .nullable()
    .describe("Exact replacement code for startLine..endLine, or null"),
  confidence: z.number().describe("0 to 1"),
  evidence: evidenceSchema,
  evidenceNote: z
    .string()
    .describe("One sentence: the trigger and failure path, violated contract, or reproduction"),
  evidenceFiles: z.array(z.string()).describe("Other files the evidence relies on, if any"),
});
export type ModelFinding = z.infer<typeof modelFindingSchema>;

export const reviewOutputSchema = z.object({
  findings: z.array(modelFindingSchema),
});
export type ReviewOutput = z.infer<typeof reviewOutputSchema>;

export const walkthroughOutputSchema = z.object({
  overview: z.string().describe("Two to five sentences on what the change does and why"),
  fileSummaries: z.array(z.object({ path: z.string(), summary: z.string() })),
  labels: z.array(z.string()).describe("Up to five short labels, e.g. bugfix, refactor, feature"),
  estimatedEffort: z.number().describe("Review effort from 1 (trivial) to 5 (very involved)"),
});
export type WalkthroughOutput = z.infer<typeof walkthroughOutputSchema>;
