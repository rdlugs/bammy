import { env } from "../config/env.ts";
import { decrypt } from "../lib/crypto.ts";
import { HttpError } from "../lib/httpError.ts";
import { prisma } from "../lib/prisma.ts";
import type { ForgeConnection } from "../generated/prisma/client.ts";
import { GitHubAdapter } from "../review/forge/github.ts";
import { GitHubApp, githubApiBase } from "../review/forge/githubApp.ts";
import { GitLabAdapter } from "../review/forge/gitlab.ts";
import { ForgeError } from "../review/forge/http.ts";
import { hostOrigin, type ForgeAdapter } from "../review/forge/types.ts";

let githubApp: GitHubApp | null | undefined;

// Null when the GitHub App is not configured, so GitHub connections are simply
// unavailable rather than failing at startup.
export function getGitHubApp(): GitHubApp | null {
  if (githubApp === undefined) {
    const { GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY, GITHUB_APP_CLIENT_ID, GITHUB_APP_CLIENT_SECRET } =
      env;
    githubApp =
      GITHUB_APP_ID && GITHUB_APP_PRIVATE_KEY && GITHUB_APP_CLIENT_ID && GITHUB_APP_CLIENT_SECRET
        ? new GitHubApp({
            appId: GITHUB_APP_ID,
            privateKey: GITHUB_APP_PRIVATE_KEY,
            clientId: GITHUB_APP_CLIENT_ID,
            clientSecret: GITHUB_APP_CLIENT_SECRET,
            webOrigin: hostOrigin(env.GITHUB_HOST),
            apiBaseUrl: githubApiBase(env.GITHUB_HOST),
          })
        : null;
  }
  return githubApp;
}

export function githubConfigured(): boolean {
  return getGitHubApp() !== null && Boolean(env.GITHUB_APP_SLUG);
}

export function githubInstallUrl(state: string): string | null {
  if (!githubConfigured()) {
    return null;
  }
  // GitHub Enterprise Server serves app pages under /github-apps.
  const appsPath = env.GITHUB_HOST === "github.com" ? "apps" : "github-apps";
  const slug = encodeURIComponent(env.GITHUB_APP_SLUG!);
  return `${hostOrigin(env.GITHUB_HOST)}/${appsPath}/${slug}/installations/new?state=${encodeURIComponent(state)}`;
}

export function adapterForConnection(connection: ForgeConnection): ForgeAdapter {
  if (connection.provider === "github") {
    const app = getGitHubApp();
    const installationId = connection.installationId;
    if (!app || !installationId) {
      throw new HttpError(503, "GitHub is not configured on this server");
    }
    return new GitHubAdapter({
      host: connection.host,
      token: () => app.installationToken(installationId),
      account: async () => ({ login: connection.accountLogin }),
    });
  }

  const encryptedToken = connection.encryptedToken;
  if (!encryptedToken) {
    throw new HttpError(500, "GitLab connection has no token");
  }
  return new GitLabAdapter({ host: connection.host, token: async () => decrypt(encryptedToken) });
}

export async function loadOwnedConnection(userId: string, id: string): Promise<ForgeConnection> {
  const connection = await prisma.forgeConnection.findFirst({ where: { id, userId } });
  if (!connection) {
    throw new HttpError(404, "Connection not found");
  }
  return connection;
}

// Translates a forge failure into something the user can act on. A forge
// refusing our credentials is a broken connection, not a 401 from Bammy.
export function toHttpError(err: unknown, provider: string): unknown {
  if (!(err instanceof ForgeError)) {
    return err;
  }
  if (err.status === 401 || err.status === 403) {
    return new HttpError(502, `${provider} rejected the stored credentials; reconnect the account`);
  }
  if (err.status === 404) {
    return new HttpError(404, `Not found on ${provider}`);
  }
  return new HttpError(502, `${provider} request failed`);
}
