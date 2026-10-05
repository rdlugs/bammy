import { describe, expect, it, vi } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { App } from "@/App"
import { jsonResponse, renderWithProviders } from "@/test/renderWithProviders"
import { mockApi } from "@/test/apiRoutes"
import { detail, listItem } from "@/test/fixtures"

describe("Reviews page", () => {
  it("lists reviews with their status, verdict and finding counts", async () => {
    mockApi({ "GET /api/reviews?view=changes&page=1&limit=10": { reviews: [listItem], total: 1, page: 1, limit: 10 } })
    renderWithProviders(<App />, { route: "/reviews" })

    const row = (await screen.findByRole("link", { name: "Add b and c" })).closest("tr")!
    expect(within(row).getByText("Completed")).toBeInTheDocument()
    expect(within(row).getByText("Blocked")).toBeInTheDocument()
    expect(within(row).getByText("critical")).toBeInTheDocument()
    expect(within(row).getByText("abcdef1")).toBeInTheDocument()
  })

  it("pages through reviews on the server", async () => {
    const reviewsPage = (n: number) => ({ ...listItem, id: `review-${n}`, summary: { ...listItem.summary!, title: `Review ${n}` } })
    mockApi({
      "GET /api/reviews?view=changes&page=1&limit=10": { reviews: [reviewsPage(1)], total: 12, page: 1, limit: 10 },
      "GET /api/reviews?view=changes&page=2&limit=10": { reviews: [reviewsPage(11)], total: 12, page: 2, limit: 10 },
    })
    renderWithProviders(<App />, { route: "/reviews" })

    expect(await screen.findByText("Showing 1-10 of 12")).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "Next page" }))

    expect(await screen.findByRole("link", { name: "Review 11" })).toBeInTheDocument()
    expect(screen.getByText("Showing 11-12 of 12")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled()
  })

  it("shows the server's reason when a link cannot be reviewed", async () => {
    mockApi({
      "GET /api/reviews?view=changes&page=1&limit=10": { reviews: [], total: 0, page: 1, limit: 10 },
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
      "GET /api/reviews?view=changes&page=1&limit=10": { reviews: [], total: 0, page: 1, limit: 10 },
      "POST /api/reviews": () => jsonResponse(202, { review: { ...listItem, status: "queued", verdict: null } }),
      [`GET /api/reviews/${listItem.id}`]: { review: { ...detail, status: "queued", verdict: null, result: null } },
    })
    renderWithProviders(<App />, { route: "/reviews" })

    await userEvent.type(await screen.findByLabelText("Review a pull or merge request"), "https://github.com/acme/web/pull/42")
    await userEvent.click(screen.getByRole("button", { name: "Review" }))

    expect(await screen.findByText("Waiting for a worker...")).toBeInTheDocument()
  })
})

describe("Reviews page rows, filters and stats", () => {
  const firstPage = (reviews: unknown[], total = reviews.length) => ({ reviews, total, page: 1, limit: 10 })

  it("shows the trigger, duration, failure reason and forge link", async () => {
    const failed = {
      ...listItem,
      status: "failed",
      verdict: null,
      trigger: "webhook",
      error: "The model timed out",
      startedAt: "2026-01-01T00:00:00Z",
      finishedAt: "2026-01-01T00:01:10Z",
      summary: { ...listItem.summary!, webUrl: "https://github.com/acme/web/pull/42" },
    }
    mockApi({ "GET /api/reviews?view=changes&page=1&limit=10": firstPage([failed]) })
    renderWithProviders(<App />, { route: "/reviews" })

    const row = (await screen.findByRole("link", { name: "Add b and c" })).closest("tr")!
    expect(within(row).getByLabelText("Started by a push or a new pull request")).toBeInTheDocument()
    expect(within(row).getByText("took 1m 10s")).toBeInTheDocument()
    expect(within(row).getByText("The model timed out")).toBeInTheDocument()
    expect(within(row).getByRole("link", { name: "Open on GitHub" })).toHaveAttribute(
      "href",
      "https://github.com/acme/web/pull/42",
    )
  })

  it("re-runs a review from the row menu", async () => {
    const rerun = vi.fn(() => jsonResponse(202, { review: { ...listItem, id: "new", status: "queued" } }))
    mockApi({
      "GET /api/reviews?view=changes&page=1&limit=10": firstPage([listItem]),
      [`POST /api/reviews/${listItem.id}/rerun`]: rerun,
    })
    renderWithProviders(<App />, { route: "/reviews" })

    await userEvent.click(await screen.findByRole("button", { name: "Actions for Add b and c" }))
    await userEvent.click(await screen.findByRole("menuitem", { name: "Re-run" }))

    expect(await screen.findByText("Review queued")).toBeInTheDocument()
    expect(rerun).toHaveBeenCalledOnce()
  })

  it("filters on the server and starts over at page 1", async () => {
    mockApi({
      "GET /api/reviews?view=changes&page=2&limit=10": firstPage([listItem], 12),
      "GET /api/reviews?status=failed&view=changes&page=1&limit=10": firstPage([]),
    })
    renderWithProviders(<App />, { route: "/reviews?page=2" })

    await userEvent.click(await screen.findByRole("button", { name: "Filters" }))
    await userEvent.click(screen.getByLabelText("Status"))
    await userEvent.click(await screen.findByRole("option", { name: "Failed" }))

    expect(await screen.findByText("No reviews match these filters.")).toBeInTheDocument()
    expect(screen.getByText("Status:")).toBeInTheDocument()
  })

  it("searches after typing stops", async () => {
    mockApi({
      "GET /api/reviews?view=changes&page=1&limit=10": firstPage([listItem]),
      "GET /api/reviews?q=%2342&view=changes&page=1&limit=10": firstPage([{ ...listItem, id: "found", summary: { ...listItem.summary!, title: "Found it" } }]),
    })
    renderWithProviders(<App />, { route: "/reviews" })

    await userEvent.type(await screen.findByLabelText("Search reviews"), "#42")

    expect(await screen.findByRole("link", { name: "Found it" })).toBeInTheDocument()
  })

  it("expands a change to show its earlier runs", async () => {
    const earlier = { ...listItem, id: "earlier", headSha: "0123456789", status: "superseded", verdict: null }
    mockApi({
      "GET /api/reviews?view=changes&page=1&limit=10": firstPage([{ ...listItem, runCount: 2 }]),
      "GET /api/reviews?repoId=r1&number=42&view=runs&includeSuperseded=true&limit=20": firstPage([listItem, earlier]),
    })
    renderWithProviders(<App />, { route: "/reviews" })

    await userEvent.click(await screen.findByRole("button", { name: "2 runs" }))

    const history = await screen.findByRole("list", { name: "Earlier runs of Add b and c" })
    expect(within(history).getByText("0123456")).toBeInTheDocument()
    expect(within(history).getByText("Superseded")).toBeInTheDocument()
    expect(within(history).queryByText("abcdef1")).not.toBeInTheDocument()
  })

  it("switches to every run", async () => {
    mockApi({
      "GET /api/reviews?view=changes&page=1&limit=10": firstPage([listItem]),
      "GET /api/reviews?view=runs&page=1&limit=10": firstPage([{ ...listItem, id: "run", summary: { ...listItem.summary!, title: "A run" } }]),
    })
    renderWithProviders(<App />, { route: "/reviews" })

    await userEvent.click(await screen.findByRole("tab", { name: "All runs" }))

    expect(await screen.findByRole("link", { name: "A run" })).toBeInTheDocument()
  })

  it("summarises the last days above the table", async () => {
    mockApi({
      "GET /api/reviews?view=changes&page=1&limit=10": firstPage([listItem]),
      "GET /api/reviews/stats": {
        days: 7,
        runs: 9,
        blocked: 2,
        passed: 6,
        failed: 1,
        findings: { critical: 3, major: 0, minor: 5, info: 1 },
      },
    })
    renderWithProviders(<App />, { route: "/reviews" })

    const stats = await screen.findByRole("region", { name: "Review stats" })
    expect(within(stats).getByText("Reviews, last 7 days")).toBeInTheDocument()
    expect(within(stats).getByText("9")).toBeInTheDocument()
    expect(within(stats).getByText("25%")).toBeInTheDocument()
    expect(within(stats).getByText("2 of 8")).toBeInTheDocument()
    await waitFor(() => expect(within(stats).getByText("5")).toBeInTheDocument())
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
