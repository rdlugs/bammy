import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useSearchParams } from "react-router"
import { Loader2, Plug, Plus } from "lucide-react"
import { toast } from "sonner"
import { z } from "zod"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Field, FieldGroup } from "@/components/ui/field"
import { Separator } from "@/components/ui/separator"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { TextField } from "@/features/auth/TextField"
import { applyServerErrors } from "@/features/auth/applyServerErrors"
import {
  useConnectToken,
  useConnections,
  useDeleteConnection,
  type Connection,
  type TokenConnectInput,
} from "@/features/forge/api"
import { PROVIDER_IDS, PROVIDERS, type TokenMethod } from "@/features/forge/providers"
import type { Provider } from "@/features/reviews/types"
import { Choice } from "@/components/choice"

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

function RemoveButton({ connection }: { connection: Connection }) {
  const [confirming, setConfirming] = useState(false)
  const remove = useDeleteConnection()

  async function onClick() {
    if (!confirming) {
      setConfirming(true)
      return
    }
    try {
      await remove.mutateAsync(connection.id)
      toast.success("Connection removed")
    } catch {
      toast.error("Could not remove the connection")
      setConfirming(false)
    }
  }

  return (
    <Button
      variant={confirming ? "destructive" : "ghost"}
      size="sm"
      onClick={onClick}
      onBlur={() => setConfirming(false)}
      disabled={remove.isPending}
    >
      {confirming ? "Confirm remove" : "Remove"}
    </Button>
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
  const [hostingId, setHostingId] = useState<string>("")

  const provider = PROVIDERS[providerId]
  // A hosting choice made for another provider falls back to this one's first.
  const hosting = provider.hosting.find((option) => option.id === hostingId) ?? provider.hosting[0]!
  const method = hosting.method

  function handleOpenChange(next: boolean) {
    if (!next) {
      setProviderId(PROVIDER_IDS[0]!)
      setHostingId("")
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
          <Choice
            label="Provider"
            value={providerId}
            onChange={setProviderId}
            options={PROVIDER_IDS.map((id) => ({ value: id, label: PROVIDERS[id].label }))}
          />
          {provider.hosting.length > 1 && (
            <Choice
              label="Hosting"
              value={hosting.id}
              onChange={setHostingId}
              options={provider.hosting.map((option) => ({ value: option.id, label: option.label }))}
            />
          )}
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
                key={`${providerId}-${hosting.id}`}
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
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead>Forge</TableHead>
                <TableHead>Host</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.connections.map((connection) => (
                <TableRow key={connection.id}>
                  <TableCell className="font-medium">{connection.accountLogin}</TableCell>
                  <TableCell>
                    <Badge variant="outline">
                        {PROVIDERS[connection.provider].kindLabel[connection.kind] ?? connection.kind}
                      </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{connection.host}</TableCell>
                  <TableCell className="text-right">
                    <RemoveButton connection={connection} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      {sheet}
    </main>
  )
}
