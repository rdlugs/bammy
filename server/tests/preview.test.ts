import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../src/app.ts";
import { prisma } from "../src/lib/prisma.ts";
import { resolveConfig } from "../src/review/config/resolve.ts";
import type { ConfigOverride } from "../src/review/config/schema.ts";
import { runReview } from "../src/review/pipeline.ts";
import { previewPublication } from "../src/review/preview/preview.ts";
import { SAMPLE_NOW, sampleChange, sampleGenerate } from "../src/review/preview/sample.ts";
import { walkthroughLocation } from "../src/review/publish/publisher.ts";
import { toMarkdown } from "../src/review/render/markdown.ts";
import { createUser } from "./helpers/users.ts";

const config = (override: ConfigOverride = {}) => resolveConfig({ trigger: override }).config;

describe("previewPublication", () => {
  it("posts exactly what the publisher would for the sample review", async () => {
    const preview = await previewPublication(config(), "github");
    const result = await runReview(
      { changeSet: sampleChange("github"), config: config() },
      { generate: sampleGenerate, now: () => SAMPLE_NOW },
    );

    expect(preview.summaryComment).toBe(toMarkdown(result, { walkthrough: false }));
    // The SQL injection is critical, the default block level.
    expect(preview.status).toEqual({ state: "failure", description: "1 finding at or above critical" });
    // The unproven rate-limit finding is demoted, not dropped, so it still gets a thread.
    expect(preview.inline.map((c) => c.startLine)).toEqual([9, 10, 7]);
    expect(preview.inline[0]!.diff.at(-1)).toMatchObject({ type: "add", newLine: 9 });
  });

  it("puts the summary in the sample's empty description, or in a comment", async () => {
    const dynamic = await previewPublication(config(), "github");
    expect(dynamic.pr.description).toContain("<!-- bammy:walkthrough:start -->");
    expect(dynamic.pr.description).toContain("Blast radius: medium");
    expect(dynamic.walkthroughComment).toBeNull();

    const comment = await previewPublication(config({ output: { summaryLocation: "comment" } }), "github");
    expect(comment.pr.description).toBe("");
    expect(comment.walkthroughComment).toContain("## Bammy summary");

    const none = await previewPublication(config({ output: { walkthrough: false, effortLabel: true } }), "github");
    expect(none.pr.description).toBe("");
    expect(none.walkthroughComment).toBeNull();
    expect(none.pr.labels).toEqual([]);
  });

  it("follows each output switch and the finding settings", async () => {
    const off = await previewPublication(
      config({ output: { postInline: false, postSummary: false, postCheck: false } }),
      "github",
    );
    expect(off).toMatchObject({ summaryComment: null, status: null, inline: [] });

    const labelled = await previewPublication(config({ output: { blastRadiusLabel: true, effortLabel: true } }), "gitlab");
    expect(labelled.pr.labels).toEqual(["Medium blast radius", "5-10 Minutes"]);

    const strict = await previewPublication(config({ review: { blockOn: "major", severityFloor: "major" } }), "github");
    expect(strict.status?.description).toBe("2 findings at or above major");
    expect(strict.summaryComment).not.toContain("rate limit");
  });

  it("uses each forge's suggestion syntax", async () => {
    const [github] = (await previewPublication(config(), "github")).inline;
    const [gitlab] = (await previewPublication(config(), "gitlab")).inline;
    expect(github!.body).toContain("```suggestion\n");
    expect(gitlab!.body).toContain("```suggestion:-0+0\n");
  });
});

describe("walkthroughLocation", () => {
  it("resolves dynamic from the description and keeps an explicit choice", () => {
    const change = sampleChange("github");
    expect(walkthroughLocation(config(), change)).toBe("description");
    expect(walkthroughLocation(config(), { ...change, description: "Fixes login." })).toBe("comment");
    expect(walkthroughLocation(config({ output: { summaryLocation: "description" } }), { ...change, description: "x" })).toBe(
      "description",
    );
  });
});

describe("POST /api/config/preview", () => {
  let cookie: string;

  beforeEach(async () => {
    await prisma.user.deleteMany();
    ({ cookie } = await createUser());
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("requires a session", async () => {
    const res = await request(app).post("/api/config/preview").send({ provider: "github", base: {}, settings: {} });
    expect(res.status).toBe(401);
  });

  it("layers the form's settings over what it inherits", async () => {
    const res = await request(app)
      .post("/api/config/preview")
      .set("Cookie", cookie)
      .send({ provider: "gitlab", base: { output: { postCheck: false } }, settings: { output: { postInline: false } } });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ provider: "gitlab", status: null, inline: [], pr: { number: 42 } });
    expect(res.body.summaryComment).toContain("## Bammy review");
  });

  it("rejects settings the config would reject", async () => {
    const res = await request(app)
      .post("/api/config/preview")
      .set("Cookie", cookie)
      .send({ provider: "github", base: {}, settings: { review: { maxFindings: 0 } } });
    expect(res.status).toBe(400);
  });
});
