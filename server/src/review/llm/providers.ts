import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { generateText, Output, type LanguageModel } from "ai";
import type { z } from "zod";

export const PROVIDERS = ["anthropic", "openai", "google"] as const;
export type ProviderName = (typeof PROVIDERS)[number];
export type ApiKeys = Partial<Record<ProviderName, string>>;
// A proxy every model call goes to instead of the providers' official APIs,
// with the key to send it when the config picked one.
export interface Endpoint {
  baseUrl: string;
  apiKey?: string;
}

// A proxy such as 9router may need no key, but the SDKs refuse to build a
// client without one.
const NO_KEY = "unused";

export function providerOf(model: string): ProviderName {
  const provider = model.split("/")[0];
  if (!PROVIDERS.includes(provider as ProviderName)) {
    throw new Error(`Unsupported model provider in "${model}"`);
  }
  return provider as ProviderName;
}

// Behind an endpoint no provider is missing a key: the endpoint decides
// whether it needs one.
export function missingKeys(models: string[], keys: ApiKeys, endpoint?: Endpoint): ProviderName[] {
  if (endpoint) return [];
  return [...new Set(models.map(providerOf))].filter((provider) => !keys[provider]);
}

function languageModel(model: string, keys: ApiKeys, endpoint?: Endpoint): LanguageModel {
  const provider = providerOf(model);
  const modelId = model.slice(provider.length + 1);
  const baseURL = endpoint?.baseUrl;
  const apiKey = endpoint ? (endpoint.apiKey ?? keys[provider] ?? NO_KEY) : keys[provider];
  if (!apiKey) throw new Error(`No API key for ${provider}`);
  switch (provider) {
    case "anthropic":
      return createAnthropic({ apiKey, baseURL })(modelId);
    case "openai": {
      const openai = createOpenAI({ apiKey, baseURL });
      // OpenAI-compatible proxies speak chat completions, not the Responses API
      // the SDK defaults to.
      return baseURL ? openai.chat(modelId) : openai(modelId);
    }
    case "google":
      return createGoogleGenerativeAI({ apiKey, baseURL })(modelId);
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

export function createGenerate(keys: ApiKeys, endpoint?: Endpoint): Generate {
  return async <T>(request: GenerateRequest<T>): Promise<GenerateResponse<T>> => {
    const started = Date.now();
    const result = await generateText({
      model: languageModel(request.model, keys, endpoint),
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
