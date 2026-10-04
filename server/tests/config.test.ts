import { describe, expect, it } from "vitest";
import { loadReviewConfig } from "../src/review/config/load.ts";
import { parseRepoFile } from "../src/review/config/repoFile.ts";
import { resolveConfig } from "../src/review/config/resolve.ts";
import { DEFAULT_CONFIG, configSchema } from "../src/review/config/schema.ts";
import type { ForgeAdapter } from "../src/review/forge/types.ts";

describe("DEFAULT_CONFIG", () => {
  it("is itself a valid config", () => {
    expect(configSchema.parse(DEFAULT_CONFIG)).toEqual(DEFAULT_CONFIG);
  });
});

describe("resolveConfig", () => {
  it("returns the defaults with no layers", () => {
    const { config, sources } = resolveConfig({});
    expect(config).toEqual(DEFAULT_CONFIG);
    expect(sources["review.blockOn"]).toBe("default");
    expect(sources.profile).toBe("default");
  });

  it("applies layers in precedence order: trigger > repo file > repo settings", () => {
    const { config, sources } = resolveConfig({
      repoSettings: { review: { maxFindings: 10, minConfidence: 0.7 }, output: { walkthrough: false } },
      repoFile: { review: { maxFindings: 20 } },
      trigger: { review: { maxFindings: 30 } },
    });

    expect(config.review.maxFindings).toBe(30);
    expect(config.review.minConfidence).toBe(0.7);
    expect(config.output.walkthrough).toBe(false);
    expect(config.review.blockOn).toBe("critical");
    expect(sources).toMatchObject({
      "review.maxFindings": "trigger",
      "review.minConfidence": "repoSettings",
      "output.walkthrough": "repoSettings",
      "review.blockOn": "default",
    });
  });

  it("applies the selected profile's preset", () => {
    const { config, sources } = resolveConfig({ repoSettings: { profile: "security" } });

    expect(config.profile).toBe("security");
    expect(config.review.categories).toEqual(["security", "reliability"]);
    expect(config.review.blockOn).toBe("major");
    expect(sources["review.blockOn"]).toBe("profile");
    expect(sources.profile).toBe("repoSettings");
  });

  it("lets an explicit field beat the profile, wherever it is set", () => {
    const { config } = resolveConfig({
      repoSettings: { review: { blockOn: "critical" } },
      repoFile: { profile: "strict" },
    });

    // strict would make majors block, but the saved setting is more specific.
    expect(config.profile).toBe("strict");
    expect(config.review.blockOn).toBe("critical");
    expect(config.review.maxFindings).toBe(40);
  });

  it("takes the profile from the highest layer that names one", () => {
    const { config, sources } = resolveConfig({
      repoSettings: { profile: "security" },
      repoFile: { profile: "fast" },
    });
    expect(config.profile).toBe("fast");
    expect(config.output.walkthrough).toBe(false);
    expect(config.review.categories).toEqual(DEFAULT_CONFIG.review.categories);
    expect(sources.profile).toBe("repoFile");
  });

  it("replaces arrays rather than concatenating them", () => {
    const { config } = resolveConfig({ repoFile: { ignorePaths: ["generated/**"] } });
    expect(config.ignorePaths).toEqual(["generated/**"]);
  });

  it("merges language instructions and records them as one setting", () => {
    const { config, sources } = resolveConfig({
      repoSettings: { languageInstructions: { php: "Laravel" } },
      repoFile: { languageInstructions: { go: "Use errgroup" } },
    });
    expect(config.languageInstructions).toEqual({ php: "Laravel", go: "Use errgroup" });
    expect(sources.languageInstructions).toBe("repoFile");
    expect(sources["languageInstructions.php"]).toBeUndefined();
  });

  it("rejects an invalid layer", () => {
    expect(() => resolveConfig({ trigger: { review: { maxFindings: 0 } } })).toThrow();
  });
});

describe("parseRepoFile", () => {
  it("maps snake_case YAML onto the schema, leaving language names alone", () => {
    const { override, warnings } = parseRepoFile(
      ".bammy.yaml",
      [
        "profile: strict",
        "review:",
        "  severity_floor: major",
        "  require_evidence: false",
        "output:",
        "  post_check: false",
        "ignore_paths: [\"gen/**\"]",
        "language_instructions:",
        "  objective_c: Prefer ARC",
      ].join("\n"),
    );

    expect(warnings).toEqual([]);
    expect(override).toEqual({
      profile: "strict",
      review: { severityFloor: "major", requireEvidence: false },
      output: { postCheck: false },
      ignorePaths: ["gen/**"],
      languageInstructions: { objective_c: "Prefer ARC" },
    });
  });

  it("treats an empty file as no overrides", () => {
    expect(parseRepoFile(".bammy.yaml", "# nothing yet\n")).toEqual({ override: {}, warnings: [] });
  });

  it("ignores the whole file and names an unknown setting in snake_case", () => {
    const { override, warnings } = parseRepoFile(
      ".bammy.yaml",
      "review:\n  max_findings: 5\n  severity_flor: major\n",
    );
    expect(override).toBeUndefined();
    expect(warnings).toEqual([".bammy.yaml was ignored: review: unknown setting severity_flor"]);
  });

  it("refuses credentials and endpoints, which the schema does not have", () => {
    const { override, warnings } = parseRepoFile(
      ".bammy.yaml",
      "llm:\n  api_base: https://evil.example\n  api_keys:\n    anthropic: sk\n",
    );
    expect(override).toBeUndefined();
    expect(warnings[0]).toMatch(/unknown setting api_base, api_keys/);
  });

  it("reports an invalid value with its path", () => {
    const { warnings } = parseRepoFile(".bammy.yaml", "review:\n  block_on: blocker\n");
    expect(warnings[0]).toMatch(/^\.bammy\.yaml was ignored: review\.block_on: /);
  });

  it("reports unparseable YAML", () => {
    const { override, warnings } = parseRepoFile(".bammy.yaml", "review: [unclosed\n");
    expect(override).toBeUndefined();
    expect(warnings[0]).toMatch(/could not be parsed/);
  });

  it("rejects a non-mapping document", () => {
    expect(parseRepoFile(".bammy.yaml", "- a\n- b\n").warnings[0]).toMatch(/must be a mapping/);
  });

  it("rejects an oversized file without parsing it", () => {
    const { warnings } = parseRepoFile(".bammy.yaml", `instructions: "${"x".repeat(70 * 1024)}"`);
    expect(warnings[0]).toMatch(/larger than 64 KB/);
  });
});

// Files keyed by `${ref}:${path}`; records which reads were made.
function fakeAdapter(files: Record<string, string>) {
  const reads: string[] = [];
  const adapter = {
    getFileAtRef: async (_project: string, path: string, ref: string) => {
      reads.push(`${ref}:${path}`);
      return files[`${ref}:${path}`] ?? null;
    },
  } as unknown as ForgeAdapter;
  return { adapter, reads };
}

describe("loadReviewConfig", () => {
  it("reads the repository file from the given (base) revision only", async () => {
    const { adapter, reads } = fakeAdapter({
      "base:.bammy.yaml": "review:\n  block_on: major\n",
      "head:.bammy.yaml": "review:\n  block_on: info\n",
    });

    const loaded = await loadReviewConfig({ adapter, project: "acme/web", ref: "base" });

    expect(loaded.config.review.blockOn).toBe("major");
    expect(loaded.repoFile).toBe(".bammy.yaml");
    expect(reads).toEqual(["base:.bammy.yaml"]);
  });

  it("ignores a file that only exists on the head", async () => {
    const { adapter } = fakeAdapter({ "head:.bammy.yaml": "review:\n  block_on: info\n" });

    const loaded = await loadReviewConfig({ adapter, project: "acme/web", ref: "base" });

    expect(loaded.config.review.blockOn).toBe("critical");
    expect(loaded.repoFile).toBeNull();
  });

  it("falls back to .bammy.yml and never merges the two", async () => {
    const { adapter, reads } = fakeAdapter({ "base:.bammy.yml": "profile: fast\n" });

    const loaded = await loadReviewConfig({ adapter, project: "acme/web", ref: "base" });

    expect(loaded.repoFile).toBe(".bammy.yml");
    expect(loaded.config.profile).toBe("fast");
    expect(reads).toEqual(["base:.bammy.yaml", "base:.bammy.yml"]);
  });

  it("keeps reviewing with a warning when the file is invalid", async () => {
    const { adapter } = fakeAdapter({ "base:.bammy.yaml": "review:\n  nope: 1\n" });

    const loaded = await loadReviewConfig({
      adapter,
      project: "acme/web",
      ref: "base",
      repoSettings: { review: { maxFindings: 7 } },
    });

    expect(loaded.config.review.maxFindings).toBe(7);
    expect(loaded.warnings).toEqual([".bammy.yaml was ignored: review: unknown setting nope"]);
  });

  it("ignores saved settings that no longer validate", async () => {
    const { adapter } = fakeAdapter({});

    const loaded = await loadReviewConfig({
      adapter,
      project: "acme/web",
      ref: "base",
      repoSettings: { review: { retiredSetting: true } },
    });

    expect(loaded.config).toEqual(DEFAULT_CONFIG);
    expect(loaded.warnings[0]).toMatch(/no longer valid/);
  });
});
