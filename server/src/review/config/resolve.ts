import { PROFILES } from "./profiles.ts";
import {
  DEFAULT_CONFIG,
  configOverrideSchema,
  configSchema,
  type Config,
  type ConfigOverride,
  type ProfileName,
} from "./schema.ts";

export type LayerName = "default" | "profile" | "repoSettings" | "repoFile" | "trigger";

export interface ConfigLayers {
  // Saved in the dashboard, validated on write.
  repoSettings?: ConfigOverride;
  // `.bammy.yaml` from the base revision, already parsed.
  repoFile?: ConfigOverride;
  // A one-off override from whatever started the review.
  trigger?: ConfigOverride;
}

export interface ResolvedConfig {
  config: Config;
  // Dotted leaf path to the layer that set it, so a result can say why a
  // setting has the value it does.
  sources: Record<string, LayerName>;
}

type Plain = Record<string, unknown>;

function isPlainObject(value: unknown): value is Plain {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Objects merge key by key; arrays and scalars replace. Replacing arrays is
// what a user expects from `ignore_paths: [...]` in a file.
function merge(base: Plain, override: Plain): Plain {
  const out: Plain = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (value === undefined) continue;
    out[key] = isPlainObject(value) && isPlainObject(out[key]) ? merge(out[key] as Plain, value) : value;
  }
  return out;
}

// languageInstructions is a map keyed by language; its keys are data, not
// settings, so it is recorded as one leaf.
const MAP_PATHS = new Set(["languageInstructions"]);

function recordLeaves(value: unknown, layer: LayerName, sources: Record<string, LayerName>, path = "") {
  if (isPlainObject(value) && !MAP_PATHS.has(path)) {
    for (const [key, child] of Object.entries(value)) {
      recordLeaves(child, layer, sources, path ? `${path}.${key}` : key);
    }
  } else if (value !== undefined && path) {
    sources[path] = layer;
  }
}

// Precedence, lowest first: defaults, profile preset, repository settings,
// repository file, trigger. The profile itself is chosen by the highest layer
// that names one.
export function resolveConfig(layers: ConfigLayers): ResolvedConfig {
  const ordered: [LayerName, ConfigOverride | undefined][] = [
    ["repoSettings", layers.repoSettings],
    ["repoFile", layers.repoFile],
    ["trigger", layers.trigger],
  ];
  for (const [, layer] of ordered) {
    if (layer) configOverrideSchema.parse(layer);
  }

  const naming = [...ordered].reverse().find(([, layer]) => layer?.profile);
  const profile: ProfileName = naming?.[1]?.profile ?? DEFAULT_CONFIG.profile;

  const sources: Record<string, LayerName> = {};
  recordLeaves(DEFAULT_CONFIG, "default", sources);
  let merged = merge({}, DEFAULT_CONFIG);

  const stack: [LayerName, ConfigOverride][] = [["profile", { ...PROFILES[profile], profile }]];
  for (const [name, layer] of ordered) {
    if (layer) stack.push([name, layer]);
  }
  for (const [name, layer] of stack) {
    merged = merge(merged, layer as Plain);
    recordLeaves(layer, name, sources);
  }
  // `profile` is decided above, not merged; attribute it to whoever named it.
  sources.profile = naming?.[0] ?? "default";

  return { config: configSchema.parse(merged), sources };
}
