import { Fragment, useState, type ComponentType, type ReactNode } from "react"
import { ChevronsUpDown } from "lucide-react"
import { cn } from "cn"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

export interface SelectOption {
  value: string
  // Shown on the trigger and matched by the search.
  label: string
  icon?: ComponentType<{ className?: string }>
  description?: ReactNode
  badge?: ReactNode
  // Extra search terms besides the label.
  keywords?: string[]
  disabled?: boolean
}

export interface SelectOptionGroup {
  heading?: string
  options: SelectOption[]
}

// Short lists stay one click; past this many options a search input is shown.
const SEARCH_THRESHOLD = 6

function isGrouped(options: SelectOption[] | SelectOptionGroup[]): options is SelectOptionGroup[] {
  return options.length > 0 && "options" in options[0]
}

// Matches the search against the label and keywords only: item values are ids,
// which would otherwise match unrelated queries.
function filter(_value: string, search: string, keywords?: string[]) {
  const query = search.trim().toLowerCase()
  return (keywords ?? []).some((keyword) => keyword.toLowerCase().includes(query)) ? 1 : 0
}

export function SearchableSelect({
  id,
  value,
  onValueChange,
  options,
  placeholder = "Select...",
  searchPlaceholder = "Search...",
  emptyText = "No results.",
  searchable,
  disabled,
  className,
  "aria-invalid": ariaInvalid,
}: {
  id?: string
  value: string | undefined
  onValueChange: (value: string) => void
  options: SelectOption[] | SelectOptionGroup[]
  placeholder?: string
  searchPlaceholder?: string
  emptyText?: string
  searchable?: boolean
  disabled?: boolean
  className?: string
  "aria-invalid"?: boolean
}) {
  const [open, setOpen] = useState(false)
  const groups = (isGrouped(options) ? options : [{ options }]).filter((group) => group.options.length > 0)
  const all = groups.flatMap((group) => group.options)
  const selected = all.find((option) => option.value === value)
  const showSearch = searchable ?? all.length > SEARCH_THRESHOLD

  return (
    // Modal so the list still scrolls and takes focus when opened from inside a Sheet or Dialog.
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-invalid={ariaInvalid}
          disabled={disabled}
          data-placeholder={selected ? undefined : ""}
          className={cn(
            "flex h-8 w-full min-w-0 items-center gap-2 rounded-lg border border-input bg-transparent pr-2 pl-2.5 text-left text-sm whitespace-nowrap transition-colors outline-none select-none hover:bg-muted/50 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-expanded:border-ring aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 data-placeholder:text-muted-foreground dark:bg-input/30 dark:hover:bg-input/50 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
            className,
          )}
        >
          {selected?.icon && <selected.icon />}
          <span className="truncate">{selected?.label ?? placeholder}</span>
          {selected?.description && (
            <span className="truncate text-muted-foreground">{selected.description}</span>
          )}
          <ChevronsUpDown className="ml-auto text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--radix-popover-trigger-width) min-w-56 p-0">
        {/* Remounted on every open, so the search starts empty and the selected option is highlighted. */}
        <Command defaultValue={value} filter={filter}>
          {showSearch && <CommandInput placeholder={searchPlaceholder} />}
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            {groups.map((group, index) => (
              <Fragment key={group.heading ?? index}>
                {index > 0 && <CommandSeparator />}
                <CommandGroup heading={group.heading}>
                  {group.options.map((option) => (
                    <CommandItem
                      key={option.value}
                      value={option.value}
                      keywords={[option.label, ...(option.keywords ?? [])]}
                      disabled={option.disabled}
                      data-checked={option.value === value}
                      onSelect={() => {
                        onValueChange(option.value)
                        setOpen(false)
                      }}
                    >
                      {option.icon && <option.icon />}
                      <span className="truncate">{option.label}</span>
                      {option.description && (
                        <span className="truncate text-muted-foreground">{option.description}</span>
                      )}
                      {option.badge}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </Fragment>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
