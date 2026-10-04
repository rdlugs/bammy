import type { Config } from "../config/schema.ts";
import type { ChangeSet, LlmUsage } from "../core/models.ts";
import type { Chunk } from "../context/chunk.ts";
import { reviewSystemPrompt, reviewUserPrompt } from "./prompt.ts";
import { generateWithFallback, type Generate } from "./providers.ts";
import { reviewOutputSchema, type ModelFinding } from "./schemas.ts";

export interface ChunkReview {
  findings: ModelFinding[];
  usage: LlmUsage;
}

export async function reviewChunk(
  generate: Generate,
  changeSet: ChangeSet,
  chunk: Chunk,
  totalChunks: number,
  config: Config,
): Promise<ChunkReview> {
  const response = await generateWithFallback(generate, [config.llm.model, ...config.llm.fallbackModels], {
    system: reviewSystemPrompt(config),
    prompt: reviewUserPrompt(changeSet, chunk, totalChunks, config),
    schema: reviewOutputSchema,
    schemaName: "code_review",
    temperature: config.llm.temperature,
    maxOutputTokens: config.llm.maxTokens,
  });
  return {
    findings: response.object.findings,
    usage: {
      purpose: "review",
      model: response.model,
      inputTokens: response.inputTokens,
      outputTokens: response.outputTokens,
      latencyMs: response.latencyMs,
      chunk: chunk.index,
    },
  };
}
