import { HttpError } from "../../lib/httpError.ts";
import type { ForgeProvider } from "../../review/core/models.ts";
import { githubProvider } from "./github.ts";
import { gitlabProvider } from "./gitlab.ts";
import type { ProviderDefinition } from "./types.ts";

export type { Forge, ProviderDefinition, RepoWithConnection, WebhookOutcome, WebhookState } from "./types.ts";

export const PROVIDERS: Record<ForgeProvider, ProviderDefinition> = {
  github: githubProvider,
  gitlab: gitlabProvider,
};

export function isForgeProvider(id: string): id is ForgeProvider {
  return Object.hasOwn(PROVIDERS, id);
}

export function providerFor(id: string): ProviderDefinition {
  if (!isForgeProvider(id)) {
    throw new HttpError(404, "Unknown provider");
  }
  return PROVIDERS[id];
}
