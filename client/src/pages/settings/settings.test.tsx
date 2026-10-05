import { describe, expect, it } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { App } from "@/App"
import { jsonResponse, renderWithProviders } from "@/test/renderWithProviders"
import { mockApi, testUser } from "@/test/apiRoutes"

const noKeys = {
  keys: [
    { provider: "anthropic", stored: false, last4: null, baseUrl: null, updatedAt: null, serverDefault: false },
    { provider: "openai", stored: false, last4: null, baseUrl: null, updatedAt: null, serverDefault: true },
    { provider: "google", stored: false, last4: null, baseUrl: null, updatedAt: null, serverDefault: false },
    { provider: "ollama", stored: false, last4: null, baseUrl: null, updatedAt: null, serverDefault: false },
  ],
}

const storedAnthropic = {
  provider: "anthropic",
  stored: true,
  last4: "1234",
  baseUrl: null,
  updatedAt: "2026-10-01T00:00:00.000Z",
  serverDefault: false,
}

function bodyOf(init?: RequestInit) {
  return JSON.parse(String(init?.body))
}

function calls(fetchSpy: ReturnType<typeof mockApi>, method: string, path: string) {
  return fetchSpy.mock.calls.filter(([url, init]) => String(url) === path && (init?.method ?? "GET") === method)
}

describe("Settings page", () => {
  it("is reachable from the user menu", async () => {
    mockApi({ "GET /api/reviews": { reviews: [], total: 0 } })
    renderWithProviders(<App />, { route: "/repositories" })

    await userEvent.click(await screen.findByRole("button", { name: new RegExp(testUser.name) }))
    await userEvent.click(await screen.findByRole("menuitem", { name: "Settings" }))

    expect(await screen.findByRole("heading", { name: "Settings" })).toBeInTheDocument()
    expect(screen.getByRole("tablist")).toHaveAttribute("aria-orientation", "vertical")
    expect(screen.getByRole("tab", { name: "Profile" })).toHaveAttribute("aria-selected", "true")
  })

  it("saves the profile and updates the signed-in user", async () => {
    const fetchSpy = mockApi({
      "PATCH /api/settings/profile": (init?: RequestInit) =>
        jsonResponse(200, { user: { ...testUser, ...bodyOf(init) } }),
    })
    renderWithProviders(<App />, { route: "/settings" })

    const name = await screen.findByLabelText("Name")
    await userEvent.clear(name)
    await userEvent.type(name, "Ada King")
    await userEvent.click(screen.getByRole("button", { name: "Save profile" }))

    expect(await screen.findByText("Profile updated")).toBeInTheDocument()
    expect(bodyOf(calls(fetchSpy, "PATCH", "/api/settings/profile")[0]![1])).toEqual({
      name: "Ada King",
      email: testUser.email,
    })
    expect(screen.getAllByText("Ada King").length).toBeGreaterThan(0)
  })

  it("shows server field errors on the profile form", async () => {
    mockApi({
      "PATCH /api/settings/profile": () =>
        jsonResponse(409, {
          message: "An account with this email already exists",
          errors: { email: ["An account with this email already exists"] },
        }),
    })
    renderWithProviders(<App />, { route: "/settings" })

    const email = await screen.findByLabelText("Email")
    await userEvent.clear(email)
    await userEvent.type(email, "taken@example.com")
    await userEvent.click(screen.getByRole("button", { name: "Save profile" }))

    expect(await screen.findByText("An account with this email already exists")).toBeInTheDocument()
  })

  it("reports a wrong current password", async () => {
    mockApi({
      "PUT /api/settings/password": () =>
        jsonResponse(400, { message: "Validation failed", errors: { currentPassword: ["Password is incorrect"] } }),
    })
    renderWithProviders(<App />, { route: "/settings?tab=password" })

    await userEvent.type(await screen.findByLabelText("Current password"), "wrong")
    await userEvent.type(screen.getByLabelText("New password"), "new-password")
    await userEvent.type(screen.getByLabelText("Confirm new password"), "new-password")
    await userEvent.click(screen.getByRole("button", { name: "Change password" }))

    expect(await screen.findByText("Password is incorrect")).toBeInTheDocument()
  })

  it("shows one add button and an empty state when no key is stored", async () => {
    mockApi({ "GET /api/settings/api-keys": noKeys })
    renderWithProviders(<App />, { route: "/settings?tab=api-keys" })

    expect(await screen.findByText("No API keys yet")).toBeInTheDocument()
    expect(screen.getByText(/reviews use the server's key for OpenAI/)).toBeInTheDocument()
    expect(screen.getAllByRole("button", { name: /add api key/i })).toHaveLength(1)
  })

  it("adds a key for the provider picked in the sheet", async () => {
    let keys: { keys: object[] } = noKeys
    const fetchSpy = mockApi({
      "GET /api/settings/api-keys": () => jsonResponse(200, keys),
      "PUT /api/settings/api-keys/anthropic": () => {
        keys = { keys: [storedAnthropic, ...noKeys.keys.slice(1)] }
        return jsonResponse(200, { key: storedAnthropic })
      },
    })
    renderWithProviders(<App />, { route: "/settings?tab=api-keys" })

    await userEvent.click(await screen.findByRole("button", { name: "Add API key" }))
    const sheet = await screen.findByRole("dialog")
    await userEvent.click(within(sheet).getByRole("combobox", { name: "Provider" }))
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
      "Anthropic",
      "OpenAI",
      "Google",
      "Ollama",
    ])
    await userEvent.click(screen.getByRole("option", { name: "Anthropic" }))
    await userEvent.type(within(sheet).getByLabelText("Anthropic API key"), "sk-ant-secret-1234")
    await userEvent.click(within(sheet).getByRole("button", { name: "Check and save" }))

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    expect(await screen.findByText("••••1234")).toBeInTheDocument()
    expect(bodyOf(calls(fetchSpy, "PUT", "/api/settings/api-keys/anthropic")[0]![1])).toEqual({
      apiKey: "sk-ant-secret-1234",
    })
  })

  it("adds a keyless Ollama connection with its default Docker host", async () => {
    const ollama = {
      provider: "ollama",
      stored: true,
      last4: null,
      baseUrl: "http://host.docker.internal:11434/v1",
      updatedAt: "2026-10-04T00:00:00.000Z",
      serverDefault: false,
    }
    const fetchSpy = mockApi({
      "GET /api/settings/api-keys": noKeys,
      "PUT /api/settings/api-keys/ollama": { key: ollama },
    })
    renderWithProviders(<App />, { route: "/settings?tab=api-keys" })

    await userEvent.click(await screen.findByRole("button", { name: "Add API key" }))
    const sheet = await screen.findByRole("dialog")
    await userEvent.click(within(sheet).getByRole("combobox", { name: "Provider" }))
    await userEvent.click(screen.getByRole("option", { name: "Ollama" }))

    expect(within(sheet).getByLabelText("API base URL")).toHaveValue("http://host.docker.internal:11434/v1")
    expect(within(sheet).getByLabelText("Ollama API key (optional)")).toHaveValue("")
    await userEvent.click(within(sheet).getByRole("button", { name: "Check and save" }))

    await waitFor(() => expect(calls(fetchSpy, "PUT", "/api/settings/api-keys/ollama")).toHaveLength(1))
    expect(bodyOf(calls(fetchSpy, "PUT", "/api/settings/api-keys/ollama")[0]![1])).toEqual({
      baseUrl: "http://host.docker.internal:11434/v1",
    })
  })

  it("sends a custom host with a cloud provider key", async () => {
    const fetchSpy = mockApi({
      "GET /api/settings/api-keys": noKeys,
      "PUT /api/settings/api-keys/anthropic": { key: storedAnthropic },
    })
    renderWithProviders(<App />, { route: "/settings?tab=api-keys" })

    await userEvent.click(await screen.findByRole("button", { name: "Add API key" }))
    const sheet = await screen.findByRole("dialog")
    await userEvent.click(within(sheet).getByRole("switch", { name: "Use custom host" }))
    await userEvent.type(within(sheet).getByLabelText("API base URL"), "https://anthropic.example/v1")
    await userEvent.type(within(sheet).getByLabelText("Anthropic API key"), "sk-ant-secret")
    await userEvent.click(within(sheet).getByRole("button", { name: "Check and save" }))

    await waitFor(() => expect(calls(fetchSpy, "PUT", "/api/settings/api-keys/anthropic")).toHaveLength(1))
    expect(bodyOf(calls(fetchSpy, "PUT", "/api/settings/api-keys/anthropic")[0]![1])).toEqual({
      apiKey: "sk-ant-secret",
      baseUrl: "https://anthropic.example/v1",
    })
  })

  it("keeps the sheet open and shows a failed connection on the field", async () => {
    mockApi({
      "GET /api/settings/api-keys": noKeys,
      "PUT /api/settings/api-keys/anthropic": () =>
        jsonResponse(400, { message: "Connection failed", errors: { apiKey: ["The API host rejected this key"] } }),
    })
    renderWithProviders(<App />, { route: "/settings?tab=api-keys" })

    await userEvent.click(await screen.findByRole("button", { name: "Add API key" }))
    const sheet = await screen.findByRole("dialog")
    await userEvent.type(within(sheet).getByLabelText("Anthropic API key"), "sk-ant-invalid")
    await userEvent.click(within(sheet).getByRole("button", { name: "Check and save" }))

    expect(await within(sheet).findByText("The API host rejected this key")).toBeInTheDocument()
    expect(sheet).toBeInTheDocument()
  })

  it("opens the stored provider and rechecks its status after replacement", async () => {
    const fetchSpy = mockApi({
      "GET /api/settings/api-keys": { keys: [storedAnthropic, ...noKeys.keys.slice(1)] },
      "GET /api/settings/api-keys/anthropic/status": { status: "active" },
      "PUT /api/settings/api-keys/anthropic": { key: storedAnthropic },
    })
    renderWithProviders(<App />, { route: "/settings?tab=api-keys" })

    expect(await screen.findByText("Active")).toBeInTheDocument()
    expect(calls(fetchSpy, "GET", "/api/settings/api-keys/anthropic/status")).toHaveLength(1)
    expect(calls(fetchSpy, "GET", "/api/settings/api-keys/openai/status")).toHaveLength(0)
    await userEvent.click(await screen.findByRole("button", { name: "Replace Anthropic connection" }))
    const sheet = await screen.findByRole("dialog")

    expect(within(sheet).getByRole("combobox", { name: "Provider" })).toHaveTextContent("Anthropic")
    expect(within(sheet).getByText(/A key ending in 1234 is stored/)).toBeInTheDocument()
    await userEvent.type(within(sheet).getByLabelText("Anthropic API key"), "sk-ant-replacement")
    await userEvent.click(within(sheet).getByRole("button", { name: "Check and replace" }))

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    await waitFor(() =>
      expect(calls(fetchSpy, "GET", "/api/settings/api-keys/anthropic/status")).toHaveLength(2),
    )
  })

  it("removes a stored key after confirming", async () => {
    const fetchSpy = mockApi({
      "GET /api/settings/api-keys": { keys: [storedAnthropic, ...noKeys.keys.slice(1)] },
      "DELETE /api/settings/api-keys/anthropic": () => jsonResponse(204),
    })
    renderWithProviders(<App />, { route: "/settings?tab=api-keys" })

    await userEvent.click(await screen.findByRole("button", { name: "Remove Anthropic key" }))
    expect(calls(fetchSpy, "DELETE", "/api/settings/api-keys/anthropic")).toHaveLength(0)
    await userEvent.click(screen.getByRole("button", { name: "Confirm remove Anthropic key" }))

    await waitFor(() => expect(calls(fetchSpy, "DELETE", "/api/settings/api-keys/anthropic")).toHaveLength(1))
  })

  it("deletes the account after confirming with the password", async () => {
    const fetchSpy = mockApi({ "DELETE /api/settings/account": () => jsonResponse(204) })
    renderWithProviders(<App />, { route: "/settings?tab=account" })

    await userEvent.click(await screen.findByRole("button", { name: "Delete account" }))
    const dialog = await screen.findByRole("dialog")
    await userEvent.type(within(dialog).getByLabelText("Password"), "secret")
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete permanently" }))

    expect(await screen.findByRole("button", { name: /log in/i })).toBeInTheDocument()
    expect(bodyOf(calls(fetchSpy, "DELETE", "/api/settings/account")[0]![1])).toEqual({ password: "secret" })
  })
})
