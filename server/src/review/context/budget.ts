import type { Config } from "../config/schema.ts";

// A deliberately rough estimate. Exact counts differ per provider and tokenizer;
// the budget keeps a safety margin rather than pretending to precision.
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

const CONTEXT_WINDOW: Record<string, number> = {
  anthropic: 200_000,
  openai: 200_000,
  google: 1_000_000,
  ollama: 128_000,
};

// Very long prompts review worse than several focused ones, so a pass never
// carries more diff than this even when the window would allow it.
export const MAX_DIFF_TOKENS_PER_PASS = 60_000;
const SAFETY_TOKENS = 2_000;
const MIN_DIFF_TOKENS = 2_000;

// Diff tokens one pass may carry once the fixed prompt and the reply are paid for.
export function diffTokenBudget(config: Config, overheadTokens: number): number {
  const provider = config.llm.model.split("/")[0] ?? "anthropic";
  const ceiling = config.llm.contextBudget ?? (CONTEXT_WINDOW[provider] ?? 128_000) - config.llm.maxTokens;
  return Math.max(MIN_DIFF_TOKENS, Math.min(MAX_DIFF_TOKENS_PER_PASS, ceiling - overheadTokens - SAFETY_TOKENS));
}
