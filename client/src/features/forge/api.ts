import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/api"
import type { JobStatus, Provider, Verdict } from "@/features/reviews/types"

export interface Connection {
  id: string
  provider: Provider
  host: string
  kind: "github_app" | "token"
  accountLogin: string
  createdAt: string
}

export type ConnectionStatus = "active" | "revoked" | "unreachable"

export interface ConnectionDetails {
  connection: Connection & { installationId: string | null; updatedAt: string }
  repositories: {
    id: string
    fullPath: string
    defaultBranch: string
    webUrl: string
    webhook: WebhookState
  }[]
  reviews: {
    total: number
    recent: {
      id: string
      number: number
      status: JobStatus
      verdict: Verdict | null
      createdAt: string
      repository: { fullPath: string; provider: Provider }
    }[]
  }
}

export interface ForgeRepo {
  id: string | null
  externalId: string
  fullPath: string
  defaultBranch: string
  private: boolean
  webUrl: string
  enabled: boolean
  settings: ConfigOverride
}

export interface SavedRepo {
  id: string
  connectionId: string
  fullPath: string
  enabled: boolean
  settings: ConfigOverride
}

// A partial review config; mirrors server/src/review/config/schema.ts.
export interface ConfigOverride {
  profile?: string
  llm?: { model?: string }
  review?: { severityFloor?: string; blockOn?: string }
  output?: { walkthrough?: boolean; postInline?: boolean; postSummary?: boolean; postCheck?: boolean }
  triggers?: { onPush?: boolean; drafts?: boolean; command?: boolean }
  instructions?: string
  [key: string]: unknown
}

export interface ResolvedConfig {
  ref: string
  repoFile: string | null
  warnings: string[]
  sources: Record<string, string>
  config: {
    profile: string
    llm: { model: string }
    review: { severityFloor: string; blockOn: string }
    output: { walkthrough: boolean; postInline: boolean; postSummary: boolean; postCheck: boolean }
    triggers: { onPush: boolean; drafts: boolean; command: boolean }
    instructions: string
  }
}

export interface WebhookState {
  active: boolean
  error?: string
}

export interface ConfigSchema {
  profiles: Record<string, unknown>
  severities: string[]
}

export function useConnections() {
  return useQuery({
    queryKey: ["connections"],
    queryFn: () => api<{ connections: Connection[]; availableApps: Provider[] }>("/connections"),
  })
}

export function useConnectionDetails(id: string | null) {
  return useQuery({
    queryKey: ["connections", id, "details"],
    queryFn: () => api<ConnectionDetails>(`/connections/${id}`),
    enabled: Boolean(id),
  })
}

// Shared by the table and the details sheet, so re-checking in one updates both.
function connectionStatusQuery(id: string) {
  return {
    queryKey: ["connections", id, "status"],
    queryFn: () => api<{ status: ConnectionStatus }>(`/connections/${id}/status`),
    staleTime: 60_000,
    retry: false,
  }
}

// One live credential check per connection, so a slow forge only delays its
// own row. Undefined while a check is still running.
export function useConnectionStatuses(connections: Connection[]): Record<string, ConnectionStatus | undefined> {
  return useQueries({
    queries: connections.map((connection) => connectionStatusQuery(connection.id)),
    combine: (results) =>
      Object.fromEntries(
        results.map((result, index) => [
          connections[index]!.id,
          result.isError ? "unreachable" : result.data?.status,
        ]),
      ),
  })
}

export function useConnectionStatus(id: string) {
  const query = useQuery(connectionStatusQuery(id))
  const status: ConnectionStatus | undefined = query.isError ? "unreachable" : query.data?.status
  return { status, isFetching: query.isFetching, refetch: query.refetch }
}

// host and token, plus any extra fields the provider's connect method declares.
export type TokenConnectInput = Record<string, string>

export function useConnectToken(provider: Provider) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: TokenConnectInput) =>
      api<{ connection: Connection }>(`/connections/${provider}`, { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["connections"] }),
  })
}

export function useDeleteConnection() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api<void>(`/connections/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["connections"] }),
  })
}

export function useRepos(connectionId: string | undefined) {
  return useQuery({
    queryKey: ["repos", connectionId],
    queryFn: () => api<{ repos: ForgeRepo[] }>(`/repos?connectionId=${connectionId}`),
    enabled: Boolean(connectionId),
  })
}

export function useSetRepoEnabled(connectionId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ repo, enabled }: { repo: ForgeRepo; enabled: boolean }) =>
      repo.id
        ? api<{ repo: SavedRepo; webhook?: WebhookState }>(`/repos/${repo.id}`, {
            method: "PATCH",
            body: JSON.stringify({ enabled }),
          })
        : api<{ repo: SavedRepo; webhook?: WebhookState }>("/repos", {
            method: "POST",
            body: JSON.stringify({ connectionId, externalId: repo.externalId }),
          }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["repos", connectionId] }),
  })
}

export function useRepoConfig(repoId: string | null) {
  return useQuery({
    queryKey: ["repo-config", repoId],
    queryFn: () => api<ResolvedConfig>(`/repos/${repoId}/config`),
    enabled: Boolean(repoId),
  })
}

export function useSaveRepoSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ repoId, settings }: { repoId: string; settings: ConfigOverride }) =>
      api<{ repo: SavedRepo }>(`/repos/${repoId}`, { method: "PATCH", body: JSON.stringify({ settings }) }),
    onSuccess: (_data, { repoId }) => queryClient.invalidateQueries({ queryKey: ["repo-config", repoId] }),
  })
}

export function useConfigSchema() {
  return useQuery({
    queryKey: ["config-schema"],
    queryFn: () => api<ConfigSchema>("/config/schema"),
    staleTime: Infinity,
  })
}
