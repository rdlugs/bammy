import { useState } from "react"
import { Link } from "react-router"
import { FolderGit2, Lock } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Field, FieldLabel } from "@/components/ui/field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { RepoSettingsSheet } from "@/features/forge/RepoSettingsSheet"
import { useConnections, useRepos, useSetRepoEnabled, type ForgeRepo } from "@/features/forge/api"

function RepoTable({ connectionId }: { connectionId: string }) {
  const { data, isPending, isError, error } = useRepos(connectionId)
  const setEnabled = useSetRepoEnabled(connectionId)
  const [editing, setEditing] = useState<ForgeRepo | null>(null)

  async function toggle(repo: ForgeRepo, enabled: boolean) {
    try {
      const { webhook } = await setEnabled.mutateAsync({ repo, enabled })
      // Manual reviews still work; say why automatic ones do not.
      if (webhook && !webhook.active) toast.warning(webhook.error ?? "Automatic reviews are unavailable")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update the repository")
    }
  }

  if (isPending) return <Skeleton className="h-40 w-full" />
  if (isError) return <p className="text-sm text-destructive">{error.message}</p>
  if (!data.repos.length) return <p className="text-sm text-muted-foreground">This account can see no repositories.</p>

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Repository</TableHead>
            <TableHead>Default branch</TableHead>
            <TableHead>Reviews</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.repos.map((repo) => (
            <TableRow key={repo.externalId}>
              <TableCell>
                <a href={repo.webUrl} target="_blank" rel="noreferrer" className="font-medium hover:underline">
                  {repo.fullPath}
                </a>
                {repo.private && (
                  <Badge variant="outline" className="ml-2">
                    <Lock /> private
                  </Badge>
                )}
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
                <Button variant="ghost" size="sm" disabled={!repo.id} onClick={() => setEditing(repo)}>
                  Settings
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <RepoSettingsSheet repo={editing} onClose={() => setEditing(null)} />
    </>
  )
}

export function RepositoriesPage() {
  const { data, isPending } = useConnections()
  const [selected, setSelected] = useState<string | undefined>()
  const connections = data?.connections ?? []
  const connectionId = selected ?? connections[0]?.id

  if (isPending) {
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

  return (
    <main className="flex flex-1 flex-col gap-6 p-6">
      <Field className="max-w-sm">
        <FieldLabel htmlFor="connection">Account</FieldLabel>
        <Select value={connectionId} onValueChange={setSelected}>
          <SelectTrigger id="connection" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {connections.map((connection) => (
              <SelectItem key={connection.id} value={connection.id}>
                {connection.accountLogin} ({connection.host})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Card>
        <CardContent>{connectionId && <RepoTable key={connectionId} connectionId={connectionId} />}</CardContent>
      </Card>
    </main>
  )
}
