import { useState } from "react"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { useConfigSchema, useSaveGlobalConfig, type ConfigOverride, type GlobalConfig } from "./api"
import { ConfigFields } from "./ConfigFields"
import type { ConfigTab } from "./tabs"
import {
  INHERIT,
  baseConfig,
  isDirty,
  toForm,
  toSettings,
  validateForm,
  withoutDefaults,
  type FormState,
} from "./settingsForm"

// Rendered once the global config has loaded, so the form starts from it.
export function GlobalConfigForm(props: {
  global: GlobalConfig
  tab: ConfigTab
  onTabChange: (tab: ConfigTab) => void
}) {
  const { global } = props
  const save = useSaveGlobalConfig()
  const schema = useConfigSchema()
  const [form, setForm] = useState<FormState>(() => toForm(global.settings))
  // Fields left unset show what the selected profile and the defaults give.
  const inherited = schema.data && baseConfig(schema.data, form.profile === INHERIT ? undefined : form.profile)
  const finish = (settings: ConfigOverride) => (schema.data ? withoutDefaults(settings, schema.data) : settings)
  const dirty = isDirty(global.settings, form, finish)
  const errors = validateForm(form)
  const valid = Object.keys(errors).length === 0

  async function submit(settings: GlobalConfig["settings"], message: string) {
    try {
      const saved = await save.mutateAsync(settings)
      setForm(toForm(saved.settings))
      toast.success(message)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the global config")
    }
  }

  return (
    <ConfigFields
      mode="global"
      form={form}
      onChange={setForm}
      tab={props.tab}
      onTabChange={props.onTabChange}
      config={global.config}
      sources={global.sources}
      inherited={inherited}
      errors={errors}
      notices={
        global.warnings.length > 0 && (
          <Alert>
            <AlertDescription>
              {global.warnings.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
            </AlertDescription>
          </Alert>
        )
      }
      footer={
        <div className="flex flex-wrap items-center gap-2 border-t pt-4">
          <Button
            onClick={() => submit(finish(toSettings(global.settings, form)), "Global config saved")}
            disabled={save.isPending || !dirty || !valid}
          >
            {save.isPending && <Loader2 className="animate-spin" />}
            Save global config
          </Button>
          <Button
            variant="outline"
            onClick={() => submit({}, "Global config reset")}
            disabled={save.isPending || Object.keys(global.settings).length === 0}
          >
            Reset to defaults
          </Button>
          {dirty && <span className="text-sm text-muted-foreground">Unsaved changes</span>}
        </div>
      }
    />
  )
}
