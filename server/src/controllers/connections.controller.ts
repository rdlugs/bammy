import type { Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.ts";
import { encrypt } from "../lib/crypto.ts";
import { assertSafeForgeHost } from "../lib/hostSafety.ts";
import { HttpError } from "../lib/httpError.ts";
import { prisma } from "../lib/prisma.ts";
import { GitLabAdapter } from "../review/forge/gitlab.ts";
import { ForgeError } from "../review/forge/http.ts";
import { getGitHubApp, githubConfigured, githubInstallUrl } from "../services/forge.ts";
import { githubCallbackSchema, gitlabConnectSchema } from "../schemas/connections.schema.ts";

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
  res.json({ connections, githubAvailable: githubConfigured() });
}

export async function connectGitlab(req: Request, res: Response) {
  const { host, token } = gitlabConnectSchema.parse(req.body);
  await assertSafeForgeHost(host);

  let login: string;
  try {
    ({ login } = await new GitLabAdapter({ host, token: async () => token }).currentAccount());
  } catch (err) {
    if (err instanceof ForgeError && (err.status === 401 || err.status === 403)) {
      throw new HttpError(400, "GitLab rejected this token");
    }
    throw new HttpError(502, `Could not reach GitLab at ${host}`);
  }

  const userId = req.userId!;
  const existing = await prisma.forgeConnection.findFirst({
    where: { userId, provider: "gitlab", host, accountLogin: login },
  });
  const data = { encryptedToken: encrypt(token) };
  const connection = existing
    ? await prisma.forgeConnection.update({ where: { id: existing.id }, data, select: publicConnection })
    : await prisma.forgeConnection.create({
        data: { ...data, userId, provider: "gitlab", host, kind: "token", accountLogin: login },
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
  const { count } = await prisma.forgeConnection.deleteMany({
    where: { id: String(req.params.id), userId: req.userId },
  });
  if (count === 0) {
    throw new HttpError(404, "Connection not found");
  }
  res.status(204).end();
}
