import type { ForgeProvider } from "../core/models.ts";

export interface ParsedChangeUrl {
  provider: ForgeProvider;
  // Host as stored on a connection: bare for https, with scheme for http.
  host: string;
  project: string;
  number: number;
}

const GITHUB_PULL = /^\/([^/]+\/[^/]+)\/pull\/(\d+)(?:\/.*)?$/;
const GITLAB_MR = /^\/(.+?)\/-\/merge_requests\/(\d+)(?:\/.*)?$/;

// Recognises a pull or merge request by its path shape rather than its domain,
// so self-hosted instances work without configuration.
export function parseChangeUrl(raw: string): ParsedChangeUrl | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return null;
  }
  const host = url.protocol === "http:" ? `http://${url.host}` : url.host;
  const path = url.pathname.replace(/\/+$/, "");

  const gitlab = GITLAB_MR.exec(path);
  if (gitlab) {
    return { provider: "gitlab", host, project: gitlab[1]!, number: Number(gitlab[2]) };
  }
  const github = GITHUB_PULL.exec(path);
  if (github) {
    return { provider: "github", host, project: github[1]!, number: Number(github[2]) };
  }
  return null;
}
