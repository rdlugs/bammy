import { describe, expect, it } from "vitest"
import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { App } from "@/App"
import { jsonResponse, renderWithProviders } from "@/test/renderWithProviders"
import { mockApi } from "@/test/apiRoutes"

const gitlabConnection = {
  id: "c1",
  provider: "gitlab",
  host: "gitlab.com",
  kind: "token",
  accountLogin: "dev",
  createdAt: "",
}

describe("Connections page", () => {
  it("validates the GitLab form before calling the API", async () => {
    const fetchSpy = mockApi({ "GET /api/connections": { connections: [], githubAvailable: false } })
    renderWithProviders(<App />, { route: "/connections" })

    await userEvent.click(await screen.findByRole("button", { name: "Connect GitLab" }))

    expect(await screen.findByText("Token is required")).toBeInTheDocument()
    expect(fetchSpy.mock.calls.some(([url]) => String(url).endsWith("/connections/gitlab"))).toBe(false)
    expect(screen.getByText("GitHub is not configured on this server.")).toBeInTheDocument()
  })

  it("shows a field error from the server", async () => {
    mockApi({
      "GET /api/connections": { connections: [], githubAvailable: true },
      "POST /api/connections/gitlab": () =>
        jsonResponse(400, { message: "Validation failed", errors: { host: ["Enter a host such as gitlab.com"] } }),
    })
    renderWithProviders(<App />, { route: "/connections" })

    await userEvent.type(await screen.findByLabelText("Access token"), "glpat-x")
    await userEvent.click(screen.getByRole("button", { name: "Connect GitLab" }))

    expect(await screen.findByText("Enter a host such as gitlab.com")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Install GitHub App" })).toHaveAttribute(
      "href",
      "/api/connections/github/install",
    )
  })

  it("asks for confirmation before removing a connection", async () => {
    let deleted = false
    mockApi({
      "GET /api/connections": () => jsonResponse(200, { connections: deleted ? [] : [gitlabConnection], githubAvailable: true }),
      "DELETE /api/connections/c1": () => {
        deleted = true
        return new Response(null, { status: 204 })
      },
    })
    renderWithProviders(<App />, { route: "/connections" })

    await userEvent.click(await screen.findByRole("button", { name: "Remove" }))
    expect(deleted).toBe(false)
    await userEvent.click(screen.getByRole("button", { name: "Confirm remove" }))

    await waitFor(() => expect(deleted).toBe(true))
    expect(await screen.findByText("Nothing connected yet.")).toBeInTheDocument()
  })
})

describe("Repositories page", () => {
  it("points to Connections when nothing is connected", async () => {
    mockApi({ "GET /api/connections": { connections: [], githubAvailable: true } })
    renderWithProviders(<App />, { route: "/repositories" })

    expect(await screen.findByText("No forge connected")).toBeInTheDocument()
  })

  it("enables a repository that has never been saved", async () => {
    const posted: unknown[] = []
    mockApi({
      "GET /api/connections": { connections: [gitlabConnection], githubAvailable: true },
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
