import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { KeyRound, Loader2, Plus } from "lucide-react"
import { toast } from "sonner"
import { z } from "zod"
import { Choice } from "@/components/choice"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Separator } from "@/components/ui/separator"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { TextField } from "@/features/auth/TextField"
import { applyServerErrors } from "@/features/auth/applyServerErrors"
import { useApiKeys, useDeleteApiKey, useSaveApiKey, type ApiKey, type LlmProvider } from "./api"

const PROVIDERS: Record<LlmProvider, { label: string; placeholder: string; keyUrl: string }> = {
  anthropic: { label: "Anthropic", placeholder: "sk-ant-...", keyUrl: "console.anthropic.com" },
  openai: { label: "OpenAI", placeholder: "sk-...", keyUrl: "platform.openai.com/api-keys" },
  google: { label: "Google", placeholder: "AIza...", keyUrl: "aistudio.google.com/apikey" },
}

const keySchema = z.object({ apiKey: z.string().trim().min(8, "That does not look like an API key") })
type KeyInput = z.infer<typeof keySchema>

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleDateString(undefined, { dateStyle: "medium" }) : null
}

function KeyForm({ apiKey, onSaved }: { apiKey: ApiKey; onSaved: () => void }) {
  const save = useSaveApiKey()
  const { label, placeholder } = PROVIDERS[apiKey.provider]
  const form = useForm<KeyInput>({ resolver: zodResolver(keySchema), defaultValues: { apiKey: "" } })

  async function onSubmit(values: KeyInput) {
    try {
      await save.mutateAsync({ provider: apiKey.provider, apiKey: values.apiKey })
      toast.success(`${label} key saved`)
      onSaved()
    } catch (error) {
      applyServerErrors(error, form.setError)
    }
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="flex flex-col gap-3">
      <TextField
        control={form.control}
        name="apiKey"
        label={`${label} API key`}
        type="password"
        autoComplete="off"
        placeholder={placeholder}
      />
      <Button type="submit" disabled={form.formState.isSubmitting}>
        {form.formState.isSubmitting && <Loader2 className="animate-spin" />}
        {apiKey.stored ? "Replace key" : "Save key"}
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
  const apiKey = keys.find((key) => key.provider === providerId)!

  function handleOpenChange(next: boolean) {
    if (!next) setPicked(null)
    onOpenChange(next)
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent className="overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Add API key</SheetTitle>
          <SheetDescription>Choose a provider and paste its key. Keys are encrypted at rest.</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-6 px-4 pb-4">
          <Choice
            label="Provider"
            value={providerId}
            onChange={setPicked}
            options={keys.map((key) => ({ value: key.provider, label: PROVIDERS[key.provider].label }))}
          />
          <Separator />
          <section className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              Create a key at <span className="font-medium text-foreground">{PROVIDERS[providerId].keyUrl}</span>.
              {apiKey.stored
                ? ` A key ending in ${apiKey.last4} is stored. Saving replaces it.`
                : apiKey.serverDefault
                  ? " Reviews currently use the server's key."
                  : ""}
            </p>
            <KeyForm key={providerId} apiKey={apiKey} onSaved={() => handleOpenChange(false)} />
          </section>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function RemoveButton({ apiKey }: { apiKey: ApiKey }) {
  const [confirming, setConfirming] = useState(false)
  const remove = useDeleteApiKey()
  const { label } = PROVIDERS[apiKey.provider]

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

  if (!stored.length) {
    const serverKeys = keys.filter((key) => key.serverDefault).map((key) => PROVIDERS[key.provider].label)
    return (
      <Empty className="border border-dashed">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <KeyRound />
          </EmptyMedia>
          <EmptyTitle>No API keys yet</EmptyTitle>
          <EmptyDescription>
            Add a key and reviews of your repositories bill to your own account.
            {serverKeys.length > 0 && ` Until then, reviews use the server's key for ${serverKeys.join(", ")}.`}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <ul className="flex flex-col divide-y">
      {stored.map((key) => {
        const { label } = PROVIDERS[key.provider]
        return (
          <li key={key.provider} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3 first:pt-0 last:pb-0">
            <div className="flex min-w-0 flex-col">
              <span className="font-medium">{label}</span>
              <span className="text-xs text-muted-foreground">
                <span className="font-mono">••••{key.last4}</span>
                {key.updatedAt && ` · Updated ${formatDate(key.updatedAt)}`}
              </span>
            </div>
            <div className="ml-auto flex gap-1">
              <Button
                size="sm"
                variant="outline"
                onClick={() => onReplace(key.provider)}
                aria-label={`Replace ${label} key`}
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
        <CardTitle>LLM API keys</CardTitle>
        <CardDescription>
          Reviews of your repositories use your own key when one is stored, so usage bills to you.
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
