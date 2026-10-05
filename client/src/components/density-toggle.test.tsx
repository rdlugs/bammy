import { afterEach, describe, expect, it } from "vitest"
import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { DensityToggle } from "./density-toggle"
import { renderWithProviders } from "@/test/renderWithProviders"

async function chooseDensity(label: string) {
  await userEvent.click(screen.getByRole("button", { name: "Change density" }))
  await userEvent.click(await screen.findByRole("menuitemradio", { name: label }))
}

describe("DensityToggle", () => {
  afterEach(() => {
    localStorage.clear()
    delete document.documentElement.dataset.density
  })

  it("switches between every density and remembers the choice", async () => {
    renderWithProviders(<DensityToggle />)

    await chooseDensity("Compact")
    expect(document.documentElement.dataset.density).toBe("compact")
    expect(localStorage.getItem("bammy-density")).toBe("compact")

    await chooseDensity("Spacious")
    expect(document.documentElement.dataset.density).toBe("spacious")
    expect(localStorage.getItem("bammy-density")).toBe("spacious")

    await chooseDensity("Comfortable")
    expect(document.documentElement.dataset.density).toBe("comfortable")
    expect(localStorage.getItem("bammy-density")).toBe("comfortable")
  })
})
