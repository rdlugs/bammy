import { afterEach, describe, expect, it, vi } from "vitest"
import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { App } from "@/App"
import { jsonResponse, renderWithProviders } from "@/test/renderWithProviders"
import { mockApi, testUser } from "@/test/apiRoutes"

// jsdom has no image decoding or canvas; these stand in so the crop runs.
function stubImagePipeline() {
  const drawImage = vi.fn()
  vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 400, height: 200, close: vi.fn() })))
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage } as never)
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (callback, type) {
    callback(new Blob(["jpeg-bytes"], { type: type ?? "image/png" }))
  })
  return drawImage
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("profile picture", () => {
  it("crops the picked image to a centered square and uploads it as JPEG", async () => {
    const drawImage = stubImagePipeline()
    const uploaded = { ...testUser, avatarUpdatedAt: "2026-10-06T00:00:00.000Z" }
    const fetchSpy = mockApi({ "PUT /api/settings/avatar": () => jsonResponse(200, { user: uploaded }) })
    renderWithProviders(<App />, { route: "/settings" })

    await userEvent.upload(
      await screen.findByLabelText("Profile picture file"),
      new File(["png"], "me.png", { type: "image/png" }),
    )

    expect(await screen.findByText("Profile picture updated")).toBeInTheDocument()
    // A 400x200 source is cut to its middle 200x200 square, scaled to 256.
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 100, 0, 200, 200, 0, 0, 256, 256)
    const put = fetchSpy.mock.calls.find(([url, init]) => String(url) === "/api/settings/avatar" && init?.method === "PUT")!
    expect(put[1]!.headers).toEqual({ "Content-Type": "image/jpeg" })
    expect((put[1]!.body as Blob).type).toBe("image/jpeg")
    expect(screen.getByRole("button", { name: "Remove" })).toBeInTheDocument()
  })

  it("stays busy while the picked image is still being converted", async () => {
    // createImageBitmap is held open so the conversion is observably in flight.
    let resolveBitmap!: (value: { width: number; height: number; close: () => void }) => void
    vi.stubGlobal("createImageBitmap", vi.fn(() => new Promise((resolve) => (resolveBitmap = resolve))))
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage: vi.fn() } as never)
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (callback, type) {
      callback(new Blob(["jpeg-bytes"], { type: type ?? "image/png" }))
    })
    const uploaded = { ...testUser, avatarUpdatedAt: "2026-10-06T00:00:00.000Z" }
    mockApi({ "PUT /api/settings/avatar": () => jsonResponse(200, { user: uploaded }) })
    renderWithProviders(<App />, { route: "/settings" })

    const upload = await screen.findByRole("button", { name: "Upload picture" })
    await userEvent.upload(
      await screen.findByLabelText("Profile picture file"),
      new File(["png"], "me.png", { type: "image/png" }),
    )

    // Conversion has not resolved yet, so picking again is blocked.
    expect(upload).toBeDisabled()
    resolveBitmap({ width: 400, height: 200, close: vi.fn() })

    expect(await screen.findByText("Profile picture updated")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Upload picture" })).toBeEnabled()
  })

  it("rejects a file that is not an image without uploading", async () => {
    const fetchSpy = mockApi({})
    renderWithProviders(<App />, { route: "/settings" })

    await userEvent.upload(
      await screen.findByLabelText("Profile picture file"),
      new File(["text"], "notes.txt", { type: "text/plain" }),
      { applyAccept: false },
    )

    expect(await screen.findByText("Choose an image file")).toBeInTheDocument()
    expect(fetchSpy.mock.calls.some(([url]) => String(url) === "/api/settings/avatar")).toBe(false)
  })

  it("removes the picture and falls back to initials", async () => {
    const fetchSpy = mockApi({
      "GET /api/auth/me": { user: { ...testUser, avatarUpdatedAt: "2026-10-06T00:00:00.000Z" } },
      "DELETE /api/settings/avatar": () => jsonResponse(200, { user: testUser }),
    })
    renderWithProviders(<App />, { route: "/settings" })

    await userEvent.click(await screen.findByRole("button", { name: "Remove" }))

    expect(await screen.findByText("Profile picture removed")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Remove" })).not.toBeInTheDocument()
    expect(fetchSpy.mock.calls.some(([url, init]) => String(url) === "/api/settings/avatar" && init?.method === "DELETE")).toBe(true)
  })
})
