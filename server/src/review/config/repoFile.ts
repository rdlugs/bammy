import { parse } from "yaml";
import { configOverrideSchema, type ConfigOverride } from "./schema.ts";

export const REPO_CONFIG_FILES = [".bammy.yaml", ".bammy.yml"] as const;
const MAX_BYTES = 64 * 1024;

export interface RepoFileResult {
  override?: ConfigOverride;
  warnings: string[];
}

// The file is snake_case like most YAML; the schema is camelCase. Keys inside
// language_instructions are language names and are left alone.
const VERBATIM_CHILDREN = new Set(["language_instructions"]);

function snakeToCamel(key: string): string {
  return key.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

function camelToSnake(key: string): string {
  return key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

function camelizeKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value;
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      snakeToCamel(key),
      VERBATIM_CHILDREN.has(key) ? child : camelizeKeys(child),
    ]),
  );
}

// A broken file is reported and ignored as a whole rather than failing the
// review or half-applying: the dashboard settings and defaults still hold.
export function parseRepoFile(name: string, text: string): RepoFileResult {
  if (Buffer.byteLength(text, "utf8") > MAX_BYTES) {
    return { warnings: [`${name} is larger than 64 KB and was ignored`] };
  }

  let raw: unknown;
  try {
    raw = parse(text, { maxAliasCount: 50 });
  } catch (err) {
    const reason = err instanceof Error ? err.message.split("\n")[0] : "invalid YAML";
    return { warnings: [`${name} could not be parsed and was ignored: ${reason}`] };
  }
  if (raw === null || raw === undefined) {
    return { override: {}, warnings: [] };
  }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return { warnings: [`${name} must be a mapping of settings and was ignored`] };
  }

  const parsed = configOverrideSchema.safeParse(camelizeKeys(raw));
  if (!parsed.success) {
    return {
      warnings: parsed.error.issues.map((issue) => {
        const path = issue.path.map((part) => camelToSnake(String(part))).join(".");
        const message =
          issue.code === "unrecognized_keys"
            ? `unknown setting ${issue.keys.map(camelToSnake).join(", ")}`
            : issue.message;
        return `${name} was ignored: ${path ? `${path}: ` : ""}${message}`;
      }),
    };
  }
  return { override: parsed.data, warnings: [] };
}
