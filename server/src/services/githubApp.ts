import { env } from "../config/env.ts";
import { GitHubApp, githubApiBase } from "../review/forge/githubApp.ts";
import { hostOrigin } from "../review/forge/types.ts";

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
