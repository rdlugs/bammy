import { useDeferredValue, useMemo, useState } from "react"
import { Loader2, Lock } from "lucide-react"
import { toast } from "sonner"
import { SearchableSelect } from "@/components/SearchableSelect"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { useAddRepos, useAvailableRepos, type AvailableRepo, type Connection } from "./api"

interface Props {
  connections: Connection[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AddReposSheet({ connections, open, onOpenChange }: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="data-[side=right]:sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Add repositories</SheetTitle>
          <SheetDescription>Choose which repositories Sentryward should review.</SheetDescription>
        </SheetHeader>
        {/* Mounted only while open, so the account and selection start fresh each time. */}
        {open && <AccountPicker connections={connections} onDone={() => onOpenChange(false)} />}
      </SheetContent>
    </Sheet>
  )
}

function AccountPicker({ connections, onDone }: { connections: Connection[]; onDone: () => void }) {
  const [connectionId, setConnectionId] = useState(connections[0]?.id)

  return (
    <>
      <div className="px-4">
        <Field>
          <FieldLabel htmlFor="connection">Account</FieldLabel>
          <SearchableSelect
            id="connection"
            value={connectionId}
            onValueChange={setConnectionId}
            placeholder="Select an account"
            searchPlaceholder="Search accounts..."
            options={connections.map((connection) => ({
              value: connection.id,
              label: `${connection.accountLogin} (${connection.host})`,
            }))}
          />
        </Field>
      </div>
      {/* Keyed so switching accounts clears the filter and selection. */}
      {connectionId && <Picker key={connectionId} connectionId={connectionId} onDone={onDone} />}
    </>
  )
}

function Picker({ connectionId, onDone }: { connectionId: string; onDone: () => void }) {
  const { data, isPending, isError, error } = useAvailableRepos(connectionId, true)
  const addRepos = useAddRepos(connectionId)
  const [filter, setFilter] = useState("")
  const [selected, setSelected] = useState<Set<string>>(new Set())

  // Rendering every row of a large (often cached) list in the same commit that
  // opens the sheet delays its first paint. Starting from undefined lets the
  // sheet show the skeleton at once and render the rows in the background.
  const deferredRepos = useDeferredValue(data?.repos, undefined)
  const deferredFilter = useDeferredValue(filter)

  const repos = useMemo(() => {
    const query = deferredFilter.trim().toLowerCase()
    const all = deferredRepos ?? []
    return query ? all.filter((repo) => repo.fullPath.toLowerCase().includes(query)) : all
  }, [deferredRepos, deferredFilter])

  function toggle(repo: AvailableRepo, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current)
      if (checked) next.add(repo.externalId)
      else next.delete(repo.externalId)
      return next
    })
  }

  async function submit() {
    const chosen = (data?.repos ?? []).filter((repo) => selected.has(repo.externalId))
    const { added, failed } = await addRepos.mutateAsync(chosen)
    for (const { repo, error } of failed) toast.error(`${repo.fullPath}: ${error}`)
    // Manual reviews still work; say why automatic ones do not.
    for (const { repo, webhook } of added) {
      if (webhook && !webhook.active) toast.warning(`${repo.fullPath}: ${webhook.error ?? "Automatic reviews are unavailable"}`)
    }
    if (added.length) {
      toast.success(added.length === 1 ? `Added ${added[0]!.repo.fullPath}` : `Added ${added.length} repositories`)
      onDone()
    }
  }

  const count = selected.size

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-4 px-4">
        <Input
          placeholder="Filter repositories"
          aria-label="Filter repositories"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        />
        <div className="min-h-0 flex-1 overflow-y-auto rounded-md border">
          {isError ? (
            <p className="p-4 text-sm text-destructive">{error.message}</p>
          ) : isPending || !deferredRepos ? (
            <RepoListSkeleton />
          ) : !deferredRepos.length ? (
            <p className="p-4 text-sm text-muted-foreground">This account can see no repositories.</p>
          ) : !repos.length ? (
            <p className="p-4 text-sm text-muted-foreground">No repositories match.</p>
          ) : (
            <ul className="divide-y">
              {repos.map((repo) => {
                const added = repo.id !== null
                const id = `add-repo-${repo.externalId}`
                return (
                  <li key={repo.externalId} className="flex items-center gap-3 px-3 py-2">
                    <Checkbox
                      id={id}
                      checked={added || selected.has(repo.externalId)}
                      disabled={added || addRepos.isPending}
                      onCheckedChange={(checked) => toggle(repo, checked === true)}
                    />
                    <label htmlFor={id} className="flex min-w-0 flex-1 items-center gap-2 text-sm">
                      <span className="truncate font-medium">{repo.fullPath}</span>
                      {repo.private && (
                        <Badge variant="outline">
                          <Lock /> private
                        </Badge>
                      )}
                    </label>
                    <span className="text-xs text-muted-foreground">{added ? "Added" : repo.defaultBranch}</span>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
      <SheetFooter className="flex-row justify-end">
        <SheetClose asChild>
          <Button type="button" variant="outline">
            Cancel
          </Button>
        </SheetClose>
        <Button onClick={submit} disabled={!count || addRepos.isPending}>
          {addRepos.isPending && <Loader2 className="animate-spin" />}
          {count ? `Add ${count} ${count === 1 ? "repository" : "repositories"}` : "Add repositories"}
        </Button>
      </SheetFooter>
    </>
  )
}

// Shaped like the rows below, so nothing jumps when the list arrives.
const SKELETON_WIDTHS = ["max-w-56", "max-w-40", "max-w-64", "max-w-48", "max-w-36", "max-w-52"]

function RepoListSkeleton() {
  return (
    <ul className="divide-y" role="status" aria-label="Loading repositories">
      {SKELETON_WIDTHS.map((width) => (
        <li key={width} className="flex items-center gap-3 px-3 py-2">
          <Skeleton className="size-4 rounded-sm" />
          <Skeleton className={`h-4 flex-1 ${width}`} />
          <Skeleton className="ml-auto h-3 w-12" />
        </li>
      ))}
    </ul>
  )
}
