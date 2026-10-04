import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { generateText, Output, type LanguageModel } from "ai";
import type { z } from "zod";

export const PROVIDERS = ["anthropic", "openai", "google"] as const;
export type ProviderName = (typeof PROVIDERS)[number];
export type ApiKeys = Partial<Record<ProviderName, string>>;

export function providerOf(model: string): ProviderName {
  const provider = model.split("/")[0];
  if (!PROVIDERS.includes(provider as ProviderName)) {
    throw new Error(`Unsupported model provider in "${model}"`);
  }
  return provider as ProviderName;
}

export function missingKeys(models: string[], keys: ApiKeys): ProviderName[] {
  return [...new Set(models.map(providerOf))].filter((provider) => !keys[provider]);
}

function languageModel(model: string, keys: ApiKeys): LanguageModel {
  const provider = providerOf(model);
  const modelId = model.slice(provider.length + 1);
  const apiKey = keys[provider];
  if (!apiKey) throw new Error(`No API key for ${provider}`);
  switch (provider) {
    case "anthropic":
      return createAnthropic({ apiKey })(modelId);
    case "openai":
      return createOpenAI({ apiKey })(modelId);
    case "google":
      return createGoogleGenerativeAI({ apiKey })(modelId);
  }
}

export interface GenerateRequest<T> {
  model: string;
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  schemaName: string;
  temperature: number;
  maxOutputTokens: number;
}

export interface GenerateResponse<T> {
  object: T;
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
}

// The one seam between the engine and a model provider. Tests pass their own.
export type Generate = <T>(request: GenerateRequest<T>) => Promise<GenerateResponse<T>>;

export function createGenerate(keys: ApiKeys): Generate {
  return async <T>(request: GenerateRequest<T>): Promise<GenerateResponse<T>> => {
    const started = Date.now();
    const result = await generateText({
      model: languageModel(request.model, keys),
      system: request.system,
      prompt: request.prompt,
      temperature: request.temperature,
      maxOutputTokens: request.maxOutputTokens,
      output: Output.object({ schema: request.schema, name: request.schemaName }),
    });
    return {
      object: result.output as T,
      model: request.model,
      inputTokens: result.usage.inputTokens ?? 0,
      outputTokens: result.usage.outputTokens ?? 0,
      latencyMs: Date.now() - started,
    };
  };
}

// Tries the primary model, then each fallback in order. The last error wins so
// the message names the final thing that was tried.
export async function generateWithFallback<T>(
  generate: Generate,
  models: string[],
  request: Omit<GenerateRequest<T>, "model">,
): Promise<GenerateResponse<T>> {
  let lastError: unknown;
  for (const model of models) {
    try {
      return await generate({ ...request, model });
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
