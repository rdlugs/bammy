import { describe, expect, it } from "vitest";
import type { ReviewResult } from "../src/review/core/models.ts";
import { summarize, toJson } from "../src/review/render/json.ts";
import { SUMMARY_MARKER, sanitize, toMarkdown } from "../src/review/render/markdown.ts";
import { sampleResult } from "./helpers/result.ts";

describe("summarize and toJson", () => {
  it("counts by severity and bucket in a stable order", async () => {
    const result = await sampleResult();
    expect(summarize(result)).toEqual({
      title: "Add b and c",
      webUrl: "https://github.com/acme/web/pull/42",
      total: 4,
      bySeverity: { critical: 1, major: 1, minor: 2 },
      byBucket: { actionable: 2, outside_diff: 1, nitpick: 1 },
      hasBlocking: true,
    });
  });

  it("adds the summary and token totals to the stored result", async () => {
    const result = await sampleResult();
    const json = toJson(result);
    expect(json.findings).toEqual(result.findings);
    expect(json.usageTotals).toEqual({ calls: 2, inputTokens: 200, outputTokens: 40 });
  });
});

describe("toMarkdown", () => {
  it("renders the whole document", async () => {
    await expect(toMarkdown(await sampleResult())).toMatchFileSnapshot("__snapshots__/review.md");
  });

  it("depends only on the result", async () => {
    const result = await sampleResult();
    expect(toMarkdown(result)).toBe(toMarkdown(structuredClone(result)));
  });

  it("ends with the summary marker exactly once", async () => {
    const markdown = toMarkdown(await sampleResult());
    expect(markdown.endsWith(`${SUMMARY_MARKER}\n`)).toBe(true);
    expect(markdown.split(SUMMARY_MARKER)).toHaveLength(2);
  });

  it("indexes actionable findings and details the rest", async () => {
    const markdown = toMarkdown(await sampleResult());
    expect(markdown).toContain("<summary>Actionable comments (2)</summary>");
    expect(markdown).toContain("<summary>Nitpick comments (1)</summary>");
    expect(markdown).toContain("<summary>Outside diff range comments (1)</summary>");
    expect(markdown).toContain("#### `src/app.ts:40`: Caller ignores &lt;result&gt;");
    expect(markdown).toContain("- `package-lock.json`: ignored by configuration");
  });

  const withVerdict = (result: ReviewResult, patch: Partial<ReviewResult>) => ({ ...result, ...patch });

  it("states pass and incomplete verdicts plainly", async () => {
    const base = await sampleResult();
    const clean = withVerdict(base, {
      findings: [],
      verdict: { verdict: "pass", blockOn: "critical", blocking: [] },
    });
    expect(toMarkdown(clean)).toContain("✅ **Pass**: no findings at or above critical.");
    expect(toMarkdown(clean)).toContain("\nNo findings.\n");

    const partial = withVerdict(clean, { status: "partial", verdict: { verdict: "error", blockOn: "critical", blocking: [] } });
    expect(toMarkdown(partial)).toContain(
      "⚠️ **Review incomplete**: part of the change was not reviewed, so the absence of findings is not a pass.",
    );
  });

  it("never uses an em dash", async () => {
    expect(toMarkdown(await sampleResult())).not.toContain("—");
  });
});

describe("sanitize", () => {
  it("defuses mentions but leaves emails and code alone", () => {
    expect(sanitize("ping @alice and @org/team")).toBe("ping @​alice and @​org/team");
    expect(sanitize("mail a@b.com")).toBe("mail a@b.com");
    expect(sanitize("use `@Injectable`")).toBe("use `@Injectable`");
  });

  it("stops model text from forging Bammy's markers", () => {
    expect(sanitize("<!-- bammy:summary -->")).not.toContain("<!-- bammy:summary");
  });
});
