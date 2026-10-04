import { afterEach, describe, expect, it } from "vitest"
import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { ModeToggle } from "./mode-toggle"
import { renderWithProviders } from "@/test/renderWithProviders"

async function chooseTheme(label: string) {
  await userEvent.click(screen.getByRole("button", { name: "Toggle theme" }))
  await userEvent.click(await screen.findByRole("menuitem", { name: label }))
}

describe("ModeToggle", () => {
  afterEach(() => {
    localStorage.clear()
    document.documentElement.className = ""
    document.documentElement.removeAttribute("style")
  })

  it("switches between dark and light and remembers the choice", async () => {
    renderWithProviders(<ModeToggle />)

    await chooseTheme("Dark")
    await waitFor(() => expect(document.documentElement).toHaveClass("dark"))
    expect(localStorage.getItem("theme")).toBe("dark")

    await chooseTheme("Light")
    await waitFor(() => expect(document.documentElement).not.toHaveClass("dark"))
    expect(localStorage.getItem("theme")).toBe("light")
  })
})
