import type { ReactNode } from "react"
import { Plus, RotateCcw, Trash2 } from "lucide-react"
import { SearchableSelect } from "@/components/SearchableSelect"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useApiKeys } from "@/features/settings/api"
import { useConfigSchema, type EffectiveConfig, type LlmProviderName } from "./api"
import { ReviewPreview, type PreviewSettings } from "./ReviewPreview"
import { CONFIG_TABS, TAB_ERRORS, type ConfigTab } from "./tabs"
import {
  AUTO,
  FLAGS,
  INHERIT,
  MAX_FALLBACK_MODELS,
  NUMBERS,
  PROVIDER_KEYS,
  type FlagName,
  type FormErrors,
  type FormState,
  type NumberName,
} from "./settingsForm"

const SOURCE_LABEL: Record<string, string> = {
  default: "default",
  profile: "profile",
  global: "global config",
  repoSettings: "these settings",
  repoFile: "repository file",
  trigger: "trigger",
}

const FLAG_INFO: Record<FlagName, { label: string; description: ReactNode }> = {
  requireEvidence: {
    label: "Require evidence",
    description: "Critical and major findings without evidence are demoted instead of blocking.",
  },
  fullFile: { label: "Comment on untouched lines", description: "Allow findings outside the lines the change touched." },
  committableSuggestions: {
    label: "Committable suggestions",
    description: "Offer fixes as suggestions that can be applied from the forge.",
  },
  walkthrough: { label: "Walkthrough", description: "Summarise what the change does in the summary comment." },
  postInline: { label: "Post inline comments", description: "Comment on the lines each finding refers to." },
  postSummary: { label: "Post summary comment", description: "Post the review summary as a comment on the change." },
  postCheck: { label: "Post commit status", description: "Report the verdict as the bammy/review status." },
  onPush: {
    label: "Review automatically on push",
    description: "Review when a pull or merge request is opened or receives new commits.",
  },
  drafts: { label: "Review drafts automatically", description: "Include drafts in automatic reviews." },
  command: {
    label: "Allow review command",
    description: (
      <>
        Commenting <code>/bammy review</code> requests a review.
      </>
    ),
  },
}

const PROVIDER_LABEL: Record<LlmProviderName, string> = { anthropic: "Anthropic", openai: "OpenAI", google: "Google" }

// What an unset base URL means.
const OFFICIAL_API = "each provider's official API"
const PROVIDER_KEYS_LABEL = "Each model's provider key"

function keyLabel(provider: LlmProviderName | null) {
  return provider ? `${PROVIDER_LABEL[provider]} key` : PROVIDER_KEYS_LABEL.toLowerCase()
}

const NUMBER_INFO: Record<NumberName, { label: string; description: string }> = {
  temperature: { label: "Temperature", description: "Lower is more deterministic." },
  maxTokens: { label: "Max output tokens", description: "Per model call." },
  contextBudget: {
    label: "Context budget",
    description: `Prompt token ceiling per chunk; "${AUTO}" derives it from the model's context window.`,
  },
  maxFindings: { label: "Max findings", description: "The most findings a review reports." },
  maxChunks: { label: "Max chunks", description: "Large changes are split into at most this many passes." },
  minConfidence: { label: "Min confidence", description: "Findings the model is less sure of are dropped (0 to 1)." },
}

// "x (from y)" for any config value, e.g. "critical (from global config)".
function describe(value: unknown, source: string | undefined) {
  let shown: string
  if (typeof value === "boolean") shown = value ? "on" : "off"
  else if (value === null) shown = AUTO
  else if (Array.isArray(value)) shown = value.length ? value.join(", ") : "none"
  else if (typeof value === "object" && value !== undefined) shown = Object.keys(value).join(", ") || "none"
  else shown = String(value)
  return `${shown}${source ? ` (from ${SOURCE_LABEL[source] ?? source})` : ""}`
}

function ResetButton(props: { label: string; hint?: string; onClick: () => void; disabled?: boolean }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={`Reset ${props.label} to inherited`}
          onClick={props.onClick}
          disabled={props.disabled}
        >
          <RotateCcw />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{props.hint ? `Inherit: ${props.hint}` : "Inherit"}</TooltipContent>
    </Tooltip>
  )
}

// A text field where empty means "not set here"; `emptyHint` says what that gives.
function TextField(props: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  description: ReactNode
  emptyHint: string
  placeholder?: string
  multiline?: boolean
  inputMode?: "numeric" | "decimal"
  type?: string
  min?: number
  max?: number
  step?: number
  effective?: string
  error?: string
  disabled?: boolean
}) {
  const shared = {
    id: props.id,
    value: props.value,
    placeholder: props.placeholder,
    disabled: props.disabled,
    "aria-invalid": props.error ? true : undefined,
  }
  return (
    <Field data-disabled={props.disabled} data-invalid={props.error ? true : undefined}>
      <FieldLabel htmlFor={props.id}>{props.label}</FieldLabel>
      {props.multiline ? (
        <Textarea {...shared} rows={4} onChange={(e) => props.onChange(e.target.value)} />
      ) : (
        <Input
          {...shared}
          type={props.type}
          inputMode={props.inputMode}
          min={props.min}
          max={props.max}
          step={props.step}
          onChange={(e) => props.onChange(e.target.value)}
        />
      )}
      <FieldDescription>
        {props.description} {props.emptyHint}
      </FieldDescription>
      {props.effective && <FieldDescription className="text-xs">{props.effective}</FieldDescription>}
      {props.error && <FieldError>{props.error}</FieldError>}
    </Field>
  )
}

function CategoriesField(props: {
  options: string[]
  value: string[] | undefined
  inherited: string[] | undefined
  onChange: (value: string[] | undefined) => void
  resettable: boolean
  inheritedHint?: string
  effective?: string
  error?: string
  disabled?: boolean
}) {
  const overridden = props.resettable && props.value !== undefined
  const checked = props.value ?? props.inherited
  // Like a toggle, there is nothing truthful to show before the inherited value loads.
  const disabled = props.disabled || checked === undefined

  function toggle(category: string, on: boolean) {
    const current = new Set(checked)
    if (on) current.add(category)
    else current.delete(category)
    // Kept in the schema's order so an unchanged selection compares equal.
    props.onChange(props.options.filter((option) => current.has(option)))
  }

  return (
    <FieldSet data-disabled={disabled} data-invalid={props.error ? true : undefined}>
      <div className="flex items-center gap-2">
        <FieldLegend variant="label">Categories</FieldLegend>
        {overridden && <Badge variant="secondary">Overridden</Badge>}
        {overridden && (
          <ResetButton
            label="Categories"
            hint={props.inheritedHint}
            onClick={() => props.onChange(undefined)}
            disabled={props.disabled}
          />
        )}
      </div>
      <FieldDescription>What kinds of issues the reviewer looks for.</FieldDescription>
      <div className="grid grid-cols-2 gap-2 @md/field-group:grid-cols-3">
        {props.options.map((category) => {
          const id = `category-${category}`
          return (
            <Field key={category} orientation="horizontal" data-disabled={disabled}>
              <Checkbox
                id={id}
                checked={checked?.includes(category) ?? false}
                onCheckedChange={(on) => toggle(category, on === true)}
                disabled={disabled}
              />
              <FieldLabel htmlFor={id} className="font-normal">
                {category}
              </FieldLabel>
            </Field>
          )
        })}
      </div>
      {props.effective && <FieldDescription className="text-xs">{props.effective}</FieldDescription>}
      {props.error && <FieldError>{props.error}</FieldError>}
    </FieldSet>
  )
}

function LanguageInstructionsField(props: {
  rows: FormState["languageInstructions"]
  onChange: (rows: FormState["languageInstructions"]) => void
  isRepo: boolean
  effective?: string
  error?: string
  disabled?: boolean
}) {
  const { rows } = props
  const update = (index: number, change: Partial<FormState["languageInstructions"][number]>) =>
    props.onChange(rows.map((row, i) => (i === index ? { ...row, ...change } : row)))

  return (
    <FieldSet data-disabled={props.disabled} data-invalid={props.error ? true : undefined}>
      <FieldLegend variant="label">Language guidance</FieldLegend>
      <FieldDescription>
        Extra guidance for files in one language.
        {props.isRepo && " Added to the inherited languages; a language listed here replaces its inherited guidance."}
      </FieldDescription>
      {rows.map((row, index) => (
        <div key={index} className="flex flex-col gap-2 rounded-lg border p-3">
          <div className="flex items-center gap-2">
            <Input
              aria-label={`Language ${index + 1}`}
              value={row.language}
              onChange={(e) => update(index, { language: e.target.value })}
              placeholder="TypeScript"
              disabled={props.disabled}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Remove language ${index + 1}`}
              onClick={() => props.onChange(rows.filter((_, i) => i !== index))}
              disabled={props.disabled}
            >
              <Trash2 />
            </Button>
          </div>
          <Textarea
            aria-label={`Guidance for language ${index + 1}`}
            value={row.text}
            onChange={(e) => update(index, { text: e.target.value })}
            placeholder="Prefer type narrowing over casts."
            rows={2}
            disabled={props.disabled}
          />
        </div>
      ))}
      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => props.onChange([...rows, { language: "", text: "" }])}
          disabled={props.disabled}
        >
          <Plus />
          Add language
        </Button>
      </div>
      {props.effective && <FieldDescription className="text-xs">{props.effective}</FieldDescription>}
      {props.error && <FieldError>{props.error}</FieldError>}
    </FieldSet>
  )
}

function FallbackModelsField(props: {
  rows: string[]
  onChange: (rows: string[]) => void
  emptyHint: string
  effective?: string
  error?: string
  disabled?: boolean
}) {
  const { rows } = props
  return (
    <FieldSet data-disabled={props.disabled} data-invalid={props.error ? true : undefined}>
      <FieldLegend variant="label">Fallback models</FieldLegend>
      <FieldDescription>
        Tried in order when the model fails, up to {MAX_FALLBACK_MODELS}. {props.emptyHint}
      </FieldDescription>
      {rows.map((model, index) => (
        <div key={index} className="flex items-center gap-2">
          <Input
            aria-label={`Fallback model ${index + 1}`}
            value={model}
            onChange={(e) => props.onChange(rows.map((row, i) => (i === index ? e.target.value : row)))}
            placeholder="openai/gpt-5"
            disabled={props.disabled}
            aria-invalid={props.error ? true : undefined}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Remove fallback model ${index + 1}`}
            onClick={() => props.onChange(rows.filter((_, i) => i !== index))}
            disabled={props.disabled}
          >
            <Trash2 />
          </Button>
        </div>
      ))}
      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => props.onChange([...rows, ""])}
          disabled={props.disabled || rows.length >= MAX_FALLBACK_MODELS}
        >
          <Plus />
          Add fallback model
        </Button>
      </div>
      {props.effective && <FieldDescription className="text-xs">{props.effective}</FieldDescription>}
      {props.error && <FieldError>{props.error}</FieldError>}
    </FieldSet>
  )
}

function ChoiceField(props: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
  // Present in a repository, where the field can fall back to the global config;
  // the description says what that currently resolves to.
  inherit?: { description?: string }
  // Shown instead of "inherit" when there is no Inherit option.
  fallback?: string
  description?: string
  effective?: string
  disabled?: boolean
}) {
  const { inherit } = props
  const value = !inherit && props.value === INHERIT ? (props.fallback ?? INHERIT) : props.value
  return (
    <Field data-disabled={props.disabled}>
      <FieldLabel htmlFor={props.id}>{props.label}</FieldLabel>
      <SearchableSelect
        id={props.id}
        value={value}
        onValueChange={props.onChange}
        disabled={props.disabled}
        options={
          inherit ? [{ value: INHERIT, label: "Inherit", description: inherit.description }, ...props.options] : props.options
        }
      />
      {props.description && <FieldDescription>{props.description}</FieldDescription>}
      {props.effective && <FieldDescription className="text-xs">{props.effective}</FieldDescription>}
    </Field>
  )
}

// A switch over a tri-state value: it shows the override when there is one and
// the inherited value otherwise, so "inherit" stays reachable through reset.
function ToggleField(props: {
  name: FlagName
  value: boolean | undefined
  inherited: boolean | undefined
  onChange: (value: boolean | undefined) => void
  // Only a repository can go back to inheriting; the global config just holds a value.
  resettable: boolean
  inheritedHint?: string
  effective?: string
  disabled?: boolean
}) {
  const { label, description } = FLAG_INFO[props.name]
  const id = `flag-${props.name}`
  const overridden = props.resettable && props.value !== undefined
  // Without an override or a resolved value there is nothing truthful to show yet.
  const disabled = props.disabled || (!overridden && props.inherited === undefined)

  return (
    <Field orientation="horizontal" data-disabled={disabled}>
      <FieldContent>
        <div className="flex items-center gap-2">
          <FieldLabel htmlFor={id}>{label}</FieldLabel>
          {overridden && <Badge variant="secondary">Overridden</Badge>}
        </div>
        <FieldDescription>{description}</FieldDescription>
        {props.effective && <FieldDescription className="text-xs">{props.effective}</FieldDescription>}
      </FieldContent>
      <div className="flex items-center gap-2">
        {overridden && (
          <ResetButton
            label={label}
            hint={props.inheritedHint}
            onClick={() => props.onChange(undefined)}
            disabled={props.disabled}
          />
        )}
        <Switch
          id={id}
          checked={props.value ?? props.inherited ?? false}
          onCheckedChange={(checked) => props.onChange(checked)}
          disabled={disabled}
        />
      </div>
    </Field>
  )
}

// The editable subset of a review config, shared by the global config and a
// repository's overrides, split into tabs. `config`/`sources` describe the
// effective values; `inherited`/`inheritedSources` describe what a field gets
// when this scope does not set it (the profile and defaults for the global
// config, the global config for a repository). Form state lives in the caller,
// so switching tabs keeps unsaved edits and one save covers every tab.
export function ConfigFields(props: {
  mode: "global" | "repo"
  form: FormState
  onChange: (form: FormState) => void
  tab: ConfigTab
  onTabChange: (tab: ConfigTab) => void
  // Shown between the tab list and the open tab, e.g. warnings for the scope.
  notices?: ReactNode
  // The save bar, at the bottom of every tab.
  footer: ReactNode
  config?: EffectiveConfig
  sources?: Record<string, string>
  inherited?: EffectiveConfig
  inheritedSources?: Record<string, string>
  errors?: FormErrors
  disabled?: boolean
  guidanceLabel?: string
}) {
  const { mode, form, config, sources, inherited, disabled } = props
  const errors = props.errors ?? {}
  const isRepo = mode === "repo"
  const schema = useConfigSchema()
  const apiKeys = useApiKeys()
  type TextKey = "profile" | "model" | "severityFloor" | "blockOn" | "ignorePaths" | "instructions"
  const setField = (key: TextKey) => (value: string) => props.onChange({ ...form, [key]: value })
  const setFlag = (name: FlagName) => (value: boolean | undefined) =>
    props.onChange({ ...form, flags: { ...form.flags, [name]: value } })
  const setNumber = (name: NumberName) => (value: string) =>
    props.onChange({ ...form, numbers: { ...form.numbers, [name]: value } })

  function effective(path: string, value: unknown) {
    if (!config) return undefined
    return `Effective: ${describe(value, sources?.[path])}`
  }

  // What "Inherit" resolves to right now, e.g. "critical (from global config)".
  function inheritedHint(path: string, value: unknown) {
    if (!inherited || value === undefined) return undefined
    return describe(value, props.inheritedSources?.[path])
  }

  function choice(path: string, value: string | undefined) {
    return isRepo ? { inherit: { description: inheritedHint(path, value) } } : { fallback: value }
  }

  function inheritedFlag(name: FlagName) {
    const { section } = FLAGS.find((flag) => flag.name === name)!
    return inherited ? (inherited[section] as Record<string, boolean>)[name] : undefined
  }

  function toggles(names: FlagName[]) {
    return names.map((name) => {
      const { section } = FLAGS.find((flag) => flag.name === name)!
      const path = `${section}.${name}`
      const fallback = inheritedFlag(name)
      return (
        <ToggleField
          key={name}
          name={name}
          value={form.flags[name]}
          inherited={fallback}
          onChange={setFlag(name)}
          resettable={isRepo}
          inheritedHint={inheritedHint(path, fallback)}
          effective={config && effective(path, (config[section] as Record<string, boolean>)[name])}
          disabled={disabled}
        />
      )
    })
  }

  // What leaving a text field empty gives in this scope.
  function emptyHint(path: string, value: unknown) {
    if (isRepo) return `Leave empty to inherit${inherited ? ` ${inheritedHint(path, value)}` : ""}.`
    return `Leave empty to use the default${inherited ? ` (${describe(value, undefined)})` : ""}.`
  }

  function numberField(name: NumberName) {
    const spec = NUMBERS.find((number) => number.name === name)!
    const path = `${spec.section}.${name}`
    const fallback = inherited ? (inherited[spec.section] as Record<string, unknown>)[name] as number | null : undefined
    const { label, description } = NUMBER_INFO[name]
    return (
      <TextField
        id={`number-${name}`}
        label={label}
        value={form.numbers[name]}
        onChange={setNumber(name)}
        description={description}
        emptyHint={emptyHint(path, fallback)}
        placeholder={fallback === undefined ? undefined : fallback === null ? AUTO : String(fallback)}
        // The context budget also takes "auto", which a number input would reject.
        type={spec.nullable ? "text" : "number"}
        inputMode={spec.integer ? "numeric" : "decimal"}
        min={spec.nullable ? undefined : spec.min}
        max={spec.nullable ? undefined : spec.max}
        step={spec.nullable ? undefined : spec.step}
        effective={config && effective(path, (config[spec.section] as Record<string, unknown>)[name])}
        error={errors[name]}
        disabled={disabled}
      />
    )
  }

  // The preview follows the form, unsaved edits included. A repository that
  // follows the global config ignores its overrides, so it shows the global values.
  const shownFlag = (name: FlagName) => (disabled ? inheritedFlag(name) : (form.flags[name] ?? inheritedFlag(name))) ?? false
  const shownChoice = (value: string, fallback: string | undefined) =>
    disabled || value === INHERIT ? fallback : value
  const preview: PreviewSettings = {
    walkthrough: shownFlag("walkthrough"),
    postInline: shownFlag("postInline"),
    postSummary: shownFlag("postSummary"),
    postCheck: shownFlag("postCheck"),
    committableSuggestions: shownFlag("committableSuggestions"),
    severityFloor: shownChoice(form.severityFloor, inherited?.review.severityFloor),
    blockOn: shownChoice(form.blockOn, inherited?.review.blockOn),
    model: (!disabled && form.model.trim()) || inherited?.llm.model,
  }

  // Slots that hold a key, plus the saved choice even if its key was removed since.
  const endpointKeyOptions = [
    { value: PROVIDER_KEYS, label: PROVIDER_KEYS_LABEL },
    ...(apiKeys.data?.keys ?? [])
      .filter((key) => key.stored || key.serverDefault || key.provider === form.endpointKey)
      .map((key) => ({
        value: key.provider,
        label: `${PROVIDER_LABEL[key.provider]} key${
          key.stored ? ` ending in ${key.last4}` : key.serverDefault ? " (server)" : " (not stored)"
        }`,
      })),
  ]

  const severities = (schema.data?.severities ?? []).map((s) => ({ value: s, label: s }))
  const profiles = Object.keys(schema.data?.profiles ?? {}).map((p) => ({ value: p, label: p }))

  const panels: Record<ConfigTab, ReactNode> = {
    llm: (
      <>
        <div className="grid gap-4 @md/field-group:grid-cols-2">
          <ChoiceField
            id="profile"
            label="Profile"
            value={form.profile}
            onChange={setField("profile")}
            options={profiles}
            {...choice("profile", inherited?.profile)}
            description="A preset that fills in values on every tab; anything set here wins over it."
            effective={config && effective("profile", config.profile)}
            disabled={disabled}
          />
          <Field data-disabled={disabled}>
            <FieldLabel htmlFor="model">Model</FieldLabel>
            <Input
              id="model"
              value={form.model}
              onChange={(e) => setField("model")(e.target.value)}
              placeholder={inherited?.llm.model ?? config?.llm.model ?? "anthropic/claude-sonnet-5-5"}
              disabled={disabled}
              aria-invalid={errors.model ? true : undefined}
            />
            <FieldDescription>
              provider/model;{" "}
              {isRepo
                ? `leave empty to inherit${inherited ? ` ${inheritedHint("llm.model", inherited.llm.model)}` : ""}.`
                : `leave empty to use the default${inherited ? ` (${inherited.llm.model})` : ""}.`}
            </FieldDescription>
            {config && <FieldDescription className="text-xs">{effective("llm.model", config.llm.model)}</FieldDescription>}
            {errors.model && <FieldError>{errors.model}</FieldError>}
          </Field>
        </div>
        <FallbackModelsField
          rows={form.fallbackModels}
          onChange={(fallbackModels) => props.onChange({ ...form, fallbackModels })}
          emptyHint={emptyHint("llm.fallbackModels", inherited?.llm.fallbackModels)}
          effective={config && effective("llm.fallbackModels", config.llm.fallbackModels)}
          error={errors.fallbackModels}
          disabled={disabled}
        />
        <div className="grid gap-4 @md/field-group:grid-cols-2">
          <TextField
            id="base-url"
            label="Base URL"
            value={form.baseUrl}
            onChange={(baseUrl) => props.onChange({ ...form, baseUrl })}
            description={
              <>
                Send every model call to a compatible proxy such as 9router. One on this machine is reached as{" "}
                <code>http://host.docker.internal:&lt;port&gt;</code>, not <code>localhost</code>.
              </>
            }
            emptyHint={emptyHint("llm.baseUrl", inherited && (inherited.llm.baseUrl ?? OFFICIAL_API))}
            placeholder={inherited?.llm.baseUrl ?? "http://host.docker.internal:20128/v1"}
            type="url"
            effective={config && effective("llm.baseUrl", config.llm.baseUrl ?? OFFICIAL_API)}
            error={errors.baseUrl}
            disabled={disabled}
          />
          <ChoiceField
            id="endpoint-key"
            label="API key"
            value={form.endpointKey}
            onChange={(endpointKey) => props.onChange({ ...form, endpointKey })}
            options={endpointKeyOptions}
            inherit={
              isRepo
                ? { description: inherited && inheritedHint("llm.endpointKey", keyLabel(inherited.llm.endpointKey)) }
                : undefined
            }
            fallback={inherited ? (inherited.llm.endpointKey ?? PROVIDER_KEYS) : undefined}
            description="Sent to the base URL. Keys are managed in Settings > API keys."
            effective={config && effective("llm.endpointKey", keyLabel(config.llm.endpointKey))}
            disabled={disabled}
          />
        </div>
        <div className="grid gap-4 @md/field-group:grid-cols-3">
          {numberField("temperature")}
          {numberField("maxTokens")}
          {numberField("contextBudget")}
        </div>
      </>
    ),
    findings: (
      <>
        <div className="grid gap-4 @md/field-group:grid-cols-2">
          <ChoiceField
            id="severity-floor"
            label="Report findings at or above"
            value={form.severityFloor}
            onChange={setField("severityFloor")}
            options={severities}
            {...choice("review.severityFloor", inherited?.review.severityFloor)}
            effective={config && effective("review.severityFloor", config.review.severityFloor)}
            disabled={disabled}
          />
          <ChoiceField
            id="block-on"
            label="Block at or above"
            value={form.blockOn}
            onChange={setField("blockOn")}
            options={severities}
            {...choice("review.blockOn", inherited?.review.blockOn)}
            effective={config && effective("review.blockOn", config.review.blockOn)}
            disabled={disabled}
          />
        </div>
        <CategoriesField
          options={schema.data?.categories ?? []}
          value={form.categories}
          inherited={inherited?.review.categories}
          onChange={(categories) => props.onChange({ ...form, categories })}
          resettable={isRepo}
          inheritedHint={inheritedHint("review.categories", inherited?.review.categories)}
          effective={config && effective("review.categories", config.review.categories)}
          error={errors.categories}
          disabled={disabled}
        />
        <div className="grid gap-4 @md/field-group:grid-cols-2">
          {numberField("maxFindings")}
          {numberField("minConfidence")}
        </div>
        {toggles(["requireEvidence", "fullFile", "committableSuggestions"])}
      </>
    ),
    files: (
      <>
        <TextField
          id="ignore-paths"
          label="Ignore paths"
          value={form.ignorePaths}
          onChange={setField("ignorePaths")}
          description="Glob patterns for files that are never reviewed, one per line. A list here replaces the inherited one."
          emptyHint={emptyHint("ignorePaths", inherited?.ignorePaths)}
          placeholder={inherited?.ignorePaths.join("\n") || "**/generated/**"}
          multiline
          effective={config && effective("ignorePaths", config.ignorePaths)}
          error={errors.ignorePaths}
          disabled={disabled}
        />
        {numberField("maxChunks")}
      </>
    ),
    display: toggles(["walkthrough", "postInline", "postSummary", "postCheck"]),
    triggers: toggles(["onPush", "drafts", "command"]),
    guidance: (
      <>
        <Field data-disabled={disabled}>
          <FieldLabel htmlFor="instructions">{props.guidanceLabel ?? "Guidance"}</FieldLabel>
          <Textarea
            id="instructions"
            value={form.instructions}
            onChange={(e) => setField("instructions")(e.target.value)}
            placeholder="Controllers stay thin; business logic lives in services."
            rows={4}
            disabled={disabled}
            aria-invalid={errors.instructions ? true : undefined}
          />
          <FieldDescription>Project conventions passed to the reviewer with every change.</FieldDescription>
          {errors.instructions && <FieldError>{errors.instructions}</FieldError>}
        </Field>
        <LanguageInstructionsField
          rows={form.languageInstructions}
          onChange={(languageInstructions) => props.onChange({ ...form, languageInstructions })}
          isRepo={isRepo}
          effective={config && effective("languageInstructions", config.languageInstructions)}
          error={errors.languageInstructions}
          disabled={disabled}
        />
      </>
    ),
  }

  return (
    <Tabs value={props.tab} onValueChange={(value) => props.onTabChange(value as ConfigTab)}>
      <TabsList>
        {CONFIG_TABS.map((item) => {
          const invalid = TAB_ERRORS[item.value].some((key) => errors[key])
          return (
            <TabsTrigger key={item.value} value={item.value}>
              <item.icon />
              <span>{item.label}</span>
              {invalid && (
                <>
                  <span aria-hidden className="size-1.5 rounded-full bg-destructive" />
                  <span className="sr-only">, has errors</span>
                </>
              )}
            </TabsTrigger>
          )
        })}
      </TabsList>
      {props.notices}
      {CONFIG_TABS.map((item) => {
        const card = (
          <Card>
            <CardHeader>
              <CardTitle>{item.label}</CardTitle>
              <CardDescription>{item.description}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-6">
              <FieldGroup className="gap-6">{panels[item.value]}</FieldGroup>
              {props.footer}
            </CardContent>
          </Card>
        )
        return (
          <TabsContent key={item.value} value={item.value}>
            {item.value === "display" ? (
              <div className="grid items-start gap-4 @3xl:grid-cols-2">
                {card}
                <Card role="region" aria-label="Review preview" className="@3xl:sticky @3xl:top-4">
                  <CardHeader>
                    <CardTitle>Preview</CardTitle>
                    <CardDescription>A sample change reviewed with these settings, including unsaved edits.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ReviewPreview settings={preview} />
                  </CardContent>
                </Card>
              </div>
            ) : (
              card
            )}
          </TabsContent>
        )
      })}
    </Tabs>
  )
}
