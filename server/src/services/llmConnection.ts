import { HttpError } from "../lib/httpError.ts";
import type { ProviderName } from "../review/llm/providers.ts";

export type LlmConnectionStatus = "active" | "revoked" | "unreachable";

export class LlmConnectionError extends HttpError {
  constructor(
    public connectionStatus: Exclude<LlmConnectionStatus, "active">,
    field: "apiKey" | "baseUrl",
    message: string,
  ) {
    super(400, "Connection failed", { [field]: [message] });
  }
}

const OFFICIAL_BASE_URLS: Record<Exclude<ProviderName, "ollama">, string> = {
  anthropic: "https://api.anthropic.com/v1",
  openai: "https://api.openai.com/v1",
  google: "https://generativelanguage.googleapis.com/v1beta",
};

function connectionError(
  status: Exclude<LlmConnectionStatus, "active">,
  field: "apiKey" | "baseUrl",
  message: string,
) {
  return new LlmConnectionError(status, field, message);
}

function modelListUrl(provider: ProviderName, baseUrl: string, apiKey?: string) {
  const url = new URL(`${baseUrl}/models`);
  if (provider === "google" && apiKey) url.searchParams.set("key", apiKey);
  return url;
}

function headersFor(provider: ProviderName, apiKey?: string) {
  const headers = new Headers({ Accept: "application/json" });
  if (!apiKey) return headers;
  if (provider === "anthropic") {
    headers.set("x-api-key", apiKey);
    headers.set("anthropic-version", "2023-06-01");
  } else if (provider !== "google") {
    headers.set("Authorization", `Bearer ${apiKey}`);
  }
  return headers;
}

function hasModels(provider: ProviderName, body: unknown) {
  if (!body || typeof body !== "object") return false;
  const record = body as Record<string, unknown>;
  return provider === "google" ? Array.isArray(record.models) : Array.isArray(record.data);
}

export function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.replace(/\/+$/, "");
}

// Lists are paged; one large page covers every catalogue these hosts serve
// today, so the picker needs no pagination loop.
const LIST_PAGE_SIZE: Partial<Record<ProviderName, [string, string]>> = {
  anthropic: ["limit", "1000"],
  google: ["pageSize", "1000"],
};

async function fetchModelList(
  provider: ProviderName,
  apiKey?: string,
  customBaseUrl?: string,
  fullList = false,
): Promise<Record<string, unknown>> {
  const baseUrl = customBaseUrl
    ? normalizeBaseUrl(customBaseUrl)
    : provider === "ollama"
      ? undefined
      : OFFICIAL_BASE_URLS[provider];
  if (!baseUrl) throw connectionError("unreachable", "baseUrl", "Ollama requires an API base URL");

  const url = modelListUrl(provider, baseUrl, apiKey);
  const pageSize = LIST_PAGE_SIZE[provider];
  if (fullList && pageSize && !customBaseUrl) url.searchParams.set(...pageSize);

  let response: Response;
  try {
    response = await fetch(url, {
      headers: headersFor(provider, apiKey),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw connectionError("unreachable", "baseUrl", "Could not reach this API host");
  }

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw connectionError("revoked", "apiKey", "The API host rejected this key");
    }
    throw connectionError(
      "unreachable",
      customBaseUrl ? "baseUrl" : "apiKey",
      `The API host returned ${response.status}`,
    );
  }

  const body = await response.json().catch(() => null);
  if (!hasModels(provider, body)) {
    throw connectionError("unreachable", "baseUrl", "The API host did not return a supported model list");
  }
  return body as Record<string, unknown>;
}

export async function verifyLlmConnection(provider: ProviderName, apiKey?: string, customBaseUrl?: string) {
  await fetchModelList(provider, apiKey, customBaseUrl);
}

// OpenAI's own catalogue mixes in embedding, audio and image models that
// cannot review code. Proxies and Ollama name models freely, so they are
// listed as they come.
const NON_CHAT_OPENAI = /embedding|whisper|tts|dall-e|moderation|davinci|babbage|image|audio|realtime|transcribe/;

function modelIds(provider: ProviderName, body: Record<string, unknown>, customBaseUrl?: string): string[] {
  if (provider === "google") {
    return (body.models as unknown[]).flatMap((entry) => {
      const model = entry as { name?: unknown; supportedGenerationMethods?: unknown };
      const methods = Array.isArray(model.supportedGenerationMethods) ? model.supportedGenerationMethods : [];
      if (typeof model.name !== "string" || !methods.includes("generateContent")) return [];
      return [model.name.replace(/^models\//, "")];
    });
  }
  const ids = (body.data as unknown[]).flatMap((entry) => {
    const id = (entry as { id?: unknown }).id;
    return typeof id === "string" && id ? [id] : [];
  });
  return provider === "openai" && !customBaseUrl ? ids.filter((id) => !NON_CHAT_OPENAI.test(id)) : ids;
}

// Ids carry the connection's provider as prefix: it picks the SDK (and so the
// wire protocol) in providerOf, and an official connection only runs its own.
export async function listLlmModels(provider: ProviderName, apiKey?: string, customBaseUrl?: string) {
  const body = await fetchModelList(provider, apiKey, customBaseUrl, true);
  const ids = modelIds(provider, body, customBaseUrl).map((id) => `${provider}/${id}`);
  return [...new Set(ids)].sort();
}
