import { describe, expect, it, vi } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { App } from "@/App"
import { jsonResponse, renderWithProviders } from "@/test/renderWithProviders"
import { mockApi } from "@/test/apiRoutes"
import { PROVIDER_IDS, PROVIDERS } from "@/features/forge/providers"

const gitlabConnection = {
  id: "c1",
  provider: "gitlab",
  host: "gitlab.com",
  kind: "token",
  accountLogin: "dev",
  createdAt: "2026-03-14T12:00:00.000Z",
}

async function openAddConnection() {
  await userEvent.click(await screen.findByRole("button", { name: "Add connection" }))
}

async function chooseProvider(label: string) {
  await userEvent.click(screen.getByRole("combobox", { name: "Provider" }))
  await userEvent.click(screen.getByRole("option", { name: label }))
}

describe("Connections page", () => {
  it("offers one Add connection button when nothing is connected", async () => {
    mockApi({ "GET /api/connections": { connections: [], availableApps: ["github"] } })
    renderWithProviders(<App />, { route: "/connections" })

    expect(await screen.findByText("No connections yet")).toBeInTheDocument()
    await openAddConnection()

    expect(screen.getByRole("combobox", { name: "Provider" })).toHaveTextContent("GitHub")
    expect(screen.getByRole("checkbox", { name: "Self-hosted" })).not.toBeChecked()
    expect(screen.getByRole("link", { name: "Install GitHub App" })).toHaveAttribute(
      "href",
      "/api/connections/github/install",
    )
  })

  it("offers every registered provider and its self-hosted option", async () => {
    mockApi({ "GET /api/connections": { connections: [], availableApps: ["github"] } })
    renderWithProviders(<App />, { route: "/connections" })

    await openAddConnection()

    await userEvent.click(screen.getByRole("combobox", { name: "Provider" }))
    const options = screen.getAllByRole("option")
    expect(options.map((option) => option.textContent)).toEqual(PROVIDER_IDS.map((id) => PROVIDERS[id].label))
    await userEvent.keyboard("{Escape}")

    for (const id of PROVIDER_IDS) {
      await chooseProvider(PROVIDERS[id].label)
      const checkbox = screen.queryByRole("checkbox", { name: "Self-hosted" })
      expect(Boolean(checkbox)).toBe(Boolean(PROVIDERS[id].hosting.selfHosted))
    }
  })

  it("validates the GitLab form before calling the API", async () => {
    const fetchSpy = mockApi({ "GET /api/connections": { connections: [], availableApps: [] } })
    renderWithProviders(<App />, { route: "/connections" })

    await openAddConnection()
    expect(screen.getByText("The GitHub App is not configured on this server.")).toBeInTheDocument()
    await chooseProvider("GitLab")
    expect(screen.queryByLabelText("Host")).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "Connect GitLab" }))

    expect(await screen.findByText("Token is required")).toBeInTheDocument()
    expect(fetchSpy.mock.calls.some(([url]) => String(url).endsWith("/connections/gitlab"))).toBe(false)
  })

  it("asks self-hosted GitLab for a host and shows a field error from the server", async () => {
    mockApi({
      "GET /api/connections": { connections: [], availableApps: ["github"] },
      "POST /api/connections/gitlab": () =>
        jsonResponse(400, { message: "Validation failed", errors: { host: ["Enter a host such as gitlab.com"] } }),
    })
    renderWithProviders(<App />, { route: "/connections" })

    await openAddConnection()
    await chooseProvider("GitLab")
    await userEvent.click(screen.getByRole("checkbox", { name: "Self-hosted" }))
    await userEvent.click(screen.getByRole("button", { name: "Connect GitLab" }))
    expect(await screen.findByText("Host is required")).toBeInTheDocument()

    await userEvent.type(screen.getByLabelText("Host"), "gitlab.acme.com/group")
    await userEvent.type(screen.getByLabelText("Access token"), "glpat-x")
    await userEvent.click(screen.getByRole("button", { name: "Connect GitLab" }))

    expect(await screen.findByText("Enter a host such as gitlab.com")).toBeInTheDocument()
  })

  it("connects self-hosted GitHub with a host and token", async () => {
    let body: unknown
    mockApi({
      "GET /api/connections": { connections: [], availableApps: ["github"] },
      "POST /api/connections/github": (init?: RequestInit) => {
        body = JSON.parse(String(init?.body))
        return jsonResponse(201, {
          connection: { id: "c2", provider: "github", host: "ghe.acme.com", kind: "token", accountLogin: "dev", createdAt: "" },
        })
      },
    })
    renderWithProviders(<App />, { route: "/connections" })

    await openAddConnection()
    await userEvent.click(screen.getByRole("checkbox", { name: "Self-hosted" }))
    await userEvent.type(screen.getByLabelText("Host"), "ghe.acme.com")
    await userEvent.type(screen.getByLabelText("Access token"), "ghp_x")
    await userEvent.click(screen.getByRole("button", { name: "Connect GitHub" }))

    await waitFor(() => expect(body).toEqual({ host: "ghe.acme.com", token: "ghp_x" }))
  })

  it("shows whether each connection is active and when it was created", async () => {
    mockApi({
      "GET /api/connections": {
        connections: [gitlabConnection, { ...gitlabConnection, id: "c2", accountLogin: "old" }],
        availableApps: [],
      },
      "GET /api/connections/c1/status": { status: "active" },
      "GET /api/connections/c2/status": { status: "revoked" },
    })
    renderWithProviders(<App />, { route: "/connections" })

    // By title, since the "Active" column header shares the badge's text.
    const active = await screen.findByTitle("The forge accepts the stored credentials")
    expect(active).toHaveTextContent("Active")
    expect(active).toHaveClass("text-emerald-700")
    const inactive = await screen.findByTitle(/rejected the stored credentials/)
    expect(inactive).toHaveTextContent("Inactive")
    expect(inactive).toHaveClass("text-destructive")
    const created = new Date(gitlabConnection.createdAt).toLocaleDateString(undefined, { dateStyle: "medium" })
    expect(screen.getAllByText(created)).toHaveLength(2)
  })

  it("sorts the table by the clicked column", async () => {
    mockApi({
      "GET /api/connections": {
        connections: [
          { ...gitlabConnection, id: "c1", accountLogin: "bravo", createdAt: "2026-01-01T00:00:00.000Z" },
          { ...gitlabConnection, id: "c2", accountLogin: "alpha", createdAt: "2026-02-01T00:00:00.000Z" },
          { ...gitlabConnection, id: "c3", accountLogin: "charlie", createdAt: "2026-03-01T00:00:00.000Z" },
        ],
        availableApps: [],
      },
      "GET /api/connections/c1/status": { status: "active" },
      "GET /api/connections/c2/status": { status: "active" },
      "GET /api/connections/c3/status": { status: "active" },
    })
    renderWithProviders(<App />, { route: "/connections" })
    const accounts = () => screen.getAllByRole("row").slice(1).map((row) => row.querySelector("td")?.textContent)

    await screen.findByText("alpha")
    // Unsorted keeps the API order.
    expect(accounts()).toEqual(["bravo", "alpha", "charlie"])

    await userEvent.click(screen.getByRole("button", { name: "Account" }))
    expect(accounts()).toEqual(["alpha", "bravo", "charlie"])
    expect(screen.getByRole("columnheader", { name: "Account" })).toHaveAttribute("aria-sort", "ascending")

    await userEvent.click(screen.getByRole("button", { name: "Account" }))
    expect(accounts()).toEqual(["charlie", "bravo", "alpha"])

    // A third click removes the sort.
    await userEvent.click(screen.getByRole("button", { name: "Account" }))
    expect(accounts()).toEqual(["bravo", "alpha", "charlie"])
    expect(screen.getByRole("columnheader", { name: "Account" })).not.toHaveAttribute("aria-sort")
  })

  it("shows a connection's details in a sheet", async () => {
    let statusChecks = 0
    mockApi({
      "GET /api/connections": { connections: [gitlabConnection], availableApps: [] },
      "GET /api/connections/c1/status": () => {
        statusChecks++
        return jsonResponse(200, { status: "active" })
      },
      "GET /api/connections/c1": {
        connection: { ...gitlabConnection, installationId: null, updatedAt: "2026-03-15T12:00:00.000Z" },
        repositories: [
          {
            id: "r1",
            fullPath: "acme/api",
            defaultBranch: "main",
            webUrl: "https://gitlab.com/acme/api",
            webhook: { active: true },
          },
        ],
        reviews: {
          total: 1,
          recent: [
            {
              id: "j1",
              number: 7,
              status: "completed",
              verdict: "pass",
              createdAt: "2026-03-15T12:00:00.000Z",
              repository: { fullPath: "acme/api", provider: "gitlab" },
            },
          ],
        },
      },
    })
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true })
    renderWithProviders(<App />, { route: "/connections" })

    await userEvent.click(await screen.findByRole("button", { name: "Details" }))
    const sheet = await screen.findByRole("dialog")

    expect(await within(sheet).findByRole("link", { name: /acme\/api$/ })).toHaveAttribute(
      "href",
      "https://gitlab.com/acme/api",
    )
    expect(within(sheet).getByText("Webhook active")).toBeInTheDocument()
    expect(within(sheet).getByRole("link", { name: /acme\/api !7/ })).toHaveAttribute("href", "/reviews/j1")
    expect(within(sheet).getByText("gitlab.com")).toBeInTheDocument()

    await userEvent.click(within(sheet).getByRole("button", { name: "Copy connection id" }))
    expect(writeText).toHaveBeenCalledWith("c1")

    const checksBefore = statusChecks
    await userEvent.click(within(sheet).getByRole("button", { name: "Check again" }))
    await waitFor(() => expect(statusChecks).toBe(checksBefore + 1))
  })

  it("asks for confirmation before removing a connection", async () => {
    let deleted = false
    mockApi({
      "GET /api/connections": () => jsonResponse(200, { connections: deleted ? [] : [gitlabConnection], availableApps: ["github"] }),
      "GET /api/connections/c1/status": { status: "active" },
      "DELETE /api/connections/c1": () => {
        deleted = true
        return new Response(null, { status: 204 })
      },
    })
    renderWithProviders(<App />, { route: "/connections" })

    expect(await screen.findByText("GitLab token")).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "Remove" }))
    let dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByRole("heading", { name: "Remove dev?" })).toBeInTheDocument()
    expect(deleted).toBe(false)

    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    expect(deleted).toBe(false)
    expect(screen.getByText("GitLab token")).toBeInTheDocument()

    await userEvent.click(screen.getByRole("button", { name: "Remove" }))
    dialog = await screen.findByRole("dialog")
    await userEvent.click(within(dialog).getByRole("button", { name: "Remove connection" }))

    await waitFor(() => expect(deleted).toBe(true))
    expect(await screen.findByText("No connections yet")).toBeInTheDocument()
  })
})

describe("Repositories page", () => {
  it("points to Connections when nothing is connected", async () => {
    mockApi({ "GET /api/connections": { connections: [], availableApps: ["github"] } })
    renderWithProviders(<App />, { route: "/repositories" })

    expect(await screen.findByText("No forge connected")).toBeInTheDocument()
  })

  it("enables a repository that has never been saved", async () => {
    const posted: unknown[] = []
    mockApi({
      "GET /api/connections": { connections: [gitlabConnection], availableApps: ["github"] },
      "GET /api/repos?connectionId=c1": {
        repos: [
          {
            id: null,
            externalId: "9",
            fullPath: "team/web",
            defaultBranch: "main",
            private: true,
            webUrl: "https://gitlab.com/team/web",
            enabled: false,
            settings: {},
          },
        ],
      },
      "POST /api/repos": (init?: RequestInit) => {
        posted.push(JSON.parse(String(init?.body)))
        return jsonResponse(201, {
          repo: { id: "r1" },
          webhook: { active: false, error: "Automatic reviews are off: GitLab refused the webhook (403 Forbidden)" },
        })
      },
    })
    renderWithProviders(<App />, { route: "/repositories" })

    await userEvent.click(await screen.findByRole("switch", { name: "Reviews for team/web" }))

    await waitFor(() => expect(posted).toEqual([{ connectionId: "c1", externalId: "9" }]))
    expect(await screen.findByText(/GitLab refused the webhook/)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Settings" })).toBeDisabled()
  })
})
