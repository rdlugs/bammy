import { describe, expect, it } from "vitest"
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
  createdAt: "",
}

async function openAddConnection() {
  await userEvent.click(await screen.findByRole("button", { name: "Add connection" }))
}

describe("Connections page", () => {
  it("offers one Add connection button when nothing is connected", async () => {
    mockApi({ "GET /api/connections": { connections: [], availableApps: ["github"] } })
    renderWithProviders(<App />, { route: "/connections" })

    expect(await screen.findByText("No connections yet")).toBeInTheDocument()
    await openAddConnection()

    expect(screen.getByRole("button", { name: "GitHub" })).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByRole("link", { name: "Install GitHub App" })).toHaveAttribute(
      "href",
      "/api/connections/github/install",
    )
  })

  it("offers every registered provider and its hosting options", async () => {
    mockApi({ "GET /api/connections": { connections: [], availableApps: ["github"] } })
    renderWithProviders(<App />, { route: "/connections" })

    await openAddConnection()

    const providers = within(screen.getByRole("group", { name: "Provider" })).getAllByRole("button")
    expect(providers.map((button) => button.textContent)).toEqual(PROVIDER_IDS.map((id) => PROVIDERS[id].label))
    for (const id of PROVIDER_IDS) {
      await userEvent.click(screen.getByRole("button", { name: PROVIDERS[id].label }))
      const hosting = within(screen.getByRole("group", { name: "Hosting" })).getAllByRole("button")
      expect(hosting.map((button) => button.textContent)).toEqual(PROVIDERS[id].hosting.map((option) => option.label))
    }
  })

  it("validates the GitLab form before calling the API", async () => {
    const fetchSpy = mockApi({ "GET /api/connections": { connections: [], availableApps: [] } })
    renderWithProviders(<App />, { route: "/connections" })

    await openAddConnection()
    expect(screen.getByText("The GitHub App is not configured on this server.")).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "GitLab" }))
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
    await userEvent.click(screen.getByRole("button", { name: "GitLab" }))
    await userEvent.click(screen.getByRole("button", { name: "Self-hosted" }))
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
    await userEvent.click(screen.getByRole("button", { name: "Self-hosted" }))
    await userEvent.type(screen.getByLabelText("Host"), "ghe.acme.com")
    await userEvent.type(screen.getByLabelText("Access token"), "ghp_x")
    await userEvent.click(screen.getByRole("button", { name: "Connect GitHub" }))

    await waitFor(() => expect(body).toEqual({ host: "ghe.acme.com", token: "ghp_x" }))
  })

  it("asks for confirmation before removing a connection", async () => {
    let deleted = false
    mockApi({
      "GET /api/connections": () => jsonResponse(200, { connections: deleted ? [] : [gitlabConnection], availableApps: ["github"] }),
      "DELETE /api/connections/c1": () => {
        deleted = true
        return new Response(null, { status: 204 })
      },
    })
    renderWithProviders(<App />, { route: "/connections" })

    expect(await screen.findByText("GitLab token")).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "Remove" }))
    expect(deleted).toBe(false)
    await userEvent.click(screen.getByRole("button", { name: "Confirm remove" }))

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
