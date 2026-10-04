import type { Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.ts";
import { encrypt } from "../lib/crypto.ts";
import { assertSafeForgeHost } from "../lib/hostSafety.ts";
import { HttpError } from "../lib/httpError.ts";
import { prisma } from "../lib/prisma.ts";
import { ForgeError } from "../review/forge/http.ts";
import { FORGE_PROVIDERS, forgeName } from "../review/forge/providers.ts";
import { hostOrigin } from "../review/forge/types.ts";
import { loadOwnedConnection } from "../services/forge.ts";
import { getGitHubApp, githubInstallUrl } from "../services/githubApp.ts";
import { isForgeProvider, PROVIDERS, providerFor } from "../services/providers/index.ts";
import { removeWebhook } from "../services/webhooks.ts";
import { githubCallbackSchema } from "../schemas/connections.schema.ts";

const publicConnection = {
  id: true,
  provider: true,
  host: true,
  kind: true,
  accountLogin: true,
  createdAt: true,
} as const;

const INSTALL_STATE_PURPOSE = "github-install";

export async function listConnections(req: Request, res: Response) {
  const connections = await prisma.forgeConnection.findMany({
    where: { userId: req.userId },
    select: publicConnection,
    orderBy: { createdAt: "asc" },
  });
  const availableApps = FORGE_PROVIDERS.filter((provider) => PROVIDERS[provider].appAvailable?.());
  res.json({ connections, availableApps });
}

const RECENT_REVIEWS = 5;

// Everything the details sheet shows, from the database only; credential
// health is the separate (slower) status check.
export async function getConnection(req: Request, res: Response) {
  const connection = await loadOwnedConnection(req.userId!, String(req.params.id));
  const provider = providerFor(connection.provider);
  const reviewScope = { repository: { connectionId: connection.id } };

  const [repositories, total, recent] = await Promise.all([
    prisma.repository.findMany({
      where: { connectionId: connection.id, enabled: true },
      orderBy: { fullPath: "asc" },
    }),
    prisma.reviewJob.count({ where: reviewScope }),
    prisma.reviewJob.findMany({
      where: reviewScope,
      orderBy: { createdAt: "desc" },
      take: RECENT_REVIEWS,
      select: {
        id: true,
        number: true,
        status: true,
        verdict: true,
        createdAt: true,
        repository: { select: { fullPath: true, provider: true } },
      },
    }),
  ]);

  // Same rule as ensureWebhook: an app delivers events for every repository,
  // otherwise a repository needs its own hook. Hook ids and secrets stay here.
  const appWebhook = provider.appWebhook?.(connection) ?? null;
  res.json({
    connection: {
      id: connection.id,
      provider: connection.provider,
      host: connection.host,
      kind: connection.kind,
      accountLogin: connection.accountLogin,
      installationId: connection.installationId,
      createdAt: connection.createdAt,
      updatedAt: connection.updatedAt,
    },
    repositories: repositories.map((repo) => ({
      id: repo.id,
      fullPath: repo.fullPath,
      defaultBranch: repo.defaultBranch,
      webUrl: `${hostOrigin(connection.host)}/${repo.fullPath}`,
      webhook: appWebhook ?? { active: Boolean(repo.webhookId) },
    })),
    reviews: { total, recent },
  });
}

// Asks the forge whether the stored credentials still work. Always 200: a
// refused or unreachable forge is the answer, not a failure of this request.
export async function connectionStatus(req: Request, res: Response) {
  const connection = await loadOwnedConnection(req.userId!, String(req.params.id));
  let status: "active" | "revoked" | "unreachable";
  try {
    await providerFor(connection.provider).checkCredentials(connection);
    status = "active";
  } catch (err) {
    const refused = err instanceof ForgeError && [401, 403, 404].includes(err.status);
    status = refused ? "revoked" : "unreachable";
  }
  res.json({ status });
}

// Any forge whose provider definition accepts a pasted host and token.
export async function connectWithToken(req: Request, res: Response) {
  const provider = String(req.params.provider);
  if (!isForgeProvider(provider)) {
    throw new HttpError(404, "Unknown provider");
  }
  const tokenConnect = PROVIDERS[provider].tokenConnect;
  if (!tokenConnect) {
    throw new HttpError(404, `${forgeName(provider)} does not connect with a token`);
  }
  const { host, token } = tokenConnect.schema.parse(req.body);
  await assertSafeForgeHost(host);

  const name = forgeName(provider);
  let login: string;
  try {
    ({ login } = await tokenConnect.account(host, token));
  } catch (err) {
    if (err instanceof ForgeError && (err.status === 401 || err.status === 403)) {
      throw new HttpError(400, `${name} rejected this token`);
    }
    throw new HttpError(502, `Could not reach ${name} at ${host}`);
  }

  const userId = req.userId!;
  const existing = await prisma.forgeConnection.findFirst({
    where: { userId, provider, kind: "token", host, accountLogin: login },
  });
  const data = { encryptedToken: encrypt(token) };
  const connection = existing
    ? await prisma.forgeConnection.update({ where: { id: existing.id }, data, select: publicConnection })
    : await prisma.forgeConnection.create({
        data: { ...data, userId, provider, host, kind: "token", accountLogin: login },
        select: publicConnection,
      });

  res.status(existing ? 200 : 201).json({ connection });
}

export function githubInstall(req: Request, res: Response) {
  const state = jwt.sign({ sub: req.userId, purpose: INSTALL_STATE_PURPOSE }, env.JWT_SECRET, {
    expiresIn: "10m",
  });
  const url = githubInstallUrl(state);
  if (!url) {
    throw new HttpError(503, "GitHub is not configured on this server");
  }
  res.redirect(url);
}

function backToClient(res: Response, params: Record<string, string>) {
  res.redirect(`${env.CLIENT_ORIGIN}/connections?${new URLSearchParams(params)}`);
}

// The browser lands here from GitHub, so every outcome is a redirect back to
// the client rather than a JSON error.
export async function githubCallback(req: Request, res: Response) {
  const parsed = githubCallbackSchema.safeParse(req.query);
  const app = getGitHubApp();
  if (!parsed.success || !app) {
    return backToClient(res, { error: "github_install_failed" });
  }
  const { installation_id: installationId, setup_action: setupAction, state, code } = parsed.data;

  // The state ties the round trip to the logged-in user who started it.
  let stateUser: unknown;
  try {
    const payload = jwt.verify(state, env.JWT_SECRET);
    stateUser = typeof payload === "object" && payload.purpose === INSTALL_STATE_PURPOSE && payload.sub;
  } catch {
    stateUser = null;
  }
  if (!stateUser || stateUser !== req.userId) {
    return backToClient(res, { error: "github_install_failed" });
  }
  if (setupAction === "request" || !installationId) {
    // An org owner has to approve the installation first.
    return backToClient(res, { error: "github_pending_approval" });
  }
  if (!code) {
    return backToClient(res, { error: "github_install_failed" });
  }

  try {
    if (!(await app.userHasInstallation(code, installationId))) {
      return backToClient(res, { error: "github_install_forbidden" });
    }
    const installation = await app.installation(installationId);
    const userId = req.userId!;
    const existing = await prisma.forgeConnection.findFirst({
      where: { userId, provider: "github", installationId },
    });
    const data = { accountLogin: installation.account.login, host: env.GITHUB_HOST };
    if (existing) {
      await prisma.forgeConnection.update({ where: { id: existing.id }, data });
    } else {
      await prisma.forgeConnection.create({
        data: { ...data, userId, provider: "github", kind: "github_app", installationId },
      });
    }
  } catch (err) {
    console.error("GitHub installation callback failed", err);
    return backToClient(res, { error: "github_install_failed" });
  }
  backToClient(res, { connected: "github" });
}

export async function deleteConnection(req: Request, res: Response) {
  const connection = await prisma.forgeConnection.findFirst({
    where: { id: String(req.params.id), userId: req.userId },
    include: { repositories: true },
  });
  if (!connection) {
    throw new HttpError(404, "Connection not found");
  }
  // Take Bammy's hooks off the forge while the token still works.
  for (const repo of connection.repositories) {
    await removeWebhook(repo, connection).catch(() => undefined);
  }
  await prisma.forgeConnection.delete({ where: { id: connection.id } });
  res.status(204).end();
}
