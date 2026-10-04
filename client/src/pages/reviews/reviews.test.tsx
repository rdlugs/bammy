import { describe, expect, it } from "vitest"
import { screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { App } from "@/App"
import { jsonResponse, renderWithProviders } from "@/test/renderWithProviders"
import { mockApi } from "@/test/apiRoutes"
import { detail, listItem } from "@/test/fixtures"

describe("Reviews page", () => {
  it("lists reviews with their status, verdict and finding counts", async () => {
    mockApi({ "GET /api/reviews?limit=50": { reviews: [listItem], nextCursor: null } })
    renderWithProviders(<App />, { route: "/reviews" })

    const row = (await screen.findByRole("link", { name: "Add b and c" })).closest("tr")!
    expect(within(row).getByText("Completed")).toBeInTheDocument()
    expect(within(row).getByText("Blocked")).toBeInTheDocument()
    expect(within(row).getByText("critical")).toBeInTheDocument()
    expect(within(row).getByText("abcdef1")).toBeInTheDocument()
  })

  it("shows the server's reason when a link cannot be reviewed", async () => {
    mockApi({
      "GET /api/reviews?limit=50": { reviews: [], nextCursor: null },
      "POST /api/reviews": () =>
        jsonResponse(404, { message: "acme/web is not connected; enable it under Repositories first" }),
    })
    renderWithProviders(<App />, { route: "/reviews" })

    expect(await screen.findByText("No reviews yet")).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText("Review a pull or merge request"), "https://github.com/acme/web/pull/1")
    await userEvent.click(screen.getByRole("button", { name: "Review" }))

    expect(await screen.findByText(/is not connected/)).toBeInTheDocument()
  })

  it("opens the new review after queueing one", async () => {
    mockApi({
      "GET /api/reviews?limit=50": { reviews: [], nextCursor: null },
      "POST /api/reviews": () => jsonResponse(202, { review: { ...listItem, status: "queued", verdict: null } }),
      [`GET /api/reviews/${listItem.id}`]: { review: { ...detail, status: "queued", verdict: null, result: null } },
    })
    renderWithProviders(<App />, { route: "/reviews" })

    await userEvent.type(await screen.findByLabelText("Review a pull or merge request"), "https://github.com/acme/web/pull/42")
    await userEvent.click(screen.getByRole("button", { name: "Review" }))

    expect(await screen.findByText("Waiting for a worker...")).toBeInTheDocument()
  })
})

describe("Review detail page", () => {
  it("groups findings by bucket and shows walkthrough, notes and coverage", async () => {
    mockApi({ [`GET /api/reviews/${detail.id}`]: { review: detail } })
    renderWithProviders(<App />, { route: `/reviews/${detail.id}` })

    const actionable = await screen.findByRole("region", { name: "Actionable comments" })
    expect(within(actionable).getByText("SQL injection in search")).toBeInTheDocument()
    expect(within(actionable).getByText("db.query(sql, [q])")).toBeInTheDocument()
    expect(within(screen.getByRole("region", { name: "Nitpick comments" })).getByText("Rename c")).toBeInTheDocument()
    expect(
      within(screen.getByRole("region", { name: "Outside diff range comments" })).getByText("Caller ignores result"),
    ).toBeInTheDocument()

    expect(screen.getByText("Adds b and c.")).toBeInTheDocument()
    expect(screen.getByText(/unknown setting nope/)).toBeInTheDocument()
    expect(screen.getByText(/ignored by configuration/)).toBeInTheDocument()
    expect(within(actionable).getByRole("link", { name: /src\/app\.ts:11/ })).toHaveAttribute(
      "href",
      "https://github.com/acme/web/blob/abcdef1234/src/app.ts#L11",
    )
  })

  it("says what was posted to the forge", async () => {
    const publication = {
      inlinePosted: [{ fingerprint: "a", forgeCommentId: "1" }, { fingerprint: "b", forgeCommentId: "2" }],
      inlineSkipped: 1,
      inlineFailed: [],
      summaryCommentId: "9",
      statusState: "failure",
      errors: [],
    }
    mockApi({ [`GET /api/reviews/${detail.id}`]: { review: { ...detail, publication } } })
    renderWithProviders(<App />, { route: `/reviews/${detail.id}` })

    expect(
      await screen.findByText("Posted to GitHub: 2 inline comments, 1 already posted, summary, commit status (failure)"),
    ).toBeInTheDocument()
  })

    it("explains a review that failed before producing a result", async () => {
    mockApi({
      [`GET /api/reviews/${detail.id}`]: {
        review: { ...detail, status: "failed", verdict: "error", result: null, error: "No API key for anthropic" },
      },
    })
    renderWithProviders(<App />, { route: `/reviews/${detail.id}` })

    expect(await screen.findByText("The review did not run")).toBeInTheDocument()
    expect(screen.getByText("No API key for anthropic")).toBeInTheDocument()
  })
})
