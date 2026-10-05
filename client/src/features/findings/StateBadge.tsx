import { Badge } from "@/components/ui/badge"
import { STATE_LABEL } from "./options"
import type { FindingState } from "./types"

// Same palette as the review StatusBadge: open needs attention, the rest are settled.
const STATE_CLASS: Record<FindingState, string> = {
  open: "border-amber-600/40 text-amber-700 dark:text-amber-400",
  resolved: "border-emerald-600/40 text-emerald-700 dark:text-emerald-400",
  ignored: "border-dashed text-muted-foreground",
}

export function StateBadge({ state }: { state: FindingState }) {
  return (
    <Badge variant="outline" className={STATE_CLASS[state]}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {STATE_LABEL[state]}
    </Badge>
  )
}
