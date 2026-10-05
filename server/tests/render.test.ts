import { describe, expect, it } from "vitest";
import type { ReviewResult } from "../src/review/core/models.ts";
import { summarize, toJson } from "../src/review/render/json.ts";
import { inlineBody } from "../src/review/publish/inline.ts";
import { allFindingsPrompt, findingPrompt } from "../src/review/render/agentPrompt.ts";
import { BRAND_FOOTER, SUMMARY_MARKER, sanitize, toMarkdown, walkthroughMarkdown } from "../src/review/render/markdown.ts";
import { progressMarkdown } from "../src/review/render/progress.ts";
import { makeChangeSet } from "./helpers/changeSet.ts";
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

describe("toMarkdown with a walkthrough", () => {
  it("opens with the walkthrough under one heading, then the review", async () => {
    const result = await sampleResult();
    const merged = toMarkdown(result, { walkthrough: true });
    expect(merged.match(/^#{2,3} /gm)).toEqual(["## "]);
    expect(merged).toMatch(/^## Summary\n\nAdds b and c\./);
    expect(merged.indexOf("Review effort:")).toBeLessThan(merged.indexOf("**Blocked**"));
    expect(merged.trimEnd().endsWith(SUMMARY_MARKER)).toBe(true);
    expect(toMarkdown(result, { walkthrough: false })).toMatch(/^## Summary\n\n⛔ \*\*Blocked\*\*/);
  });
});

describe("review stats line", () => {
  it("is on by default and can be left out, keeping the footer and marker", async () => {
    const result = await sampleResult();
    expect(toMarkdown(result)).toContain("<sub>Reviewed `head` with");
    const without = toMarkdown(result, { stats: false });
    expect(without).not.toContain("<sub>Reviewed `");
    expect(without.trimEnd().endsWith(`${BRAND_FOOTER}\n\n${SUMMARY_MARKER}`)).toBe(true);
  });
});

describe("agent prompts", () => {
  const ALL = "Prompt for all review comments with AI agents";

  it("adds one prompt for every finding to the summary by default", async () => {
    const result = await sampleResult();
    const markdown = toMarkdown(result);
    expect(markdown).toContain(`<summary>🤖 ${ALL}</summary>`);
    for (const finding of result.findings) expect(markdown).toContain(`In ${finding.file} around`);
    expect(toMarkdown(result, { agentPrompt: false })).not.toContain(ALL);
  });

  it("leaves the summary prompt out when there are no findings", async () => {
    const clean: ReviewResult = { ...(await sampleResult()), findings: [] };
    expect(toMarkdown(clean)).not.toContain(ALL);
  });

  it("puts a prompt for its own finding in each inline comment, unless turned off", async () => {
    const [finding] = (await sampleResult()).findings;
    const body = inlineBody(finding!, "github");
    expect(body).toContain("<summary>🤖 Prompt for AI agents</summary>");
    expect(body).toContain(findingPrompt(finding!));
    expect(body.indexOf("Prompt for AI agents")).toBeLessThan(body.indexOf(BRAND_FOOTER));
    expect(inlineBody(finding!, "github", { agentPrompt: false })).not.toContain("Prompt for AI agents");
  });

  it("names the file and lines and carries the suggested fix", async () => {
    const result = await sampleResult();
    const finding = { ...result.findings[0]!, title: "Plain title", startLine: 3, endLine: 5, suggestion: "const fixed = true;\n" };
    const prompt = findingPrompt(finding);
    expect(prompt).toContain(`In ${finding.file} around lines 3-5: ${finding.title}`);
    expect(prompt).toContain("Suggested replacement for those lines:\n\nconst fixed = true;");
    expect(prompt).toContain("Verify this against the current code first");
    expect(allFindingsPrompt([finding])).toMatch(/^Verify each finding.*\n\n1\. In /);
  });

  it("cannot forge Bammy's markers from model text", async () => {
    const finding = { ...(await sampleResult()).findings[0]!, body: "<!-- bammy:fp=0123456789abcdef -->" };
    expect(findingPrompt(finding)).not.toContain("<!-- bammy:");
  });
});

describe("branding", () => {
  it("names Bammy only in the footer of every posted body", async () => {
    const result = await sampleResult();
    const bodies = [
      toMarkdown(result),
      walkthroughMarkdown(result),
      progressMarkdown(makeChangeSet()),
      ...result.findings.map((f) => inlineBody(f, "github")),
    ];
    for (const body of bodies) {
      expect(body).toContain(BRAND_FOOTER);
      expect(body).not.toMatch(/^#+ .*Bammy/m);
    }
  });

  it("keeps the hidden markers after the footer", async () => {
    const result = await sampleResult();
    const summary = toMarkdown(result);
    expect(summary.indexOf(BRAND_FOOTER)).toBeLessThan(summary.indexOf(SUMMARY_MARKER));
    const inline = inlineBody(result.findings[0]!, "gitlab");
    expect(inline.trimEnd().endsWith("-->")).toBe(true);
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
