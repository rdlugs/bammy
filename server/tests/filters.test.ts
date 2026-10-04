import { describe, expect, it } from "vitest";
import { skipFilterReason } from "../src/review/config/filters.ts";
import { DEFAULT_CONFIG } from "../src/review/config/schema.ts";

const triggers = (t: Partial<typeof DEFAULT_CONFIG.triggers>) => ({ ...DEFAULT_CONFIG.triggers, ...t });
const change = { title: "Add login", author: "alice", labels: ["backend"], headRef: "feature/login", baseRef: "main" };

describe("skipFilterReason", () => {
  it("skips nothing with empty lists", () => {
    expect(skipFilterReason(DEFAULT_CONFIG.triggers, change)).toBeNull();
  });

  it("matches title phrases as substrings, ignoring case", () => {
    expect(skipFilterReason(triggers({ ignoreTitles: ["LOGIN"] }), change)).toMatch(/title contains "LOGIN"/);
    expect(skipFilterReason(triggers({ ignoreTitles: ["logout"] }), change)).toBeNull();
  });

  it("matches the author or whoever pushed by exact login", () => {
    expect(skipFilterReason(triggers({ skipAuthors: ["alice"] }), change)).toMatch(/alice/);
    expect(skipFilterReason(triggers({ skipAuthors: ["renovate[bot]"] }), change, "renovate[bot]")).toMatch(/renovate/);
    expect(skipFilterReason(triggers({ skipAuthors: ["ali"] }), change)).toBeNull();
  });

  it("matches labels exactly and case-sensitively", () => {
    expect(skipFilterReason(triggers({ skipLabels: ["backend"] }), change)).toMatch(/label "backend"/);
    expect(skipFilterReason(triggers({ skipLabels: ["Backend"] }), change)).toBeNull();
    expect(skipFilterReason(triggers({ skipLabels: ["back"] }), change)).toBeNull();
  });

  it("matches branch names on a substring", () => {
    expect(skipFilterReason(triggers({ skipSourceBranches: ["feature/"] }), change)).toMatch(/source branch/);
    expect(skipFilterReason(triggers({ skipTargetBranches: ["mai"] }), change)).toMatch(/target branch/);
    expect(skipFilterReason(triggers({ skipTargetBranches: ["release"] }), change)).toBeNull();
  });
});
