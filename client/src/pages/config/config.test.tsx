import { describe, expect, it } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { App } from "@/App"
import { jsonResponse, renderWithProviders } from "@/test/renderWithProviders"
import { mockApi } from "@/test/apiRoutes"

const effective = {
  profile: "balanced",
  llm: {
    model: "anthropic/claude-sonnet-5-5",
    fallbackModels: [],
    temperature: 0.2,
    maxTokens: 8000,
    contextBudget: null,
    baseUrl: null,
    endpointKey: null,
  },
  review: {
    categories: ["security", "bug"],
    severityFloor: "minor",
    blockOn: "critical",
    maxFindings: 25,
    maxChunks: 12,
    minConfidence: 0.5,
    requireEvidence: true,
    fullFile: false,
    committableSuggestions: true,
  },
  output: { walkthrough: true, postInline: true, postSummary: true, postCheck: true },
  triggers: { onPush: true, drafts: false, command: true },
  ignorePaths: ["**/*.lock"],
  instructions: "",
  languageInstructions: {},
}

const globalConfig = (settings: Record<string, unknown> = {}, sources: Record<string, string> = {}) => ({
  settings,
  warnings: [],
  config: effective,
  sources: { profile: "default", "llm.model": "default", "review.blockOn": "default", ...sources },
})

const schema = {
  defaults: effective,
  profiles: { balanced: {}, strict: { review: { blockOn: "major" } } },
  severities: ["critical", "major", "minor"],
  categories: ["security", "bug", "style"],
}

const repo = (id: string, fullPath: string, extra: Record<string, unknown> = {}) => ({
  id,
  connectionId: "c1",
  account: { login: "dev", provider: "gitlab", host: "gitlab.com" },
  externalId: id,
  fullPath,
  defaultBranch: "main",
  webUrl: `https://gitlab.com/${fullPath}`,
  enabled: true,
  settings: {},
  followGlobal: true,
  ...extra,
})

async function chooseScope(name: string | RegExp) {
  await userEvent.click(await screen.findByRole("combobox", { name: "Scope" }))
  await userEvent.click(await screen.findByRole("option", { name }))
}

async function openTab(name: string) {
  await userEvent.click(await screen.findByRole("tab", { name: new RegExp(`^${name}`) }))
}

const GLOBAL_SCOPE = /The global config applies to every repository/
const globalRoutes = (extra: Record<string, unknown> = {}) => ({
  "GET /api/config/global": globalConfig(),
  "GET /api/config/schema": schema,
  "GET /api/repos": { repos: [] },
  "GET /api/settings/api-keys": {
    keys: [
      { provider: "anthropic", stored: false, last4: null, updatedAt: null, serverDefault: true },
      { provider: "openai", stored: true, last4: "9rtr", updatedAt: "2026-10-04T00:00:00Z", serverDefault: false },
      { provider: "google", stored: false, last4: null, updatedAt: null, serverDefault: false },
    ],
  },
  ...extra,
})

describe("Configuration page", () => {
  it("is linked from the sidebar", async () => {
    mockApi(globalRoutes())
    renderWithProviders(<App />, { route: "/dashboard" })

    await userEvent.click(await screen.findByRole("link", { name: "Configuration" }))

    expect(await screen.findByText(GLOBAL_SCOPE)).toBeInTheDocument()
    expect(await screen.findByRole("tab", { name: "LLM Config", selected: true })).toBeInTheDocument()
  })

  it("splits the settings into tabs and keeps the open tab in the URL", async () => {
    mockApi(globalRoutes())
    renderWithProviders(<App />, { route: "/configuration?tab=files" })

    expect(await screen.findByRole("tab", { name: "Files", selected: true })).toBeInTheDocument()
    expect(screen.getByLabelText("Ignore paths")).toBeInTheDocument()
    expect(screen.queryByLabelText("Model")).not.toBeInTheDocument()
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "LLM Config",
      "Finding Types",
      "Files",
      "Display",
      "Triggers",
      "Guidance",
    ])

    await openTab("Triggers")
    expect(screen.getByRole("switch", { name: "Allow review command" })).toBeInTheDocument()
    expect(screen.queryByLabelText("Ignore paths")).not.toBeInTheDocument()
  })

  it("saves the global config and shows where effective values come from", async () => {
    let body: unknown
    mockApi(
      globalRoutes({
        "PUT /api/config/global": (init?: RequestInit) => {
          body = JSON.parse(String(init?.body))
          return jsonResponse(200, globalConfig({ llm: { model: "openai/gpt-5" } }, { "llm.model": "global" }))
        },
      }),
    )
    renderWithProviders(<App />, { route: "/configuration" })

    expect(await screen.findByText("Effective: anthropic/claude-sonnet-5-5 (from default)")).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText("Model"), "openai/gpt-5")
    await userEvent.click(screen.getByRole("button", { name: "Save global config" }))

    await waitFor(() => expect(body).toEqual({ settings: { llm: { model: "openai/gpt-5" } } }))
    expect(await screen.findByText("Global config saved")).toBeInTheDocument()
  })

  it("shows real values instead of inherit in the global config and only saves changes", async () => {
    let body: unknown
    mockApi(
      globalRoutes({
        "PUT /api/config/global": (init?: RequestInit) => {
          body = JSON.parse(String(init?.body))
          return jsonResponse(200, globalConfig((body as { settings: Record<string, unknown> }).settings))
        },
      }),
    )
    renderWithProviders(<App />, { route: "/configuration" })

    const save = await screen.findByRole("button", { name: "Save global config" })
    // Picking the value the defaults already give is not a change.
    const profile = screen.getByRole("combobox", { name: "Profile" })
    await waitFor(() => expect(profile).toHaveTextContent("balanced"))
    await userEvent.click(profile)
    await userEvent.click(screen.getByRole("option", { name: "balanced" }))
    expect(save).toBeDisabled()

    // A profile's preset shows through on the other tabs without being pinned.
    await userEvent.click(profile)
    await userEvent.click(screen.getByRole("option", { name: "strict" }))
    await openTab("Finding Types")
    const blockOn = screen.getByRole("combobox", { name: "Block at or above" })
    expect(blockOn).toHaveTextContent("major")
    await userEvent.click(blockOn)
    expect(screen.queryByRole("option", { name: /Inherit/ })).not.toBeInTheDocument()
    await userEvent.keyboard("{Escape}")

    await openTab("Display")
    const walkthrough = screen.getByRole("switch", { name: "Walkthrough" })
    expect(walkthrough).toBeChecked()
    await userEvent.click(walkthrough)
    expect(walkthrough).not.toBeChecked()
    expect(screen.queryByText("Overridden")).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /to inherited/ })).not.toBeInTheDocument()
    // Edits from every tab go out in one save.
    await userEvent.click(screen.getByRole("button", { name: "Save global config" }))

    await waitFor(() => expect(body).toEqual({ settings: { profile: "strict", output: { walkthrough: false } } }))
  })

  it("edits every kind of setting in the global config", async () => {
    let body: unknown
    mockApi(
      globalRoutes({
        "PUT /api/config/global": (init?: RequestInit) => {
          body = JSON.parse(String(init?.body))
          return jsonResponse(200, globalConfig((body as { settings: Record<string, unknown> }).settings))
        },
      }),
    )
    renderWithProviders(<App />, { route: "/configuration" })

    await userEvent.type(await screen.findByLabelText("Context budget"), "auto")
    await userEvent.click(screen.getByRole("button", { name: "Add fallback model" }))
    await userEvent.type(screen.getByLabelText("Fallback model 1"), "openai/gpt-5")
    await userEvent.type(screen.getByLabelText("Base URL"), "http://host.docker.internal:20128/v1")
    await userEvent.click(screen.getByRole("combobox", { name: "API key" }))
    // Only slots that hold a key are offered.
    expect(screen.getByRole("option", { name: "Anthropic key (server)" })).toBeInTheDocument()
    expect(screen.queryByRole("option", { name: /Google/ })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole("option", { name: "OpenAI key ending in 9rtr" }))

    await openTab("Finding Types")
    expect(screen.getByRole("checkbox", { name: "security" })).toBeChecked()
    expect(screen.getByRole("checkbox", { name: "style" })).not.toBeChecked()
    await userEvent.type(screen.getByLabelText("Max findings"), "10")
    await userEvent.click(screen.getByRole("checkbox", { name: "bug" }))
    await userEvent.click(screen.getByRole("checkbox", { name: "style" }))

    await openTab("Files")
    await userEvent.type(screen.getByLabelText("Ignore paths"), "gen/**{enter}docs/**")

    await openTab("Guidance")
    await userEvent.click(screen.getByRole("button", { name: "Add language" }))
    await userEvent.type(screen.getByLabelText("Language 1"), "Go")
    await userEvent.type(screen.getByLabelText("Guidance for language 1"), "Wrap errors")
    await userEvent.click(screen.getByRole("button", { name: "Save global config" }))

    await waitFor(() =>
      expect(body).toEqual({
        settings: {
          // "auto" is already the default context budget, so it is not pinned.
          llm: {
            fallbackModels: ["openai/gpt-5"],
            baseUrl: "http://host.docker.internal:20128/v1",
            endpointKey: "openai",
          },
          review: { categories: ["security", "style"], maxFindings: 10 },
          ignorePaths: ["gen/**", "docs/**"],
          languageInstructions: { Go: "Wrap errors" },
        },
      }),
    )
  })

  it("holds back a save while a value is out of range and marks the tab", async () => {
    mockApi(globalRoutes())
    renderWithProviders(<App />, { route: "/configuration?tab=files" })

    await userEvent.type(await screen.findByLabelText("Max chunks"), "500")

    expect(screen.getByText("Must be between 1 and 50")).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: "Files, has errors" })).toBeInTheDocument()
    // Still held back from a tab without the error.
    await openTab("Display")
    expect(screen.getByRole("button", { name: "Save global config" })).toBeDisabled()

    await openTab("Files")
    await userEvent.clear(screen.getByLabelText("Max chunks"))
    await userEvent.type(screen.getByLabelText("Max chunks"), "20")
    expect(screen.getByRole("tab", { name: "Files" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Save global config" })).toBeEnabled()
  })

  it("previews what the display settings post, unsaved edits included", async () => {
    mockApi(globalRoutes())
    renderWithProviders(<App />, { route: "/configuration?tab=display" })

    const preview = await screen.findByRole("region", { name: "Review preview" })
    // The sample's major finding is below the default critical block level.
    expect(await within(preview).findByRole("region", { name: "Commit status" })).toHaveTextContent("Pass")
    expect(within(preview).getByRole("group", { name: "Walkthrough" })).toBeInTheDocument()
    expect(within(preview).getByText("Suggested change")).toBeInTheDocument()
    // The settings and the preview are separate cards.
    expect(within(preview).queryByRole("switch")).not.toBeInTheDocument()
    expect(screen.getByRole("switch", { name: "Walkthrough" }).closest("[data-slot=card]")).not.toBe(
      preview.closest("[data-slot=card]"),
    )

    await userEvent.click(screen.getByRole("switch", { name: "Walkthrough" }))
    expect(within(preview).queryByRole("group", { name: "Walkthrough" })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole("switch", { name: "Post inline comments" }))
    expect(within(preview).queryByRole("region", { name: "Inline comment" })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole("switch", { name: "Post summary comment" }))
    await userEvent.click(screen.getByRole("switch", { name: "Post commit status" }))
    expect(within(preview).getByText(/Bammy posts nothing to the change/)).toBeInTheDocument()
  })

  it("previews a blocked review and plain suggestions from the finding settings", async () => {
    mockApi(globalRoutes())
    renderWithProviders(<App />, { route: "/configuration?tab=findings" })

    await userEvent.click(await screen.findByRole("combobox", { name: "Block at or above" }))
    await userEvent.click(screen.getByRole("option", { name: "major" }))
    await userEvent.click(screen.getByRole("switch", { name: "Committable suggestions" }))
    await openTab("Display")

    const preview = screen.getByRole("region", { name: "Review preview" })
    expect(within(preview).getByRole("region", { name: "Commit status" })).toHaveTextContent(
      "Blocked: 1 finding at or above major",
    )
    expect(within(preview).queryByText("Suggested change")).not.toBeInTheDocument()
  })

  it("resets the global config with an empty object", async () => {
    let body: unknown
    mockApi(
      globalRoutes({
        "GET /api/config/global": globalConfig({ profile: "strict" }, { profile: "global" }),
        "PUT /api/config/global": (init?: RequestInit) => {
          body = JSON.parse(String(init?.body))
          return jsonResponse(200, globalConfig())
        },
      }),
    )
    renderWithProviders(<App />, { route: "/configuration" })

    await userEvent.click(await screen.findByRole("button", { name: "Reset to defaults" }))

    await waitFor(() => expect(body).toEqual({ settings: {} }))
  })

  it("switches between the global config and a repository on the same tab", async () => {
    mockApi(
      globalRoutes({
        "GET /api/repos": { repos: [repo("r2", "team/api"), repo("r1", "team/web")] },
        "GET /api/repos/r1/config": { ref: "main", repoFile: null, warnings: [], config: effective, sources: {} },
      }),
    )
    renderWithProviders(<App />, { route: "/configuration" })

    expect(await screen.findByText(GLOBAL_SCOPE)).toBeInTheDocument()
    await openTab("Files")
    await chooseScope(/team\/web/)

    expect(await screen.findByRole("switch", { name: "Follow global config for team/web" })).toBeInTheDocument()
    expect(screen.queryByText(GLOBAL_SCOPE)).not.toBeInTheDocument()
    expect(screen.getByRole("tab", { name: "Files", selected: true })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Save settings" })).toBeInTheDocument()

    await chooseScope("All repositories")
    expect(await screen.findByText(GLOBAL_SCOPE)).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: "Files", selected: true })).toBeInTheDocument()
  })

  it("searches the scope list once there are many repositories", async () => {
    const names = ["api", "cli", "docs", "infra", "mobile", "web", "worker"]
    mockApi(
      globalRoutes({
        "GET /api/repos": { repos: names.map((name) => repo(name, `team/${name}`)) },
        "GET /api/repos/web/config": { ref: "main", repoFile: null, warnings: [], config: effective, sources: {} },
      }),
    )
    renderWithProviders(<App />, { route: "/configuration" })

    await userEvent.click(await screen.findByRole("combobox", { name: "Scope" }))
    await userEvent.type(screen.getByPlaceholderText("Search repositories..."), "web")

    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual(["team/webdev"])
    await userEvent.keyboard("{Enter}")

    expect(await screen.findByRole("switch", { name: "Follow global config for team/web" })).toBeInTheDocument()
  })

  it("opens a repository from a ?repo= link and toggles whether it follows the global config", async () => {
    let following = true
    let patched: unknown
    mockApi(
      globalRoutes({
        "GET /api/repos": () => jsonResponse(200, { repos: [repo("r1", "team/web", { followGlobal: following })] }),
        "GET /api/repos/r1/config": { ref: "main", repoFile: null, warnings: [], config: effective, sources: {} },
        "PATCH /api/repos/r1": (init?: RequestInit) => {
          patched = JSON.parse(String(init?.body))
          following = false
          return jsonResponse(200, { repo: repo("r1", "team/web", { followGlobal: false }) })
        },
      }),
    )
    renderWithProviders(<App />, { route: "/configuration?repo=r1&tab=display" })

    const toggle = await screen.findByRole("switch", { name: "Follow global config for team/web" })
    expect(toggle).toBeChecked()
    expect(screen.getByRole("switch", { name: "Post inline comments" })).toBeDisabled()
    await userEvent.click(toggle)

    await waitFor(() => expect(patched).toEqual({ followGlobal: false }))
    await waitFor(() => expect(toggle).not.toBeChecked())
    expect(screen.getByRole("switch", { name: "Post inline comments" })).toBeEnabled()
  })

  it("locks a following repository's overrides and saves them once it stops following", async () => {
    let following = true
    let patched: unknown
    mockApi(
      globalRoutes({
        "GET /api/repos": () => jsonResponse(200, { repos: [repo("r1", "team/web", { followGlobal: following })] }),
        "GET /api/repos/r1/config": {
          ref: "main",
          repoFile: null,
          warnings: [],
          config: effective,
          sources: { "review.blockOn": "global" },
        },
        "PATCH /api/repos/r1": (init?: RequestInit) => {
          const body = JSON.parse(String(init?.body))
          if ("followGlobal" in body) following = body.followGlobal
          else patched = body
          return jsonResponse(200, { repo: repo("r1", "team/web", { followGlobal: following }) })
        },
      }),
    )
    renderWithProviders(<App />, { route: "/configuration" })

    await chooseScope(/team\/web/)
    await openTab("Finding Types")
    expect(await screen.findByText("Effective: critical (from global config)")).toBeInTheDocument()
    await openTab("LLM Config")
    expect(screen.getByLabelText("Model")).toBeDisabled()
    expect(screen.getByRole("button", { name: "Save settings" })).toBeDisabled()

    await userEvent.click(screen.getByRole("switch", { name: "Follow global config for team/web" }))
    await waitFor(() => expect(screen.getByLabelText("Model")).toBeEnabled())
    await userEvent.type(screen.getByLabelText("Model"), "openai/gpt-5")
    await userEvent.click(screen.getByRole("button", { name: "Save settings" }))

    await waitFor(() => expect(patched).toEqual({ settings: { llm: { model: "openai/gpt-5" } } }))
  })

  it("explains inherit in a repository and resets a saved override to the global value", async () => {
    mockApi(
      globalRoutes({
        "GET /api/config/global": globalConfig({}, { "review.blockOn": "global" }),
        "GET /api/repos": {
          repos: [repo("r1", "team/web", { followGlobal: false, settings: { output: { walkthrough: false } } })],
        },
        "GET /api/repos/r1/config": {
          ref: "main",
          repoFile: null,
          warnings: [],
          config: { ...effective, output: { ...effective.output, walkthrough: false } },
          sources: { "output.walkthrough": "repoSettings" },
        },
      }),
    )
    renderWithProviders(<App />, { route: "/configuration?repo=r1&tab=findings" })

    expect(await screen.findByText(/keeps following it when the global config changes/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole("combobox", { name: "Block at or above" }))
    expect(screen.getByRole("option", { name: /^Inherit\s*critical \(from global config\)$/ })).toBeInTheDocument()
    await userEvent.keyboard("{Escape}")

    await openTab("Display")
    const walkthrough = screen.getByRole("switch", { name: "Walkthrough" })
    expect(walkthrough).not.toBeChecked()
    expect(screen.getByText("Overridden")).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "Reset Walkthrough to inherited" }))

    // Back to what the global config gives, not the saved override.
    expect(walkthrough).toBeChecked()
    expect(screen.getByRole("button", { name: "Save settings" })).toBeEnabled()
  })
})
