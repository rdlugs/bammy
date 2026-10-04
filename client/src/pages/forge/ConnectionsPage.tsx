import { useEffect, useMemo, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useSearchParams } from "react-router"
import { ArrowDown, ArrowUp, ArrowUpDown, Loader2, Plug, Plus } from "lucide-react"
import { toast } from "sonner"
import { z } from "zod"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Checkbox } from "@/components/ui/checkbox"
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
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { TextField } from "@/features/auth/TextField"
import { applyServerErrors } from "@/features/auth/applyServerErrors"
import {
  useConnectionStatuses,
  useConnectToken,
  useConnections,
  useDeleteConnection,
  type Connection,
  type ConnectionStatus,
  type TokenConnectInput,
} from "@/features/forge/api"
import { ConnectionDetailsSheet } from "@/features/forge/ConnectionDetailsSheet"
import { ConnectionStatusBadge } from "@/features/forge/ConnectionStatusBadge"
import { PROVIDER_IDS, PROVIDERS, type TokenMethod } from "@/features/forge/providers"
import type { Provider } from "@/features/reviews/types"

function tokenSchema(method: TokenMethod) {
  const shape: Record<string, z.ZodString> = {
    host: method.fixedHost ? z.string().trim() : z.string().trim().min(1, "Host is required"),
    token: z.string().trim().min(1, "Token is required"),
  }
  for (const field of method.extraFields ?? []) {
    shape[field.name] = z.string().trim().min(1, `${field.label} is required`)
  }
  return z.object(shape)
}

const RETURN_MESSAGES: Record<string, string> = {
  github_install_failed: "GitHub installation could not be completed",
  github_install_forbidden: "That GitHub installation is not one your account can access",
  github_pending_approval: "The installation is waiting for an organization owner to approve it",
}

// GitHub sends the browser back here with ?connected= or ?error=.
function useReturnToast() {
  const [params, setParams] = useSearchParams()
  useEffect(() => {
    const connected = params.get("connected")
    const error = params.get("error")
    if (!connected && !error) return
    if (connected) toast.success("GitHub connected")
    if (error) toast.error(RETURN_MESSAGES[error] ?? "Connection failed")
    setParams({}, { replace: true })
  }, [params, setParams])
}

function TokenForm({
  provider,
  method,
  onConnected,
}: {
  provider: Provider
  method: TokenMethod
  onConnected?: () => void
}) {
  const connect = useConnectToken(provider)
  const label = PROVIDERS[provider].label
  const extraFields = method.extraFields ?? []
  const form = useForm<TokenConnectInput>({
    resolver: zodResolver(tokenSchema(method)),
    defaultValues: {
      host: method.fixedHost ?? "",
      token: "",
      ...Object.fromEntries(extraFields.map((field) => [field.name, ""])),
    },
  })

  async function onSubmit(values: TokenConnectInput) {
    try {
      const { connection } = await connect.mutateAsync(values)
      toast.success(`Connected ${label} as ${connection.accountLogin}`)
      form.reset({ ...values, token: "" })
      onConnected?.()
    } catch (error) {
      applyServerErrors(error, form.setError)
    }
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
      <FieldGroup>
        {!method.fixedHost && (
          <TextField control={form.control} name="host" label="Host" placeholder={method.hostPlaceholder} />
        )}
        {extraFields.map((field) => (
          <TextField
            key={field.name}
            control={form.control}
            name={field.name}
            label={field.label}
            type={field.type ?? "text"}
            autoComplete="off"
            placeholder={field.placeholder}
          />
        ))}
        <TextField
          control={form.control}
          name="token"
          label="Access token"
          type="password"
          autoComplete="off"
          placeholder={method.tokenPlaceholder}
        />
        <Field>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting && <Loader2 className="animate-spin" />}
            Connect {label}
          </Button>
        </Field>
      </FieldGroup>
    </form>
  )
}

type SortKey = "account" | "forge" | "host" | "active" | "createdAt"
// Null leaves the API order (oldest first).
type Sort = { key: SortKey; dir: "asc" | "desc" } | null

// Healthy connections first; ones still being checked sink to the bottom.
const STATUS_RANK: Record<ConnectionStatus, number> = { active: 0, unreachable: 1, revoked: 2 }

function kindLabel(connection: Connection) {
  return PROVIDERS[connection.provider].kindLabel[connection.kind] ?? connection.kind
}

function compareConnections(
  a: Connection,
  b: Connection,
  key: SortKey,
  statuses: Record<string, ConnectionStatus | undefined>,
) {
  switch (key) {
    case "account":
      return a.accountLogin.localeCompare(b.accountLogin)
    case "forge":
      return kindLabel(a).localeCompare(kindLabel(b))
    case "host":
      return a.host.localeCompare(b.host)
    case "active": {
      const rank = (connection: Connection) => {
        const status = statuses[connection.id]
        return status ? STATUS_RANK[status] : 3
      }
      return rank(a) - rank(b)
    }
    case "createdAt":
      return Date.parse(a.createdAt) - Date.parse(b.createdAt)
  }
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, { dateStyle: "medium" })
}

function SortableHead({
  label,
  sortKey,
  sort,
  onSort,
}: {
  label: string
  sortKey: SortKey
  sort: Sort
  onSort: (key: SortKey) => void
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

function ConnectionsTable({ connections }: { connections: Connection[] }) {
  const statuses = useConnectionStatuses(connections)
  const [sort, setSort] = useState<Sort>(null)
  const [selected, setSelected] = useState<Connection | null>(null)

  // Each header cycles ascending -> descending -> unsorted.
  function onSort(key: SortKey) {
    setSort((current) => {
      if (current?.key !== key) return { key, dir: "asc" }
      return current.dir === "asc" ? { key, dir: "desc" } : null
    })
  }

  const sorted = useMemo(() => {
    if (!sort) return connections
    const direction = sort.dir === "asc" ? 1 : -1
    return [...connections].sort(
      (a, b) =>
        direction * compareConnections(a, b, sort.key, statuses) || a.accountLogin.localeCompare(b.accountLogin),
    )
  }, [connections, sort, statuses])

  const head = { sort, onSort }
  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <SortableHead label="Account" sortKey="account" {...head} />
            <SortableHead label="Forge" sortKey="forge" {...head} />
            <SortableHead label="Host" sortKey="host" {...head} />
            <SortableHead label="Active" sortKey="active" {...head} />
            <SortableHead label="Created" sortKey="createdAt" {...head} />
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((connection) => {
            const provider = PROVIDERS[connection.provider]
            return (
              <TableRow key={connection.id}>
                <TableCell className="font-medium">{connection.accountLogin}</TableCell>
                <TableCell>
                  <Badge variant="outline">
                    <provider.icon />
                    {kindLabel(connection)}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">{connection.host}</TableCell>
                <TableCell>
                  <ConnectionStatusBadge status={statuses[connection.id]} />
                </TableCell>
                <TableCell className="text-muted-foreground" title={new Date(connection.createdAt).toLocaleString()}>
                  {formatDate(connection.createdAt)}
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="sm" onClick={() => setSelected(connection)}>
                    Details
                  </Button>
                  <RemoveButton connection={connection} />
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
      <ConnectionDetailsSheet connection={selected} onOpenChange={(open) => !open && setSelected(null)} />
    </>
  )
}

function RemoveButton({ connection }: { connection: Connection }) {
  const [open, setOpen] = useState(false)
  const remove = useDeleteConnection()

  async function onRemove() {
    try {
      await remove.mutateAsync(connection.id)
      setOpen(false)
      toast.success("Connection removed")
    } catch {
      toast.error("Could not remove the connection")
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
          <DialogTitle>Remove {connection.accountLogin}?</DialogTitle>
          <DialogDescription>
            Bammy will stop reviewing its repositories and remove their webhooks. Their review history is deleted
            too. This cannot be undone.
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
            Remove connection
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function AddConnectionSheet({
  open,
  onOpenChange,
  availableApps,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  availableApps: Provider[]
}) {
  const [providerId, setProviderId] = useState<Provider>(PROVIDER_IDS[0]!)
  const [selfHosted, setSelfHosted] = useState(false)

  const provider = PROVIDERS[providerId]
  // The checkbox stays ticked across providers; one without a self-hosted
  // option falls back to its cloud one.
  const hosting = (selfHosted && provider.hosting.selfHosted) || provider.hosting.cloud
  const method = hosting.method

  function handleOpenChange(next: boolean) {
    if (!next) {
      setProviderId(PROVIDER_IDS[0]!)
      setSelfHosted(false)
    }
    onOpenChange(next)
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent className="overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Add connection</SheetTitle>
          <SheetDescription>Connect a code host to choose repositories to review.</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-6 px-4 pb-4">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="provider">Provider</FieldLabel>
              <Select value={providerId} onValueChange={(value) => setProviderId(value as Provider)}>
                <SelectTrigger id="provider" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROVIDER_IDS.map((id) => {
                    const Icon = PROVIDERS[id].icon
                    return (
                      <SelectItem key={id} value={id}>
                        <Icon />
                        {PROVIDERS[id].label}
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
            </Field>
            {provider.hosting.selfHosted && (
              <Field orientation="horizontal">
                <Checkbox
                  id="self-hosted"
                  checked={selfHosted}
                  onCheckedChange={(checked) => setSelfHosted(checked === true)}
                />
                <FieldLabel htmlFor="self-hosted">Self-hosted</FieldLabel>
              </Field>
            )}
          </FieldGroup>
          <Separator />
          <section className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">{hosting.hint}</p>
            {method.type === "app" ? (
              availableApps.includes(providerId) ? (
                <Button asChild>
                  <a href={method.installHref}>Install {method.name}</a>
                </Button>
              ) : (
                <p className="text-sm text-muted-foreground">The {method.name} is not configured on this server.</p>
              )
            ) : (
              <TokenForm
                key={`${providerId}-${hosting === provider.hosting.selfHosted}`}
                provider={providerId}
                method={method}
                onConnected={() => handleOpenChange(false)}
              />
            )}
          </section>
        </div>
      </SheetContent>
    </Sheet>
  )
}

export function ConnectionsPage() {
  useReturnToast()
  const { data, isPending } = useConnections()
  const [adding, setAdding] = useState(false)

  const sheet = <AddConnectionSheet open={adding} onOpenChange={setAdding} availableApps={data?.availableApps ?? []} />

  if (isPending) return null

  if (!data?.connections.length) {
    return (
      <main className="flex flex-1 flex-col p-6">
        <Empty className="flex-1 border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Plug />
            </EmptyMedia>
            <EmptyTitle>No connections yet</EmptyTitle>
            <EmptyDescription>Connect GitHub or GitLab to start reviewing.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button onClick={() => setAdding(true)}>
              <Plus />
              Add connection
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
          <CardTitle>Connected accounts</CardTitle>
          <CardAction>
            <Button size="sm" onClick={() => setAdding(true)}>
              <Plus />
              Add connection
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          <ConnectionsTable connections={data.connections} />
        </CardContent>
      </Card>
      {sheet}
    </main>
  )
}
