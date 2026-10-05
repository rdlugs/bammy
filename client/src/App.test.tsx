import { describe, expect, it } from "vitest"
import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { App } from "./App"
import { jsonResponse, mockFetch, renderWithProviders } from "./test/renderWithProviders"

const user = { id: "1", name: "Ada Lovelace", email: "ada@example.com", createdAt: "" }

describe("routing and auth", () => {
  it("redirects an anonymous visitor from /dashboard to the login page", async () => {
    mockFetch(() => jsonResponse(401, { message: "Not authenticated" }))
    renderWithProviders(<App />, { route: "/dashboard" })

    expect(await screen.findByText("Welcome back")).toBeInTheDocument()
  })

  it("shows the dashboard with setup steps for a new user", async () => {
    mockFetch((url) =>
      url.includes("/connections")
        ? jsonResponse(200, { connections: [], availableApps: ["github"] })
        : url.includes("/reviews")
          ? jsonResponse(200, { reviews: [], total: 0, page: 1, limit: 10 })
          : jsonResponse(200, { user }),
    )
    renderWithProviders(<App />, { route: "/dashboard" })

    expect(await screen.findByText("Welcome, Ada Lovelace")).toBeInTheDocument()
    expect(await screen.findByText("Get started")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Connect GitHub or GitLab" })).toHaveAttribute("href", "/repositories?tab=installation")
  })

  it("redirects a logged-in user away from /login", async () => {
    mockFetch(() => jsonResponse(200, { user }))
    renderWithProviders(<App />, { route: "/login" })

    expect(await screen.findByText("Welcome, Ada Lovelace")).toBeInTheDocument()
  })
})

describe("register form", () => {
  it("shows validation errors without calling the API", async () => {
    const fetchSpy = mockFetch(() => jsonResponse(401, { message: "Not authenticated" }))
    renderWithProviders(<App />, { route: "/register" })

    await userEvent.type(await screen.findByLabelText("Email"), "not-an-email")
    await userEvent.type(screen.getByLabelText("Password"), "short")
    await userEvent.type(screen.getByLabelText("Confirm password"), "different")
    await userEvent.click(screen.getByRole("button", { name: "Create account" }))

    expect(await screen.findByText("Name is required")).toBeInTheDocument()
    expect(screen.getByText("Enter a valid email address")).toBeInTheDocument()
    expect(screen.getByText("Password must be at least 8 characters")).toBeInTheDocument()
    expect(screen.getByText("Passwords do not match")).toBeInTheDocument()
    expect(fetchSpy).toHaveBeenCalledTimes(1) // only the initial /auth/me check
  })

  it("registers and lands on the dashboard", async () => {
    mockFetch((url) =>
      url.endsWith("/auth/register")
        ? jsonResponse(201, { user })
        : jsonResponse(401, { message: "Not authenticated" }),
    )
    renderWithProviders(<App />, { route: "/register" })

    await userEvent.type(await screen.findByLabelText("Name"), user.name)
    await userEvent.type(screen.getByLabelText("Email"), user.email)
    await userEvent.type(screen.getByLabelText("Password"), "supersecret123")
    await userEvent.type(screen.getByLabelText("Confirm password"), "supersecret123")
    await userEvent.click(screen.getByRole("button", { name: "Create account" }))

    expect(await screen.findByText("Welcome, Ada Lovelace")).toBeInTheDocument()
  })
})

describe("login form", () => {
  it("shows the server error message on bad credentials", async () => {
    mockFetch((url) =>
      url.endsWith("/auth/login")
        ? jsonResponse(401, { message: "Invalid email or password" })
        : jsonResponse(401, { message: "Not authenticated" }),
    )
    renderWithProviders(<App />, { route: "/login" })

    await userEvent.type(await screen.findByLabelText("Email"), "ada@example.com")
    await userEvent.type(screen.getByLabelText("Password"), "wrongpassword")
    await userEvent.click(screen.getByRole("button", { name: "Log in" }))

    expect(await screen.findByText("Invalid email or password")).toBeInTheDocument()
    expect(screen.getByText("Welcome back")).toBeInTheDocument()
  })
})
