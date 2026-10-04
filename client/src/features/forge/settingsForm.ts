import type { ConfigOverride } from "./api"

export const INHERIT = "__inherit"

export interface FormState {
  profile: string
  model: string
  severityFloor: string
  blockOn: string
  walkthrough: string
  postInline: string
  onPush: string
  drafts: string
  instructions: string
}

export function toForm(settings: ConfigOverride): FormState {
  const flag = (value: boolean | undefined) => (value === undefined ? INHERIT : value ? "on" : "off")
  return {
    profile: settings.profile ?? INHERIT,
    model: settings.llm?.model ?? "",
    severityFloor: settings.review?.severityFloor ?? INHERIT,
    blockOn: settings.review?.blockOn ?? INHERIT,
    walkthrough: flag(settings.output?.walkthrough),
    postInline: flag(settings.output?.postInline),
    onPush: flag(settings.triggers?.onPush),
    drafts: flag(settings.triggers?.drafts),
    instructions: settings.instructions ?? "",
  }
}

type Section = Record<string, unknown>

function setOrDelete(section: Section, key: string, value: unknown) {
  if (value === undefined) delete section[key]
  else section[key] = value
}

// Starts from what is saved so keys this form does not show (set through the
// API or a later version) survive a save; "inherit" removes a key.
export function toSettings(base: ConfigOverride, form: FormState): ConfigOverride {
  const next: ConfigOverride = structuredClone(base)
  const flag = (value: string) => (value === INHERIT ? undefined : value === "on")
  const pick = (value: string) => (value === INHERIT ? undefined : value)

  setOrDelete(next, "profile", pick(form.profile))
  setOrDelete(next, "instructions", form.instructions.trim() || undefined)
  const sections: [string, [string, unknown][]][] = [
    ["llm", [["model", form.model.trim() || undefined]]],
    ["review", [["severityFloor", pick(form.severityFloor)], ["blockOn", pick(form.blockOn)]]],
    ["output", [["walkthrough", flag(form.walkthrough)], ["postInline", flag(form.postInline)]]],
    ["triggers", [["onPush", flag(form.onPush)], ["drafts", flag(form.drafts)]]],
  ]
  for (const [name, fields] of sections) {
    const section: Section = { ...((next[name] as Section | undefined) ?? {}) }
    for (const [key, value] of fields) setOrDelete(section, key, value)
    setOrDelete(next, name, Object.keys(section).length ? section : undefined)
  }
  return next
}
