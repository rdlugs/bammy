import { useState } from "react"
import { ChevronsUpDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Input } from "@/components/ui/input"
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

export interface ModelSuggestions {
  models: string[]
  loading: boolean
  error: boolean
}

// The text input stays the source of truth: saved, inherited and proxy model
// ids need not appear in the connection's list, and the list may fail to load.
// The list only offers a shortcut to a valid id.
export function ModelCombobox(props: {
  id?: string
  "aria-label"?: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  "aria-invalid"?: boolean
  suggestions?: ModelSuggestions
}) {
  const [open, setOpen] = useState(false)
  const { suggestions } = props
  const label = props["aria-label"] ?? "model"

  return (
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverAnchor asChild>
        <div className="flex w-full min-w-0 items-center gap-2">
          <Input
            id={props.id}
            aria-label={props["aria-label"]}
            value={props.value}
            onChange={(e) => props.onChange(e.target.value)}
            placeholder={props.placeholder}
            disabled={props.disabled}
            aria-invalid={props["aria-invalid"]}
          />
          {suggestions && (
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                aria-label={`Choose ${label} from the connection`}
                disabled={props.disabled}
              >
                <ChevronsUpDown />
              </Button>
            </PopoverTrigger>
          )}
        </div>
      </PopoverAnchor>
      <PopoverContent align="start" className="w-80 p-0">
        <Command defaultValue={props.value}>
          <CommandInput placeholder="Search models..." />
          <CommandList>
            {suggestions?.loading ? (
              <p className="px-3 py-2 text-sm text-muted-foreground">Loading models...</p>
            ) : suggestions?.error ? (
              <p className="px-3 py-2 text-sm text-muted-foreground">
                Could not load models from this connection; type a model id instead.
              </p>
            ) : (
              <>
                <CommandEmpty>No matching models.</CommandEmpty>
                {suggestions?.models.map((model) => (
                  <CommandItem
                    key={model}
                    value={model}
                    data-checked={model === props.value}
                    onSelect={() => {
                      props.onChange(model)
                      setOpen(false)
                    }}
                  >
                    <span className="truncate">{model}</span>
                  </CommandItem>
                ))}
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
