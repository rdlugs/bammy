import type { ForgeAdapter } from "../forge/types.ts";
import { parseRepoFile, REPO_CONFIG_FILES } from "./repoFile.ts";
import { resolveConfig, type ResolvedConfig } from "./resolve.ts";
import { dashboardOverrideSchema, type ConfigOverride, type DashboardOverride } from "./schema.ts";

export interface LoadConfigInput {
  adapter: ForgeAdapter;
  project: string;
  // The revision the repository file is read from. For a review this is the
  // base, never the head: a change must not be able to loosen its own review.
  ref: string;
  globalSettings?: unknown;
  repoSettings?: unknown;
  // The repository follows the global config, so its own settings are ignored
  // (but kept, so turning this off brings them back).
  followGlobal?: boolean;
  trigger?: ConfigOverride;
}

export interface LoadedConfig extends ResolvedConfig {
  repoFile: string | null;
  warnings: string[];
}

export async function loadReviewConfig(input: LoadConfigInput): Promise<LoadedConfig> {
  const warnings: string[] = [];

  // Saved settings were valid when written; a schema change since then must
  // not take every review of the repository down with it.
  function saved(value: unknown, label: string): DashboardOverride | undefined {
    if (value === undefined) return undefined;
    const parsed = dashboardOverrideSchema.safeParse(value);
    if (parsed.success) return parsed.data;
    warnings.push(`Saved ${label} settings are no longer valid and were ignored`);
    return undefined;
  }
  const global = saved(input.globalSettings, "global");
  const repoSettings = input.followGlobal ? undefined : saved(input.repoSettings, "repository");

  let repoFile: string | null = null;
  let fileOverride: ConfigOverride | undefined;
  for (const name of REPO_CONFIG_FILES) {
    const text = await input.adapter.getFileAtRef(input.project, name, input.ref);
    if (text === null) continue;
    // Like roborak, the first file found wins; the two are never merged.
    repoFile = name;
    const result = parseRepoFile(name, text);
    fileOverride = result.override;
    warnings.push(...result.warnings);
    break;
  }

  return {
    ...resolveConfig({ global, repoSettings, repoFile: fileOverride, trigger: input.trigger }),
    repoFile,
    warnings,
  };
}
