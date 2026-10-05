import type { ComponentType, SVGProps } from "react"
import { Link } from "react-router"
import { Check, Plus } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useConnections } from "@/features/forge/api"
import { PROVIDER_IDS, PROVIDERS } from "@/features/forge/providers"
import { useApiKeys, type LlmProvider } from "@/features/llm-connections/api"
import { LLM_PROVIDERS } from "@/features/llm-connections/providers"
import { SideSection } from "./SideSection"

const tile = "relative flex size-8 items-center justify-center rounded-md border bg-card transition-colors hover:bg-accent"

function ProviderTile({
  label,
  icon: Icon,
  connected,
  to,
}: {
  label: string
  icon: ComponentType<SVGProps<SVGSVGElement>>
  connected: boolean
  to: string
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link to={to} className={tile} aria-label={`${label}${connected ? ", connected" : ""}`}>
          <Icon className="size-4" aria-hidden />
          {connected && (
            <span className="absolute -top-1.5 -right-1.5 flex size-3.5 items-center justify-center rounded-full bg-emerald-600 text-white">
              <Check className="size-2.5" strokeWidth={3} aria-hidden />
            </span>
          )}
        </Link>
      </TooltipTrigger>
      <TooltipContent>{connected ? `${label} connected` : `Connect ${label}`}</TooltipContent>
    </Tooltip>
  )
}

function AddTile({ to, label }: { to: string; label: string }) {
  return (
    <Link to={to} className={`${tile} text-muted-foreground`} aria-label={label}>
      <Plus className="size-4" aria-hidden />
    </Link>
  )
}

const LLM_IDS = Object.keys(LLM_PROVIDERS) as LlmProvider[]

export function ConnectionsPanel() {
  const connections = useConnections().data?.connections ?? []
  const keys = useApiKeys().data?.keys ?? []

  const connectedForges = new Set(connections.map((c) => c.provider))
  // A server-wide key works for reviews just like one the user stored.
  const usableKeys = new Set(keys.filter((k) => k.stored || k.serverDefault).map((k) => k.provider))

  return (
    <SideSection title="Connections">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            Git providers
            <Badge variant="outline" className="h-5 min-w-5 px-1.5 text-xs tabular-nums">
              {connections.length}
            </Badge>
          </div>
          <div className="flex flex-wrap gap-2">
            {PROVIDER_IDS.map((id) => (
              <ProviderTile
                key={id}
                label={PROVIDERS[id].label}
                icon={PROVIDERS[id].icon}
                connected={connectedForges.has(id)}
                to="/repositories?tab=installation"
              />
            ))}
            <AddTile to="/repositories?tab=installation" label="Add a Git connection" />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            LLM providers
            <Badge variant="outline" className="h-5 min-w-5 px-1.5 text-xs tabular-nums">
              {usableKeys.size}
            </Badge>
          </div>
          <div className="flex flex-wrap gap-2">
            {LLM_IDS.map((id) => (
              <ProviderTile
                key={id}
                label={LLM_PROVIDERS[id].label}
                icon={LLM_PROVIDERS[id].icon}
                connected={usableKeys.has(id)}
                to="/llm-connections"
              />
            ))}
            <AddTile to="/llm-connections" label="Add an LLM connection" />
          </div>
        </div>
      </div>
    </SideSection>
  )
}
