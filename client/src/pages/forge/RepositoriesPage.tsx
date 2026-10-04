import { useMemo, useState } from "react"
import { Link } from "react-router"
import { FolderGit2, Loader2, Plus } from "lucide-react"
import { toast } from "sonner"
import { SortableHead } from "@/components/SortableHead"
import { useSort } from "@/hooks/use-sort"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { AddReposSheet } from "@/features/forge/AddReposSheet"
import { ConnectionStatusBadge } from "@/features/forge/ConnectionStatusBadge"
import {
  statusRank,
  useConnectionStatuses,
  useConnections,
  useRemoveRepo,
  useRepos,
  useSetRepoEnabled,
  type Connection,
  type ConnectionStatus,
  type ForgeRepo,
} from "@/features/forge/api"

type SortKey = "repository" | "account" | "status" | "defaultBranch" | "reviews"

function compareRepos(
  a: ForgeRepo,
  b: ForgeRepo,
  key: SortKey,
  statuses: Record<string, ConnectionStatus | undefined>,
) {
  switch (key) {
    case "repository":
      return a.fullPath.localeCompare(b.fullPath)
    case "account":
      return a.account.login.localeCompare(b.account.login)
    case "status":
      return statusRank(statuses[a.connectionId]) - statusRank(statuses[b.connectionId])
    case "defaultBranch":
      return a.defaultBranch.localeCompare(b.defaultBranch)
    case "reviews":
      // Enabled first.
      return Number(b.enabled) - Number(a.enabled)
  }
}

function RepoTable({ repos, connections }: { repos: ForgeRepo[]; connections: Connection[] }) {
  const setEnabled = useSetRepoEnabled()
  const statuses = useConnectionStatuses(connections)
  // Unsorted keeps the API order (by repository path).
  const { sort, onSort } = useSort<SortKey>()

  const sorted = useMemo(() => {
    if (!sort) return repos
    const direction = sort.dir === "asc" ? 1 : -1
    return [...repos].sort(
      (a, b) => direction * compareRepos(a, b, sort.key, statuses) || a.fullPath.localeCompare(b.fullPath),
    )
  }, [repos, sort, statuses])

  async function toggle(repo: ForgeRepo, enabled: boolean) {
    try {
      const { webhook } = await setEnabled.mutateAsync({ repo, enabled })
      // Manual reviews still work; say why automatic ones do not.
      if (webhook && !webhook.active) toast.warning(webhook.error ?? "Automatic reviews are unavailable")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update the repository")
    }
  }

  const head = { sort, onSort }
  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <SortableHead label="Repository" sortKey="repository" {...head} />
            <SortableHead label="Account" sortKey="account" {...head} />
            <SortableHead label="Connection" sortKey="status" {...head} />
            <SortableHead label="Default branch" sortKey="defaultBranch" {...head} />
            <SortableHead label="Reviews" sortKey="reviews" {...head} />
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((repo) => (
            <TableRow key={repo.id}>
              <TableCell>
                <a href={repo.webUrl} target="_blank" rel="noreferrer" className="font-medium hover:underline">
                  {repo.fullPath}
                </a>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {repo.account.login} ({repo.account.host})
              </TableCell>
              <TableCell>
                <ConnectionStatusBadge status={statuses[repo.connectionId]} />
              </TableCell>
              <TableCell className="text-muted-foreground">{repo.defaultBranch}</TableCell>
              <TableCell>
                <Switch
                  checked={repo.enabled}
                  onCheckedChange={(checked) => toggle(repo, checked)}
                  aria-label={`Reviews for ${repo.fullPath}`}
                  disabled={setEnabled.isPending}
                />
              </TableCell>
              <TableCell className="text-right">
                <RemoveRepoButton repo={repo} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </>
  )
}

function RemoveRepoButton({ repo }: { repo: ForgeRepo }) {
  const [open, setOpen] = useState(false)
  const remove = useRemoveRepo()

  async function onRemove() {
    try {
      await remove.mutateAsync(repo)
      setOpen(false)
      toast.success(`Removed ${repo.fullPath}`)
    } catch {
      toast.error("Could not remove the repository")
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          Remove
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remove {repo.fullPath}?</DialogTitle>
          <DialogDescription>
            Bammy will stop reviewing it and remove its webhook. Its review history is deleted too. This cannot be
            undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </DialogClose>
          <Button variant="destructive" onClick={onRemove} disabled={remove.isPending}>
            {remove.isPending && <Loader2 className="animate-spin" />}
            Remove repository
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function RepositoriesPage() {
  const { data, isPending } = useConnections()
  const repos = useRepos()
  const [adding, setAdding] = useState(false)
  const connections = data?.connections ?? []

  const sheet = <AddReposSheet connections={connections} open={adding} onOpenChange={setAdding} />

  if (isPending || (connections.length && repos.isPending)) {
    return (
      <main className="p-6">
        <Skeleton className="h-40 w-full" />
      </main>
    )
  }

  if (!connections.length) {
    return (
      <main className="flex flex-1 flex-col p-6">
        <Empty className="flex-1 border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FolderGit2 />
            </EmptyMedia>
            <EmptyTitle>No forge connected</EmptyTitle>
            <EmptyDescription>Connect GitHub or GitLab to choose repositories to review.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button asChild>
              <Link to="/connections">Connect a forge</Link>
            </Button>
          </EmptyContent>
        </Empty>
      </main>
    )
  }

  if (repos.isError) {
    return (
      <main className="p-6">
        <p className="text-sm text-destructive">{repos.error.message}</p>
      </main>
    )
  }

  if (!repos.data?.repos.length) {
    return (
      <main className="flex flex-1 flex-col p-6">
        <Empty className="flex-1 border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FolderGit2 />
            </EmptyMedia>
            <EmptyTitle>No repositories added</EmptyTitle>
            <EmptyDescription>Choose which repositories Bammy should review.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button onClick={() => setAdding(true)}>
              <Plus />
              Add repository
            </Button>
          </EmptyContent>
        </Empty>
        {sheet}
      </main>
    )
  }

  return (
    <main className="flex flex-1 flex-col gap-6 p-6">
      <Card>
        <CardHeader>
          <CardTitle>Repositories</CardTitle>
          <CardAction>
            <Button size="sm" onClick={() => setAdding(true)}>
              <Plus />
              Add repository
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          <RepoTable repos={repos.data.repos} connections={connections} />
        </CardContent>
      </Card>
      {sheet}
    </main>
  )
}
