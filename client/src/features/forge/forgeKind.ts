import type { Connection } from "./api"
import { PROVIDER_IDS, PROVIDERS } from "./providers"

type ForgeKindSource = Pick<Connection, "provider" | "kind">

export function kindLabel(connection: ForgeKindSource) {
  return PROVIDERS[connection.provider].kindLabel[connection.kind] ?? connection.kind
}

// Kind alone is ambiguous across forges (GitHub and GitLab both have "token").
export function forgeKey(connection: ForgeKindSource) {
  return `${connection.provider}:${connection.kind}`
}

// Every connection kind any forge supports, for forge filters. Listed even when
// no connection uses it yet, so the filter is always there.
export const FORGE_KIND_OPTIONS = PROVIDER_IDS.flatMap((id) =>
  Object.entries(PROVIDERS[id].kindLabel).map(([kind, label]) => ({
    value: `${id}:${kind}`,
    label: label!,
    icon: PROVIDERS[id].icon,
  })),
)
