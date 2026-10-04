import { describe, expect, it } from "vitest";
import { resolveConfig } from "../src/review/config/resolve.ts";
import type { ConfigOverride } from "../src/review/config/schema.ts";
import { WALKTHROUGH_MARKER, markersIn, withDescriptionBlock } from "../src/review/core/markers.ts";
import type { Finding, ReviewResult } from "../src/review/core/models.ts";
import type { CommitStatus, ForgePublisher, InlineComment } from "../src/review/forge/types.ts";
import { inlineBody, inlineComments } from "../src/review/publish/inline.ts";
import { publishReview } from "../src/review/publish/publisher.ts";
import { commitStatus } from "../src/review/publish/status.ts";
import { toMarkdown, walkthroughMarkdown } from "../src/review/render/markdown.ts";
import { makeChangeSet } from "./helpers/changeSet.ts";
import { sampleResult } from "./helpers/result.ts";

const config = (override: ConfigOverride = {}) => resolveConfig({ trigger: override }).config;

function finding(result: ReviewResult, title: string): Finding {
  return result.findings.find((f) => f.title.startsWith(title))!;
}

describe("inlineBody", () => {
  it("uses each forge's suggestion syntax and ends with the fingerprint marker", async () => {
    const result = await sampleResult();
    const blocker = { ...finding(result, "SQL"), endLine: 12 };

    const github = inlineBody(blocker, "github");
    const gitlab = inlineBody(blocker, "gitlab");

    expect(github).toContain("```suggestion\ndb.query(sql, [b]);\n```");
    expect(gitlab).toContain("```suggestion:-0+1\ndb.query(sql, [b]);\n```");
    expect(markersIn(github)).toEqual([blocker.fingerprint]);
    expect(github).toContain("SQL built from @​input");
  });
});

describe("inlineComments", () => {
  it("posts only actionable findings not already posted", async () => {
    const result = await sampleResult();
    const changeSet = makeChangeSet();
    const actionable = result.findings.filter((f) => f.bucket === "actionable");

    const all = inlineComments(result.findings, changeSet, "github", new Set());
    expect(all.map((c) => c.fingerprint)).toEqual(actionable.map((f) => f.fingerprint));

    const rest = inlineComments(result.findings, changeSet, "github", new Set([actionable[0]!.fingerprint]));
    expect(rest.map((c) => c.fingerprint)).toEqual([actionable[1]!.fingerprint]);
  });

  it("adds the old line for a finding on an unchanged context line", async () => {
    const result = await sampleResult();
    const onContext: Finding = { ...finding(result, "SQL"), startLine: 13, endLine: 13 };

    const [comment] = inlineComments([onContext], makeChangeSet(), "gitlab", new Set());

    // Line 13 is " const d = 4;", old line 11 (two lines were added above it).
    expect(comment).toMatchObject({ startLine: 13, oldLine: 11 });
    expect(inlineComments([finding(result, "SQL")], makeChangeSet(), "gitlab", new Set())[0]!.oldLine).toBeUndefined();
  });
});

describe("commitStatus", () => {
  it("maps the verdict to a state with a reason", async () => {
    const result = await sampleResult();
    expect(commitStatus(result, "http://x")).toEqual({
      state: "failure",
      description: "1 finding at or above critical",
      targetUrl: "http://x",
    });
    expect(commitStatus({ ...result, verdict: { verdict: "pass", blockOn: "major", blocking: [] } }).state).toBe("success");
    expect(commitStatus({ ...result, verdict: { verdict: "error", blockOn: "major", blocking: [] } }).state).toBe("error");
  });
});

function recordingPublisher(options: { onForge?: string[]; failInline?: boolean; description?: string } = {}) {
  const calls = {
    inline: [] as InlineComment[],
    summaries: [] as string[],
    statuses: [] as CommitStatus[],
    comments: [] as { marker: string; body: string }[],
    descriptions: [] as string[],
    labels: [] as { add: string[]; remove: string[] }[],
  };
  const publisher: ForgePublisher = {
    listPostedFingerprints: async () => new Set(options.onForge ?? []),
    postInlineComments: async (_ref, comments) => {
      if (options.failInline) throw new Error("boom");
      calls.inline.push(...comments);
      return { posted: comments.map((c) => ({ fingerprint: c.fingerprint, forgeCommentId: "1" })), failed: [] };
    },
    upsertSummaryComment: async (_ref, body) => {
      calls.summaries.push(body);
      return "s1";
    },
    upsertComment: async (_ref, marker, body) => {
      calls.comments.push({ marker, body });
      return "w1";
    },
    updateDescription: async (_ref, transform) => {
      calls.descriptions.push(transform(options.description ?? ""));
    },
    setLabels: async (_ref, add, remove) => {
      calls.labels.push({ add, remove });
    },
    setCommitStatus: async (_ref, status) => {
      calls.statuses.push(status);
    },
  };
  return { publisher, calls };
}

describe("publishReview", () => {
  it("posts the summary byte for byte as toMarkdown renders it", async () => {
    const result = await sampleResult();
    const { publisher, calls } = recordingPublisher();

    const publication = await publishReview({
      publisher,
      changeSet: makeChangeSet(),
      result,
      config: config(),
      postedFingerprints: new Set(),
    });

    expect(calls.summaries).toEqual([toMarkdown(result, { walkthrough: false })]);
    expect(calls.inline).toHaveLength(2);
    expect(calls.statuses.map((s) => s.state)).toEqual(["failure"]);
    expect(publication).toMatchObject({ summaryCommentId: "s1", statusState: "failure", errors: [], inlineSkipped: 0 });
  });

  it("skips findings already on the forge or in the database", async () => {
    const result = await sampleResult();
    const [first, second] = result.findings.filter((f) => f.bucket === "actionable");
    const { publisher, calls } = recordingPublisher({ onForge: [first!.fingerprint] });

    const publication = await publishReview({
      publisher,
      changeSet: makeChangeSet(),
      result,
      config: config(),
      postedFingerprints: new Set([second!.fingerprint]),
    });

    expect(calls.inline).toEqual([]);
    expect(publication.inlineSkipped).toBe(2);
  });

  it("keeps publishing the summary and status when inline comments fail", async () => {
    const { publisher, calls } = recordingPublisher({ failInline: true });

    const publication = await publishReview({
      publisher,
      changeSet: makeChangeSet(),
      result: await sampleResult(),
      config: config(),
      postedFingerprints: new Set(),
    });

    expect(publication.errors).toEqual(["Inline comments failed: boom"]);
    expect(calls.summaries).toHaveLength(1);
    expect(calls.statuses).toHaveLength(1);
  });

  it("respects each output switch", async () => {
    const { publisher, calls } = recordingPublisher();

    await publishReview({
      publisher,
      changeSet: makeChangeSet(),
      result: await sampleResult(),
      config: config({ output: { postInline: false, postCheck: false } }),
      postedFingerprints: new Set(),
    });

    expect(calls.inline).toEqual([]);
    expect(calls.statuses).toEqual([]);
    expect(calls.summaries).toHaveLength(1);
  });
});

describe("walkthrough placement and labels", () => {
  async function publish(output: ConfigOverride["output"], description = "", forgeDescription = description) {
    const result = await sampleResult();
    const { publisher, calls } = recordingPublisher({ description: forgeDescription });
    const publication = await publishReview({
      publisher,
      changeSet: { ...makeChangeSet(), description },
      result,
      config: config({ output }),
      postedFingerprints: new Set(),
    });
    return { result, calls, publication };
  }

  it("fills an empty description and comments when the author wrote one (dynamic)", async () => {
    const empty = await publish({});
    expect(empty.calls.descriptions).toHaveLength(1);
    expect(empty.calls.descriptions[0]).toBe(withDescriptionBlock("", walkthroughMarkdown(empty.result)));
    expect(empty.calls.comments).toEqual([]);
    expect(empty.publication.walkthroughLocation).toBe("description");

    const written = await publish({}, "Fixes the login bug.");
    expect(written.calls.descriptions).toEqual([]);
    expect(written.calls.comments).toEqual([
      { marker: WALKTHROUGH_MARKER, body: `${walkthroughMarkdown(written.result)}\n${WALKTHROUGH_MARKER}\n` },
    ]);
    expect(written.publication.walkthroughLocation).toBe("comment");
  });

  it("keeps the author's text and replaces only Bammy's earlier block", async () => {
    const earlier = withDescriptionBlock("Fixes the login bug.", "## Bammy summary\n\nOld.");
    const { calls } = await publish({ summaryLocation: "description" }, "Fixes the login bug.", earlier);
    expect(calls.descriptions[0]).toMatch(/^Fixes the login bug\.\n\n<!-- bammy:walkthrough:start -->/);
    expect(calls.descriptions[0]).not.toContain("Old.");
    expect(calls.descriptions[0]!.match(/bammy:walkthrough:start/g)).toHaveLength(1);
  });

  it("posts a standalone comment when asked to", async () => {
    const { calls } = await publish({ summaryLocation: "comment" });
    expect(calls.descriptions).toEqual([]);
    expect(calls.comments).toHaveLength(1);
  });

  it("sets the estimate labels and takes off the family's other values", async () => {
    const { calls, publication } = await publish({ blastRadiusLabel: true, effortLabel: true });
    expect(calls.labels).toHaveLength(1);
    expect(calls.labels[0]!.add).toEqual(["Small blast radius", "1-5 Minutes"]);
    expect(calls.labels[0]!.remove).toContain("Large blast radius");
    expect(calls.labels[0]!.remove).toContain("10-20 Minutes");
    expect(calls.labels[0]!.remove).not.toContain("1-5 Minutes");
    expect(publication.labels).toEqual(["Small blast radius", "1-5 Minutes"]);

    const off = await publish({});
    expect(off.calls.labels).toEqual([]);
  });
});
