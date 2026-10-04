import { useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react"
import { X } from "lucide-react"
import { cn } from "cn"
import { Badge } from "@/components/ui/badge"

// `tags` plus each comma-separated part of `text`, trimmed, skipping blanks
// and repeats.
function withTags(tags: string[], text: string) {
  const next = [...tags]
  for (const part of text.split(",")) {
    const tag = part.trim()
    if (tag && !next.includes(tag)) next.push(tag)
  }
  return next
}

// A list of short values typed one at a time: Enter or a comma adds one,
// Backspace in an empty box removes the last. Text still in the box when it
// loses focus, or is unmounted (switching tabs removes it before any blur), is
// added too, so a typed value is never lost.
export function TagInput(props: {
  id?: string
  value: string[]
  onChange: (value: string[]) => void
  placeholder?: string
  disabled?: boolean
  "aria-label"?: string
  "aria-invalid"?: boolean
  "aria-describedby"?: string
}) {
  const { value, onChange, disabled } = props
  const [draft, setDraft] = useState("")

  function add(text: string) {
    const next = withTags(value, text)
    if (next.length !== value.length) onChange(next)
    setDraft("")
  }

  // The latest render's state, for the unmount commit below.
  const latest = useRef({ draft, value, onChange })
  useEffect(() => {
    latest.current = { draft, value, onChange }
  })
  useEffect(
    () => () => {
      const { draft, value, onChange } = latest.current
      const next = withTags(value, draft)
      if (next.length !== value.length) onChange(next)
    },
    [],
  )

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault()
      add(draft)
    } else if (event.key === "Backspace" && !draft && value.length) {
      onChange(value.slice(0, -1))
    }
  }

  function onPaste(event: ClipboardEvent<HTMLInputElement>) {
    const text = event.clipboardData.getData("text")
    if (!text.includes(",")) return
    event.preventDefault()
    add(draft + text)
  }

  return (
    <div
      data-slot="tag-input"
      aria-disabled={disabled || undefined}
      className={cn(
        "flex min-h-8 w-full flex-wrap items-center gap-1 rounded-lg border border-input bg-transparent px-1.5 py-1 transition-colors dark:bg-input/30",
        "focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50",
        props["aria-invalid"] && "border-destructive ring-3 ring-destructive/20 dark:border-destructive/50",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      {value.map((tag) => (
        <Badge key={tag} variant="secondary" className="h-6 max-w-full gap-0.5 pr-0.5">
          <span className="truncate">{tag}</span>
          <button
            type="button"
            aria-label={`Remove ${tag}`}
            onClick={() => onChange(value.filter((other) => other !== tag))}
            disabled={disabled}
            className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <X className="size-3" />
          </button>
        </Badge>
      ))}
      <input
        id={props.id}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        onBlur={() => draft.trim() && add(draft)}
        placeholder={value.length ? undefined : props.placeholder}
        disabled={disabled}
        aria-label={props["aria-label"]}
        aria-invalid={props["aria-invalid"]}
        aria-describedby={props["aria-describedby"]}
        className="h-6 min-w-24 flex-1 bg-transparent px-1 text-base outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed md:text-sm"
      />
    </div>
  )
}
