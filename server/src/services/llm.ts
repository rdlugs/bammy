import { env } from "../config/env.ts";
import { decrypt } from "../lib/crypto.ts";
import { prisma } from "../lib/prisma.ts";
import { PROVIDERS, type ApiKeys, type ProviderName } from "../review/llm/providers.ts";

const ENV_KEYS: ApiKeys = {
  anthropic: env.ANTHROPIC_API_KEY || undefined,
  openai: env.OPENAI_API_KEY || undefined,
  google: env.GOOGLE_GENERATIVE_AI_API_KEY || undefined,
};

// A key the repository owner stored wins over the server-wide one, so their
// reviews bill to them.
export async function apiKeysFor(userId: string): Promise<ApiKeys> {
  const stored = await prisma.llmCredential.findMany({ where: { userId } });
  const keys: ApiKeys = { ...ENV_KEYS };
  for (const credential of stored) {
    if (PROVIDERS.includes(credential.provider as ProviderName)) {
      keys[credential.provider as ProviderName] = decrypt(credential.encryptedKey);
    }
  }
  return keys;
}
