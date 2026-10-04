import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { KeyRound, Loader2, Plus } from "lucide-react"
import { toast } from "sonner"
import { z } from "zod"
import { SearchableSelect } from "@/components/SearchableSelect"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Separator } from "@/components/ui/separator"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { TextField } from "@/features/auth/TextField"
import { applyServerErrors } from "@/features/auth/applyServerErrors"
import {
  useApiKeys,
  useApiKeyStatuses,
  useDeleteApiKey,
  useSaveApiKey,
  type ApiKey,
  type LlmProvider,
} from "./api"
import { ApiKeyStatusBadge } from "./ApiKeyStatusBadge"
import { LLM_PROVIDERS } from "./providers"

type KeyInput = { apiKey: string; baseUrl: string }

function isHttpUrl(value: string) {
  try {
    return ["http:", "https:"].includes(new URL(value).protocol)
  } catch {
    return false
  }
}

function keySchema(provider: LlmProvider, customHost: boolean) {
  return z
    .object({ apiKey: z.string().trim().max(500), baseUrl: z.string().trim().max(500) })
    .superRefine((value, context) => {
      if (provider !== "ollama" && value.apiKey.length < 8) {
        context.addIssue({ code: "custom", path: ["apiKey"], message: "That does not look like an API key" })
      }
      if (customHost && !isHttpUrl(value.baseUrl)) {
        context.addIssue({ code: "custom", path: ["baseUrl"], message: "Enter an http or https URL" })
      }
    })
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleDateString(undefined, { dateStyle: "medium" }) : null
}

function KeyForm({ credential, onSaved }: { credential: ApiKey; onSaved: () => void }) {
  const save = useSaveApiKey()
  const provider = LLM_PROVIDERS[credential.provider]
  const [customHost, setCustomHost] = useState(credential.provider === "ollama" || Boolean(credential.baseUrl))
  const form = useForm<KeyInput>({
    resolver: zodResolver(keySchema(credential.provider, customHost)),
    defaultValues: {
      apiKey: "",
      baseUrl: credential.baseUrl ?? provider.defaultBaseUrl ?? "",
    },
  })

  async function onSubmit(values: KeyInput) {
    try {
      await save.mutateAsync({
        provider: credential.provider,
        apiKey: values.apiKey.trim() || undefined,
        baseUrl: customHost ? values.baseUrl.trim() : undefined,
      })
      toast.success(`${provider.label} connection verified and saved`)
      onSaved()
    } catch (error) {
      applyServerErrors(error, form.setError)
    }
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="flex flex-col gap-5">
      <FieldGroup>
        {credential.provider !== "ollama" && (
          <Field orientation="horizontal">
            <FieldLabel htmlFor="custom-host">Use custom host</FieldLabel>
            <Switch
              id="custom-host"
              checked={customHost}
              onCheckedChange={setCustomHost}
              aria-label="Use custom host"
            />
          </Field>
        )}
        {customHost && (
          <>
            <TextField
              control={form.control}
              name="baseUrl"
              label="API base URL"
              type="url"
              placeholder={provider.defaultBaseUrl ?? "https://api.example.com/v1"}
            />
            {credential.provider === "ollama" && (
              <FieldDescription>
                From Docker, use <code>host.docker.internal</code> for Ollama running on this machine.
              </FieldDescription>
            )}
          </>
        )}
        <TextField
          control={form.control}
          name="apiKey"
          label={`${provider.label} API key${credential.provider === "ollama" ? " (optional)" : ""}`}
          type="password"
          autoComplete="off"
          placeholder={provider.keyPlaceholder}
        />
      </FieldGroup>
      <Button type="submit" disabled={form.formState.isSubmitting}>
        {form.formState.isSubmitting && <Loader2 className="animate-spin" />}
        {form.formState.isSubmitting
          ? "Checking connection..."
          : credential.stored
            ? "Check and replace"
            : "Check and save"}
      </Button>
    </form>
  )
}

function defaultProvider(keys: ApiKey[], preferred?: LlmProvider) {
  return preferred ?? keys.find((key) => !key.stored)?.provider ?? keys[0]!.provider
}

function AddApiKeySheet({
  keys,
  open,
  initialProvider,
  onOpenChange,
}: {
  keys: ApiKey[]
  open: boolean
  initialProvider?: LlmProvider
  onOpenChange: (open: boolean) => void
}) {
  const [picked, setPicked] = useState<LlmProvider | null>(null)
  const providerId = picked ?? defaultProvider(keys, initialProvider)
  const credential = keys.find((key) => key.provider === providerId)!

  function handleOpenChange(next: boolean) {
    if (!next) setPicked(null)
    onOpenChange(next)
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent className="overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Add API key</SheetTitle>
          <SheetDescription>Choose a provider and verify its credentials. Keys are encrypted at rest.</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-6 px-4 pb-4">
          <Field>
            <FieldLabel htmlFor="provider">Provider</FieldLabel>
            <SearchableSelect
              id="provider"
              value={providerId}
              onValueChange={(value) => setPicked(value as LlmProvider)}
              options={keys.map((key) => ({
                value: key.provider,
                label: LLM_PROVIDERS[key.provider].label,
                icon: LLM_PROVIDERS[key.provider].icon,
              }))}
            />
          </Field>
          <Separator />
          <section className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              {LLM_PROVIDERS[providerId].keyUrl
                ? `Create a key at ${LLM_PROVIDERS[providerId].keyUrl}.`
                : "Connect to an Ollama server that exposes its OpenAI-compatible API."}
              {credential.stored
                ? credential.last4
                  ? ` A key ending in ${credential.last4} is stored. Saving replaces it.`
                  : " A host without an API key is stored."
                : credential.serverDefault
                  ? " Reviews currently use the server's key."
                  : ""}
            </p>
            <KeyForm key={providerId} credential={credential} onSaved={() => handleOpenChange(false)} />
          </section>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function RemoveButton({ apiKey }: { apiKey: ApiKey }) {
  const [confirming, setConfirming] = useState(false)
  const remove = useDeleteApiKey()
  const { label } = LLM_PROVIDERS[apiKey.provider]

  async function onClick() {
    if (!confirming) {
      setConfirming(true)
      return
    }
    try {
      await remove.mutateAsync(apiKey.provider)
      toast.success(`${label} key removed`)
    } catch {
      toast.error("Could not remove the key")
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
      aria-label={confirming ? `Confirm remove ${label} key` : `Remove ${label} key`}
    >
      {confirming ? "Confirm remove" : "Remove"}
    </Button>
  )
}

function KeyList({ keys, onReplace }: { keys: ApiKey[]; onReplace: (provider: LlmProvider) => void }) {
  const stored = keys.filter((key) => key.stored)
  const statuses = useApiKeyStatuses(stored)

  if (!stored.length) {
    const serverKeys = keys.filter((key) => key.serverDefault).map((key) => LLM_PROVIDERS[key.provider].label)
    return (
      <Empty className="border border-dashed">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <KeyRound />
          </EmptyMedia>
          <EmptyTitle>No API keys yet</EmptyTitle>
          <EmptyDescription>
            Add a provider credential to use your own account or API host.
            {serverKeys.length > 0 && ` Until then, reviews use the server's key for ${serverKeys.join(", ")}.`}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <ul className="flex flex-col divide-y">
      {stored.map((key) => {
        const { label } = LLM_PROVIDERS[key.provider]
        return (
          <li key={key.provider} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3 first:pt-0 last:pb-0">
            <div className="flex min-w-0 flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="font-medium">{label}</span>
                <ApiKeyStatusBadge status={statuses[key.provider]} />
              </div>
              <span className="text-xs text-muted-foreground">
                {key.last4 && <span className="font-mono">••••{key.last4}</span>}
                {key.baseUrl && (
                  <span className="break-all">
                    {key.last4 ? " · " : ""}
                    {key.baseUrl}
                  </span>
                )}
                {key.updatedAt && ` · Updated ${formatDate(key.updatedAt)}`}
              </span>
            </div>
            <div className="ml-auto flex gap-1">
              <Button
                size="sm"
                variant="outline"
                onClick={() => onReplace(key.provider)}
                aria-label={`Replace ${label} connection`}
              >
                Replace
              </Button>
              <RemoveButton apiKey={key} />
            </div>
          </li>
        )
      })}
    </ul>
  )
}

export function ApiKeysCard() {
  const { data, isLoading, error } = useApiKeys()
  const [sheet, setSheet] = useState<{ open: boolean; provider?: LlmProvider }>({ open: false })

  let body
  if (isLoading) {
    body = (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-10" />
        <Skeleton className="h-10" />
      </div>
    )
  } else if (error || !data) {
    body = <p className="text-sm text-destructive">Could not load your API keys.</p>
  } else {
    body = <KeyList keys={data.keys} onReplace={(provider) => setSheet({ open: true, provider })} />
  }

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>LLM connections</CardTitle>
        <CardDescription>
          Reviews use these verified provider credentials and custom API hosts.
        </CardDescription>
        <CardAction>
          <Button size="sm" disabled={!data?.keys.length} onClick={() => setSheet({ open: true })}>
            <Plus />
            Add API key
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>{body}</CardContent>
      {data?.keys.length ? (
        <AddApiKeySheet
          keys={data.keys}
          open={sheet.open}
          initialProvider={sheet.provider}
          onOpenChange={(open) => setSheet((current) => ({ ...current, open }))}
        />
      ) : null}
    </Card>
  )
}
