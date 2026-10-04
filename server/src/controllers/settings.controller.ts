import type { Request, Response } from "express";
import { Prisma } from "../generated/prisma/client.ts";
import { env } from "../config/env.ts";
import { decrypt, encrypt } from "../lib/crypto.ts";
import { HttpError } from "../lib/httpError.ts";
import { hashPassword, verifyPassword } from "../lib/password.ts";
import { prisma } from "../lib/prisma.ts";
import { PROVIDERS, type ProviderName } from "../review/llm/providers.ts";
import {
  apiKeyParamsSchema,
  changePasswordSchema,
  deleteAccountSchema,
  saveApiKeySchema,
  updateProfileSchema,
} from "../schemas/settings.schema.ts";
import { clearAuthCookie, publicUser } from "./auth.controller.ts";

const EMAIL_TAKEN = "An account with this email already exists";

const SERVER_KEYS: Record<ProviderName, boolean> = {
  anthropic: Boolean(env.ANTHROPIC_API_KEY),
  openai: Boolean(env.OPENAI_API_KEY),
  google: Boolean(env.GOOGLE_GENERATIVE_AI_API_KEY),
};

async function requirePassword(userId: string, password: string, field: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new HttpError(401, "Not authenticated");
  }
  if (!(await verifyPassword(user.passwordHash, password))) {
    throw new HttpError(400, "Validation failed", { [field]: ["Password is incorrect"] });
  }
  return user;
}

// Only the last four characters ever leave the server, so the user can tell keys apart.
function publicKey(provider: ProviderName, stored?: { encryptedKey: string; updatedAt: Date }) {
  return {
    provider,
    stored: Boolean(stored),
    last4: stored ? decrypt(stored.encryptedKey).slice(-4) : null,
    updatedAt: stored?.updatedAt ?? null,
    serverDefault: SERVER_KEYS[provider],
  };
}

export async function updateProfile(req: Request, res: Response) {
  const data = updateProfileSchema.parse(req.body);

  if (data.email) {
    const owner = await prisma.user.findUnique({ where: { email: data.email }, select: { id: true } });
    if (owner && owner.id !== req.userId) {
      throw new HttpError(409, EMAIL_TAKEN, { email: [EMAIL_TAKEN] });
    }
  }

  try {
    const user = await prisma.user.update({ where: { id: req.userId }, data, select: publicUser });
    res.json({ user });
  } catch (error) {
    // Another account claimed the email between the check and the update.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new HttpError(409, EMAIL_TAKEN, { email: [EMAIL_TAKEN] });
    }
    throw error;
  }
}

export async function changePassword(req: Request, res: Response) {
  const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
  await requirePassword(req.userId!, currentPassword, "currentPassword");
  await prisma.user.update({
    where: { id: req.userId },
    data: { passwordHash: await hashPassword(newPassword) },
  });
  res.status(204).end();
}

export async function listApiKeys(req: Request, res: Response) {
  const stored = await prisma.llmCredential.findMany({ where: { userId: req.userId } });
  const byProvider = new Map(stored.map((credential) => [credential.provider, credential]));
  res.json({ keys: PROVIDERS.map((provider) => publicKey(provider, byProvider.get(provider))) });
}

export async function saveApiKey(req: Request, res: Response) {
  const { provider } = apiKeyParamsSchema.parse(req.params);
  const { apiKey } = saveApiKeySchema.parse(req.body);
  const userId = req.userId!;
  const encryptedKey = encrypt(apiKey);
  const credential = await prisma.llmCredential.upsert({
    where: { userId_provider: { userId, provider } },
    create: { userId, provider, encryptedKey },
    update: { encryptedKey },
  });
  res.json({ key: publicKey(provider, credential) });
}

export async function deleteApiKey(req: Request, res: Response) {
  const { provider } = apiKeyParamsSchema.parse(req.params);
  const { count } = await prisma.llmCredential.deleteMany({ where: { userId: req.userId, provider } });
  if (count === 0) {
    throw new HttpError(404, "No key stored for this provider");
  }
  res.status(204).end();
}

// Connections, repositories, review jobs and keys all cascade from the user row.
export async function deleteAccount(req: Request, res: Response) {
  const { password } = deleteAccountSchema.parse(req.body);
  await requirePassword(req.userId!, password, "password");
  await prisma.user.delete({ where: { id: req.userId } });
  clearAuthCookie(res);
  res.status(204).end();
}
