import { z } from "zod";
import {
  CATEGORIES,
  EFFORTS,
  EVIDENCE,
  SEVERITIES,
  categorySchema,
  effortSchema,
  evidenceSchema,
  severitySchema,
} from "../core/severity.ts";

// What the model is asked to return. Numeric ranges and string lengths are
// described rather than enforced in the schema, because providers' structured
// output modes support different subsets of JSON Schema; the validator clamps
// and checks afterwards.
const MODEL_KINDS = ["potential_issue", "refactor_suggestion", "nitpick"] as const;

export const modelFindingSchema = z.object({
  file: z.string().describe("Path exactly as given in the FILE header"),
  startLine: z.number().describe("New-file line number from the diff's left column"),
  endLine: z.number().describe("Last new-file line of the issue; equal to startLine for one line"),
  severity: severitySchema,
  category: categorySchema,
  kind: z.enum(MODEL_KINDS),
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
  blastRadius: z
    .enum(["small", "medium", "large"])
    .describe("How much of the system the change could break: small (local), medium (one feature or module), large (shared code, data, config or many callers)"),
});
export type WalkthroughOutput = z.infer<typeof walkthroughOutputSchema>;

// Repairs for replies that were not schema-enforced (see format.ts). They fix
// what a model predictably gets wrong; whatever still fails is dropped or
// rejected by the schema afterwards.

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function snakeToCamel(key: string): string {
  return key.replace(/_([a-z])/g, (_, ch: string) => ch.toUpperCase());
}

function camelKeys(value: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(value)) out[snakeToCamel(key)] = field;
  return out;
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[], fallback?: T): T | undefined {
  const normalised = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  return (allowed as readonly string[]).includes(normalised) ? (normalised as T) : fallback;
}

function numberValue(value: unknown): unknown {
  if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) return Number(value);
  return value;
}

function repairFinding(value: unknown): unknown {
  const entry = camelKeys(record(value));
  const startLine = numberValue(entry.startLine ?? entry.line);
  return {
    ...entry,
    startLine,
    endLine: numberValue(entry.endLine ?? startLine),
    // Severity and category decide what blocks, so an unknown value is not
    // guessed: the finding is dropped instead.
    severity: enumValue(entry.severity, SEVERITIES),
    category: enumValue(entry.category, CATEGORIES),
    kind: enumValue(entry.kind, MODEL_KINDS, "potential_issue"),
    effort: enumValue(entry.effort, EFFORTS, "moderate"),
    // Unverified is what the validator demotes, so it is the safe default.
    evidence: enumValue(entry.evidence, EVIDENCE, "unverified"),
    evidenceNote: entry.evidenceNote ?? "",
    evidenceFiles: Array.isArray(entry.evidenceFiles) ? entry.evidenceFiles : [],
    suggestion: typeof entry.suggestion === "string" && entry.suggestion.trim() ? entry.suggestion : null,
    confidence: numberValue(entry.confidence),
  };
}

// One malformed finding must not cost the whole pass.
export function repairReviewOutput(raw: unknown): unknown {
  const findings = record(raw).findings;
  if (!Array.isArray(findings)) return raw;
  return {
    findings: findings.flatMap((entry) => {
      const parsed = modelFindingSchema.safeParse(repairFinding(entry));
      return parsed.success ? [parsed.data] : [];
    }),
  };
}

export function repairWalkthroughOutput(raw: unknown): unknown {
  const output = camelKeys(record(raw));
  const effort = Number(numberValue(output.estimatedEffort));
  return {
    ...output,
    fileSummaries: (Array.isArray(output.fileSummaries) ? output.fileSummaries : [])
      .map(record)
      .filter((entry) => typeof entry.path === "string" && typeof entry.summary === "string"),
    labels: Array.isArray(output.labels) ? output.labels.map(String) : [],
    estimatedEffort: Number.isFinite(effort) ? effort : 3,
    blastRadius: enumValue(output.blastRadius, ["small", "medium", "large"] as const, "medium"),
  };
}
