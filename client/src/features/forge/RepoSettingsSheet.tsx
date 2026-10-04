import { useState } from "react"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import { useConfigSchema, useRepoConfig, useSaveRepoSettings, type ForgeRepo } from "./api"
import { INHERIT, toForm, toSettings, type FormState } from "./settingsForm"

const SOURCE_LABEL: Record<string, string> = {
  default: "default",
  profile: "profile",
  repoSettings: "these settings",
  repoFile: "repository file",
  trigger: "trigger",
}

function ChoiceField(props: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
  effective?: string
}) {
  return (
    <Field>
      <FieldLabel htmlFor={props.id}>{props.label}</FieldLabel>
      <Select value={props.value} onValueChange={props.onChange}>
        <SelectTrigger id={props.id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={INHERIT}>Inherit</SelectItem>
          {props.options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {props.effective && <FieldDescription>{props.effective}</FieldDescription>}
    </Field>
  )
}

const ON_OFF = [
  { value: "on", label: "On" },
  { value: "off", label: "Off" },
]

export function RepoSettingsSheet({ repo, onClose }: { repo: ForgeRepo | null; onClose: () => void }) {
  return (
    <Sheet open={Boolean(repo)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="overflow-y-auto sm:max-w-md">
        {/* Keyed so each repository starts from its own saved settings. */}
        {repo && <SettingsForm key={repo.externalId} repo={repo} onClose={onClose} />}
      </SheetContent>
    </Sheet>
  )
}

function SettingsForm({ repo, onClose }: { repo: ForgeRepo; onClose: () => void }) {
  const resolved = useRepoConfig(repo.id)
  const schema = useConfigSchema()
  const save = useSaveRepoSettings()
  const [form, setForm] = useState<FormState>(() => toForm(repo.settings))

  const set = (key: keyof FormState) => (value: string) => setForm((f) => ({ ...f, [key]: value }))

  function effective(path: string, value: unknown) {
    if (!resolved.data) return undefined
    const source = resolved.data.sources[path]
    const shown = typeof value === "boolean" ? (value ? "on" : "off") : String(value)
    return `Effective: ${shown}${source ? ` (from ${SOURCE_LABEL[source] ?? source})` : ""}`
  }

  async function onSave() {
    if (!repo.id) return
    try {
      await save.mutateAsync({ repoId: repo.id, settings: toSettings(repo.settings, form) })
      toast.success("Settings saved")
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save settings")
    }
  }

  const config = resolved.data?.config
  const severities = (schema.data?.severities ?? []).map((s) => ({ value: s, label: s }))
  const profiles = Object.keys(schema.data?.profiles ?? {}).map((p) => ({ value: p, label: p }))

  return (
    <>
      <SheetHeader>
        <SheetTitle>{repo.fullPath}</SheetTitle>
        <SheetDescription>
          Overrides saved here sit below a <code>.bammy.yaml</code> in the repository and above the profile.
        </SheetDescription>
      </SheetHeader>
      <div className="flex flex-col gap-4 px-4">
        {resolved.data && (resolved.data.repoFile || resolved.data.warnings.length > 0) && (
          <Alert>
            <AlertDescription>
              {resolved.data.repoFile && (
                <p>
                  <code>{resolved.data.repoFile}</code> on <code>{resolved.data.ref}</code> also applies.
                </p>
              )}
              {resolved.data.warnings.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
            </AlertDescription>
          </Alert>
        )}
        <FieldGroup>
          <ChoiceField
            id="profile"
            label="Profile"
            value={form.profile}
            onChange={set("profile")}
            options={profiles}
            effective={config && effective("profile", config.profile)}
          />
          <Field>
            <FieldLabel htmlFor="model">Model</FieldLabel>
            <Input
              id="model"
              value={form.model}
              onChange={(e) => set("model")(e.target.value)}
              placeholder={config?.llm.model ?? "anthropic/claude-sonnet-5-5"}
            />
            <FieldDescription>provider/model; leave empty to inherit.</FieldDescription>
          </Field>
          <ChoiceField
            id="severity-floor"
            label="Report findings at or above"
            value={form.severityFloor}
            onChange={set("severityFloor")}
            options={severities}
            effective={config && effective("review.severityFloor", config.review.severityFloor)}
          />
          <ChoiceField
            id="block-on"
            label="Block at or above"
            value={form.blockOn}
            onChange={set("blockOn")}
            options={severities}
            effective={config && effective("review.blockOn", config.review.blockOn)}
          />
          <ChoiceField
            id="walkthrough"
            label="Walkthrough"
            value={form.walkthrough}
            onChange={set("walkthrough")}
            options={ON_OFF}
            effective={config && effective("output.walkthrough", config.output.walkthrough)}
          />
          <ChoiceField
            id="post-inline"
            label="Post inline comments"
            value={form.postInline}
            onChange={set("postInline")}
            options={ON_OFF}
            effective={config && effective("output.postInline", config.output.postInline)}
          />
          <ChoiceField
            id="on-push"
            label="Review automatically on push"
            value={form.onPush}
            onChange={set("onPush")}
            options={ON_OFF}
            effective={config && effective("triggers.onPush", config.triggers.onPush)}
          />
          <ChoiceField
            id="drafts"
            label="Review drafts automatically"
            value={form.drafts}
            onChange={set("drafts")}
            options={ON_OFF}
            effective={config && effective("triggers.drafts", config.triggers.drafts)}
          />
          <Field>
            <FieldLabel htmlFor="instructions">Repository guidance</FieldLabel>
            <Textarea
              id="instructions"
              value={form.instructions}
              onChange={(e) => set("instructions")(e.target.value)}
              placeholder="Controllers stay thin; business logic lives in services."
              rows={4}
            />
          </Field>
        </FieldGroup>
      </div>
      <SheetFooter>
        <Button onClick={onSave} disabled={save.isPending || !repo.id}>
          {save.isPending && <Loader2 className="animate-spin" />}
          Save settings
        </Button>
      </SheetFooter>
    </>
  )
}
