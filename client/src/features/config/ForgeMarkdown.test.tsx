import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { ForgeMarkdown } from "./ForgeMarkdown"

// jsdom cannot lay out SVG, so Mermaid itself is stood in for.
vi.mock("mermaid", () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn(async (_id: string, source: string) => {
      if (source.includes("broken")) throw new Error("Parse error")
      return { svg: `<svg data-testid="diagram"><text>${source.split("\n")[1]?.trim()}</text></svg>` }
    }),
  },
}))

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

  it("draws mermaid blocks as diagrams, and shows the source when one does not parse", async () => {
    render(
      <ForgeMarkdown provider="github">
        {"```mermaid\nsequenceDiagram\n  A->>B: hi\n```\n\n```mermaid\nbroken\n  nope\n```\n"}
      </ForgeMarkdown>,
    )
    expect(await screen.findByRole("img", { name: "Sequence diagram" })).toHaveTextContent("A->>B: hi")
    expect(await screen.findByText(/broken/)).toBeInTheDocument()
  })

  it("strips scripts and event handlers", () => {
    const { container } = render(
      <ForgeMarkdown provider="github">{'<img src="x" onerror="alert(1)"><script>alert(1)</script>'}</ForgeMarkdown>,
    )
    expect(container.querySelector("script")).toBeNull()
    expect(container.querySelector("img")?.getAttribute("onerror")).toBeNull()
  })
})
