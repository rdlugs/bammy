import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { SearchableSelect, type SelectOption } from "./SearchableSelect"

const fruits: SelectOption[] = ["Apple", "Banana", "Cherry", "Date", "Elderberry", "Fig", "Grape"].map((label) => ({
  value: label.toLowerCase(),
  label,
}))

function setup(props: Partial<React.ComponentProps<typeof SearchableSelect>> = {}) {
  const onValueChange = vi.fn()
  render(
    <>
      <label htmlFor="fruit">Fruit</label>
      <SearchableSelect id="fruit" value="banana" onValueChange={onValueChange} options={fruits} {...props} />
    </>,
  )
  return { onValueChange, trigger: screen.getByRole("combobox", { name: "Fruit" }) }
}

const optionNames = () => screen.getAllByRole("option").map((option) => option.textContent)

describe("SearchableSelect", () => {
  it("shows the selected option and marks it in the list", async () => {
    const { trigger } = setup()
    expect(trigger).toHaveTextContent("Banana")

    await userEvent.click(trigger)
    expect(screen.getByRole("option", { name: "Banana" })).toHaveAttribute("data-checked", "true")
  })

  it("shows a placeholder when nothing is selected", () => {
    const { trigger } = setup({ value: undefined, placeholder: "Pick a fruit" })
    expect(trigger).toHaveTextContent("Pick a fruit")
  })

  it("only offers search past the threshold unless asked", async () => {
    const { trigger } = setup({ options: fruits.slice(0, 3) })
    await userEvent.click(trigger)
    expect(screen.queryByPlaceholderText("Search...")).not.toBeInTheDocument()
    expect(optionNames()).toEqual(["Apple", "Banana", "Cherry"])
  })

  it("can force search on for a short list", async () => {
    const { trigger } = setup({ options: fruits.slice(0, 3), searchable: true })
    await userEvent.click(trigger)
    expect(screen.getByPlaceholderText("Search...")).toBeInTheDocument()
  })

  it("filters by label and keywords, not by value", async () => {
    const options = [
      { value: "id-1", label: "team/web", keywords: ["alice"] },
      { value: "id-2", label: "team/api", keywords: ["bob"] },
    ]
    const { trigger } = setup({ options, value: "id-1", searchable: true })
    await userEvent.click(trigger)
    const search = screen.getByPlaceholderText("Search...")

    await userEvent.type(search, "bob")
    expect(optionNames()).toEqual(["team/api"])

    await userEvent.clear(search)
    await userEvent.type(search, "id-")
    expect(screen.queryByRole("option")).not.toBeInTheDocument()
    expect(screen.getByText("No results.")).toBeInTheDocument()
  })

  it("selects with the mouse and closes", async () => {
    const { trigger, onValueChange } = setup()
    await userEvent.click(trigger)
    await userEvent.type(screen.getByPlaceholderText("Search..."), "gr")
    await userEvent.click(screen.getByRole("option", { name: "Grape" }))

    expect(onValueChange).toHaveBeenCalledWith("grape")
    expect(screen.queryByRole("option")).not.toBeInTheDocument()
  })

  it("selects with the keyboard starting from the current value", async () => {
    const { trigger, onValueChange } = setup()
    trigger.focus()
    await userEvent.keyboard("{Enter}")
    await userEvent.keyboard("{ArrowDown}{Enter}")

    expect(onValueChange).toHaveBeenCalledWith("cherry")
  })

  it("does not open when disabled", async () => {
    const { trigger } = setup({ disabled: true })
    expect(trigger).toBeDisabled()
    await userEvent.click(trigger)
    expect(screen.queryByRole("option")).not.toBeInTheDocument()
  })
})
