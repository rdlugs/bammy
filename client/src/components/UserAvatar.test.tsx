import { afterEach, describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { UserAvatar } from "./UserAvatar"

// jsdom never loads images, so Radix would keep showing the fallback; this
// Image reports success as soon as it gets a src.
class LoadingImage {
  complete = false
  naturalWidth = 0
  private onLoad: ((event: { currentTarget: LoadingImage; target: LoadingImage }) => void) | null = null
  addEventListener(event: string, listener: LoadingImage["onLoad"]) {
    if (event === "load") this.onLoad = listener
  }
  removeEventListener() {}
  set src(_value: string) {
    queueMicrotask(() => {
      this.complete = true
      this.naturalWidth = 256
      this.onLoad?.({ currentTarget: this, target: this })
    })
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("UserAvatar", () => {
  it("shows the initials on a per-user color without a picture", () => {
    render(<UserAvatar user={{ id: "u1", name: "Rojenson Lugo", avatarUpdatedAt: null }} />)

    const fallback = screen.getByText("RL")
    expect(fallback.className).toMatch(/bg-\w+-100/)
    expect(screen.queryByRole("img")).not.toBeInTheDocument()
  })

  it("gives the same user the same color and different users different ones", () => {
    const colorOf = (id: string) => {
      const { unmount } = render(<UserAvatar user={{ id, name: "Ada Lovelace" }} />)
      const color = screen.getByText("AL").className.match(/bg-\w+-100/)![0]
      unmount()
      return color
    }

    expect(colorOf("1f332a1d-e6dd-45c0")).toBe(colorOf("1f332a1d-e6dd-45c0"))
    const colors = new Set(["a", "b", "c", "d", "e", "f", "g", "h"].map(colorOf))
    expect(colors.size).toBeGreaterThan(1)
  })

  it("shows the picture from a URL versioned by its upload time", async () => {
    vi.stubGlobal("Image", LoadingImage)
    const { container } = render(
      <UserAvatar user={{ id: "u1", name: "Rojenson Lugo", avatarUpdatedAt: "2026-10-06T00:00:00.000Z" }} />,
    )

    await vi.waitFor(() => expect(container.querySelector("img")).not.toBeNull())
    expect(container.querySelector("img")).toHaveAttribute(
      "src",
      `/api/users/u1/avatar?v=${Date.parse("2026-10-06T00:00:00.000Z")}`,
    )
  })
})
