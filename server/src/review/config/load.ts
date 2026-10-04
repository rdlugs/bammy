import type { ForgeAdapter } from "../forge/types.ts";
import { parseRepoFile, REPO_CONFIG_FILES } from "./repoFile.ts";
import { resolveConfig, type ResolvedConfig } from "./resolve.ts";
import { configOverrideSchema, type ConfigOverride } from "./schema.ts";

export interface LoadConfigInput {
  adapter: ForgeAdapter;
  project: string;
  // The revision the repository file is read from. For a review this is the
  // base, never the head: a change must not be able to loosen its own review.
  ref: string;
  repoSettings?: unknown;
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
  let repoSettings: ConfigOverride | undefined;
  if (input.repoSettings !== undefined) {
    const parsed = configOverrideSchema.safeParse(input.repoSettings);
    if (parsed.success) {
      repoSettings = parsed.data;
    } else {
      warnings.push("Saved repository settings are no longer valid and were ignored");
    }
  }

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
    ...resolveConfig({ repoSettings, repoFile: fileOverride, trigger: input.trigger }),
    repoFile,
    warnings,
  };
}
