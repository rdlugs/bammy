import { describe, expect, it } from "vitest"
import { INHERIT, toForm, toSettings } from "./settingsForm"

describe("toSettings", () => {
  it("round-trips saved settings through the form", () => {
    const saved = {
      profile: "strict",
      llm: { model: "openai/gpt-5" },
      review: { blockOn: "major" },
      output: { walkthrough: false },
      triggers: { drafts: true },
      instructions: "Keep it lean",
    }
    expect(toSettings(saved, toForm(saved))).toEqual(saved)
  })

  it("removes inherited values and empty sections but keeps keys the form does not show", () => {
    const saved = { review: { blockOn: "major", maxFindings: 10 }, output: { walkthrough: true }, ignorePaths: ["gen/**"] }
    const form = { ...toForm(saved), blockOn: INHERIT, walkthrough: INHERIT }

    expect(toSettings(saved, form)).toEqual({ review: { maxFindings: 10 }, ignorePaths: ["gen/**"] })
  })

  it("turns choices into typed values and trims text", () => {
    const form = { ...toForm({}), postInline: "off", model: "  anthropic/claude-opus-5-5 ", instructions: "   " }

    expect(toSettings({}, form)).toEqual({ llm: { model: "anthropic/claude-opus-5-5" }, output: { postInline: false } })
  })
})
