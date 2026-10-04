import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
import { ForgeMarkdown } from "./ForgeMarkdown"

describe("ForgeMarkdown", () => {
  it("renders GitHub-flavoured markdown and raw details, and hides HTML comments", () => {
    const { container } = render(
      <ForgeMarkdown provider="github">
        {"## Title\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\n<details>\n<summary>More</summary>\n\nInside\n\n</details>\n\n<!-- bammy:summary -->\n"}
      </ForgeMarkdown>,
    )
    expect(screen.getByRole("heading", { name: "Title" })).toBeInTheDocument()
    expect(screen.getByRole("table")).toBeInTheDocument()
    expect(container.querySelector("details summary")).toHaveTextContent("More")
    expect(container).not.toHaveTextContent("bammy:summary")
  })

  it("draws a suggestion block as the forge's suggested change, with the replaced lines", () => {
    render(
      <ForgeMarkdown provider="gitlab" original={["old line"]}>
        {"Fix it:\n\n```suggestion:-0+0\nnew line\n```\n"}
      </ForgeMarkdown>,
    )
    const box = screen.getByRole("group", { name: "Suggested change" })
    expect(box).toHaveTextContent("- old line")
    expect(box).toHaveTextContent("+ new line")
    expect(box).toHaveTextContent("Apply suggestion")
  })

  it("strips scripts and event handlers", () => {
    const { container } = render(
      <ForgeMarkdown provider="github">{'<img src="x" onerror="alert(1)"><script>alert(1)</script>'}</ForgeMarkdown>,
    )
    expect(container.querySelector("script")).toBeNull()
    expect(container.querySelector("img")?.getAttribute("onerror")).toBeNull()
  })
})
