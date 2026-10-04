import { z } from "zod";
import { categorySchema, severitySchema } from "../core/severity.ts";

export const PROFILE_NAMES = ["balanced", "fast", "strict", "security"] as const;
export const profileNameSchema = z.enum(PROFILE_NAMES);
export type ProfileName = z.infer<typeof profileNameSchema>;

// Field shapes are declared once, without defaults: the full schema validates a
// merged config, and the override schema validates one layer of it. Defaults
// live in DEFAULT_CONFIG so a layer never fills in fields it did not set.
// There is deliberately no API key or token here. Endpoints exist only in the
// dashboard layers (see dashboardOverrideSchema): a repository file must never
// be able to point Bammy's credentials somewhere else.
// The model id may itself contain slashes and parentheses, as router ids such
// as "openai/cx/gpt-5.6-sol(medium)" do; the provider is what precedes the first slash.
const modelString = z
  .string()
  .regex(/^(anthropic|openai|google|ollama)\/[\w.:()/-]+$/, 'Use "provider/model", e.g. anthropic/claude-sonnet-5-5');


const llmShape = {
  model: modelString,
  fallbackModels: z.array(modelString).max(3),
  temperature: z.number().min(0).max(1),
  maxTokens: z.number().int().min(1000).max(64000),
  // Prompt token ceiling; null derives it from the model's context window.
  contextBudget: z.number().int().min(4000).nullable(),
};

// Settable only from the dashboard, never from a repository file or a trigger.
const dashboardLlmShape = {
  ...llmShape,
  // A live reference to one of the owner's saved provider connections. The
  // worker resolves its current key and host when the review runs.
  connection: z.enum(["anthropic", "openai", "google", "ollama"]).nullable(),
  // Legacy endpoint fields remain readable so settings saved by an older
  // release keep working until the dashboard writes the new connection field.
  // One endpoint, such as a 9router proxy, for every model call; null means
  // each provider's official API. The model's provider prefix still picks the
  // wire format.
  baseUrl: z.url({ protocol: /^https?$/, error: "Enter an http or https URL" }).max(500).nullable(),
  // Which stored provider key is sent to baseUrl; null sends each model's own
  // provider key. Names a key slot, never holds the key.
  endpointKey: z.enum(["anthropic", "openai", "google", "ollama"]).nullable(),
};

const reviewShape = {
  categories: z.array(categorySchema).min(1),
  // What is reported at all.
  severityFloor: severitySchema,
  // What fails the verdict and the commit status. Not the same as the floor.
  blockOn: severitySchema,
  maxFindings: z.number().int().min(1).max(100),
  maxChunks: z.number().int().min(1).max(50),
  minConfidence: z.number().min(0).max(1),
  // A critical or major model finding without evidence is demoted, not blocking.
  requireEvidence: z.boolean(),
  // Allow findings on lines the change did not touch.
  fullFile: z.boolean(),
  committableSuggestions: z.boolean(),
};

const outputShape = {
  walkthrough: z.boolean(),
  postInline: z.boolean(),
  postSummary: z.boolean(),
  postCheck: z.boolean(),
};

const triggersShape = {
  // Review automatically when a PR/MR is opened or receives new commits.
  onPush: z.boolean(),
  // Include draft PRs/MRs in automatic reviews.
  drafts: z.boolean(),
  // Allow "/bammy review" in a comment to request a review.
  command: z.boolean(),
};

const topLevelShape = {
  version: z.literal(1),
  profile: profileNameSchema,
  ignorePaths: z.array(z.string().min(1)).max(200),
  instructions: z.string().max(4000),
  languageInstructions: z.record(z.string().min(1), z.string().max(2000)),
};

export const configSchema = z.strictObject({
  ...topLevelShape,
  llm: z.strictObject(dashboardLlmShape),
  review: z.strictObject(reviewShape),
  output: z.strictObject(outputShape),
  triggers: z.strictObject(triggersShape),
});
export type Config = z.infer<typeof configSchema>;

export const configOverrideSchema = z
  .strictObject({
    ...topLevelShape,
    llm: z.strictObject(llmShape).partial(),
    review: z.strictObject(reviewShape).partial(),
    output: z.strictObject(outputShape).partial(),
    triggers: z.strictObject(triggersShape).partial(),
  })
  .partial();
export type ConfigOverride = z.infer<typeof configOverrideSchema>;

// The global config and repository settings, saved by the repository owner in
// the dashboard. Only these layers may set endpoints; the repository file and
// triggers use configOverrideSchema, which rejects them as unknown settings.
export const dashboardOverrideSchema = configOverrideSchema.extend({
  llm: z.strictObject(dashboardLlmShape).partial().optional(),
});
export type DashboardOverride = z.infer<typeof dashboardOverrideSchema>;

export const DEFAULT_CONFIG: Config = {
  version: 1,
  profile: "balanced",
  llm: {
    model: "anthropic/claude-sonnet-5-5",
    fallbackModels: [],
    temperature: 0.2,
    maxTokens: 8000,
    contextBudget: null,
    connection: null,
    baseUrl: null,
    endpointKey: null,
  },
  review: {
    categories: ["security", "bug", "performance", "logic", "reliability"],
    severityFloor: "minor",
    blockOn: "critical",
    maxFindings: 25,
    maxChunks: 12,
    minConfidence: 0.5,
    requireEvidence: true,
    fullFile: false,
    committableSuggestions: true,
  },
  output: {
    walkthrough: true,
    postInline: true,
    postSummary: true,
    postCheck: true,
  },
  triggers: {
    onPush: true,
    drafts: false,
    command: true,
  },
  ignorePaths: [
    "**/*.lock",
    "**/package-lock.json",
    "**/pnpm-lock.yaml",
    "**/*.min.js",
    "**/*.min.css",
    "**/*.map",
    "**/vendor/**",
    "**/node_modules/**",
    "**/dist/**",
    "**/build/**",
  ],
  instructions: "",
  languageInstructions: {},
};
