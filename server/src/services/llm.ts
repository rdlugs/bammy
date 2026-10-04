import { env } from "../config/env.ts";
import { decrypt } from "../lib/crypto.ts";
import { HttpError } from "../lib/httpError.ts";
import { prisma } from "../lib/prisma.ts";
import {
  PROVIDERS,
  type ApiKeys,
  type ProviderBaseUrls,
  type ProviderName,
} from "../review/llm/providers.ts";

export type StoredLlmConnections = Partial<
  Record<ProviderName, { apiKey?: string; baseUrl?: string }>
>;

const ENV_KEYS: ApiKeys = {
  anthropic: env.ANTHROPIC_API_KEY || undefined,
  openai: env.OPENAI_API_KEY || undefined,
  google: env.GOOGLE_GENERATIVE_AI_API_KEY || undefined,
};

// A key the repository owner stored wins over the server-wide one, so their
// reviews bill to them.
export async function apiKeysFor(userId: string): Promise<ApiKeys> {
  return (await llmCredentialsFor(userId)).keys;
}

export async function requireStoredLlmConnection(userId: string, provider: ProviderName) {
  const connection = await prisma.llmCredential.findUnique({
    where: { userId_provider: { userId, provider } },
    select: { id: true },
  });
  if (!connection) {
    throw new HttpError(400, "Validation failed", {
      connection: ["Select a connection configured in Settings > API keys"],
    });
  }
}

export async function llmCredentialsFor(
  userId: string,
): Promise<{ keys: ApiKeys; baseUrls: ProviderBaseUrls; connections: StoredLlmConnections }> {
  const stored = await prisma.llmCredential.findMany({ where: { userId } });
  const keys: ApiKeys = { ...ENV_KEYS };
  const baseUrls: ProviderBaseUrls = {};
  const connections: StoredLlmConnections = {};
  for (const credential of stored) {
    if (PROVIDERS.includes(credential.provider as ProviderName)) {
      const provider = credential.provider as ProviderName;
      const apiKey = credential.encryptedKey ? decrypt(credential.encryptedKey) : undefined;
      const baseUrl = credential.baseUrl ?? undefined;
      if (apiKey) keys[provider] = apiKey;
      if (baseUrl) baseUrls[provider] = baseUrl;
      connections[provider] = { apiKey, baseUrl };
    }
  }
  return { keys, baseUrls, connections };
}
