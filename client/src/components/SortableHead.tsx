import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { TableHead } from "@/components/ui/table"
import type { Sort } from "@/hooks/use-sort"

export function SortableHead<K extends string>({
  label,
  sortKey,
  sort,
  onSort,
}: {
  label: string
  sortKey: K
  sort: Sort<K>
  onSort: (key: K) => void
}) {
  const dir = sort?.key === sortKey ? sort.dir : null
  const Icon = dir === "asc" ? ArrowUp : dir === "desc" ? ArrowDown : ArrowUpDown
  const next = dir === "asc" ? "Sort descending" : dir === "desc" ? "Remove sorting" : "Sort ascending"
  return (
    <TableHead aria-sort={dir ? (dir === "asc" ? "ascending" : "descending") : undefined}>
      <Button variant="ghost" size="sm" className="-ml-2.5" title={next} onClick={() => onSort(sortKey)}>
        {label}
        <Icon className={dir ? undefined : "text-muted-foreground"} />
      </Button>
    </TableHead>
  )
}
