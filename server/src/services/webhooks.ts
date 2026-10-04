import { randomBytes } from "node:crypto";
import { env } from "../config/env.ts";
import { decrypt, encrypt } from "../lib/crypto.ts";
import { prisma } from "../lib/prisma.ts";
import type { ForgeConnection, Repository } from "../generated/prisma/client.ts";
import { GitLabAdapter } from "../review/forge/gitlab.ts";
import { adapterForConnection } from "./forge.ts";

export interface WebhookState {
  active: boolean;
  error?: string;
}

export function gitlabWebhookUrl(repositoryId: string): string {
  return `${env.API_PUBLIC_URL.replace(/\/+$/, "")}/api/webhooks/gitlab/${repositoryId}`;
}

// GitHub delivers every installation's events to the app's single webhook, so
// only GitLab repositories need a hook of their own.
export async function ensureWebhook(repo: Repository, connection: ForgeConnection): Promise<WebhookState> {
  if (repo.provider !== "gitlab") {
    return env.GITHUB_WEBHOOK_SECRET
      ? { active: true }
      : { active: false, error: "GITHUB_WEBHOOK_SECRET is not set on this server" };
  }
  if (repo.webhookId) return { active: true };

  const adapter = adapterForConnection(connection);
  if (!(adapter instanceof GitLabAdapter)) return { active: false, error: "Not a GitLab connection" };
  const secret = randomBytes(32).toString("hex");
  try {
    const webhookId = await adapter.createProjectHook(repo.externalId, gitlabWebhookUrl(repo.id), secret);
    await prisma.repository.update({
      where: { id: repo.id },
      data: { webhookId, encryptedWebhookSecret: encrypt(secret) },
    });
    return { active: true };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return { active: false, error: `Automatic reviews are off: GitLab refused the webhook (${reason})` };
  }
}

// Best effort: a hook left behind only delivers events Bammy then ignores.
export async function removeWebhook(repo: Repository, connection: ForgeConnection): Promise<void> {
  if (repo.provider !== "gitlab" || !repo.webhookId) return;
  const adapter = adapterForConnection(connection);
  if (adapter instanceof GitLabAdapter) {
    await adapter.deleteProjectHook(repo.externalId, repo.webhookId).catch((err: unknown) => {
      console.warn(`Could not remove GitLab hook ${repo.webhookId} from ${repo.fullPath}`, err);
    });
  }
  await prisma.repository.update({
    where: { id: repo.id },
    data: { webhookId: null, encryptedWebhookSecret: null },
  });
}

export function webhookSecret(repo: Repository): string | null {
  return repo.encryptedWebhookSecret ? decrypt(repo.encryptedWebhookSecret) : null;
}
