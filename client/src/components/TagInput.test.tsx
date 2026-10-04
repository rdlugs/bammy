import { useState } from "react"
import { describe, expect, it } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { TagInput } from "./TagInput"

function Harness(props: { initial?: string[] }) {
  const [tags, setTags] = useState(props.initial ?? [])
  return (
    <>
      <label htmlFor="tags">Tags</label>
      <TagInput id="tags" value={tags} onChange={setTags} placeholder="Add one" />
      <output>{JSON.stringify(tags)}</output>
    </>
  )
}

const tags = () => JSON.parse(screen.getByRole("status").textContent ?? "[]")

describe("TagInput", () => {
  it("adds a trimmed tag on Enter or comma and ignores blanks and duplicates", async () => {
    render(<Harness />)
    await userEvent.type(screen.getByLabelText("Tags"), " wip {enter}draft,wip{enter} ,")
    expect(tags()).toEqual(["wip", "draft"])
    expect(screen.getByLabelText("Tags")).toHaveValue("")
  })

  it("removes the last tag with Backspace in an empty box, or one by its button", async () => {
    render(<Harness initial={["a", "b", "c"]} />)
    await userEvent.type(screen.getByLabelText("Tags"), "{backspace}")
    expect(tags()).toEqual(["a", "b"])
    await userEvent.click(screen.getByRole("button", { name: "Remove a" }))
    expect(tags()).toEqual(["b"])
  })

  it("splits a pasted list and keeps what was typed when focus leaves", async () => {
    render(<Harness />)
    const input = screen.getByLabelText("Tags")
    fireEvent.paste(input, { clipboardData: { getData: () => "a, b,c" } })
    expect(tags()).toEqual(["a", "b", "c"])
    await userEvent.type(input, "d")
    await userEvent.tab()
    expect(tags()).toEqual(["a", "b", "c", "d"])
  })
  it("keeps what was typed when it is unmounted, as switching tabs does", async () => {
    let saved: string[] = []
    const { rerender } = render(<TagInput aria-label="Tags" value={[]} onChange={(next) => (saved = next)} />)
    await userEvent.type(screen.getByLabelText("Tags"), "legacy")
    rerender(<></>)
    expect(saved).toEqual(["legacy"])
  })
})
