import type { ForgeProvider } from "../core/models.ts";
import { FORGE_INFO, FORGE_PROVIDERS } from "./providers.ts";

export interface ParsedChangeUrl {
  provider: ForgeProvider;
  // Host as stored on a connection: bare for https, with scheme for http.
  host: string;
  project: string;
  number: number;
}

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

  for (const provider of FORGE_PROVIDERS) {
    const change = FORGE_INFO[provider].parseChangePath(path);
    if (change) {
      return { provider, host, ...change };
    }
  }
  return null;
}
