import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/api"
import type { ForgeRepo, SavedRepo } from "@/features/forge/api"

export type LlmProviderName = "anthropic" | "openai" | "google" | "ollama"

// A partial review config; mirrors server/src/review/config/schema.ts.
export interface ConfigOverride {
  profile?: string
  llm?: {
    model?: string
    fallbackModels?: string[]
    temperature?: number
    maxTokens?: number
    contextBudget?: number | null
    // A live reference to a connection saved in Settings > API keys.
    connection?: LlmProviderName | null
    // Legacy endpoint fields are accepted until the setting is saved again.
    baseUrl?: string | null
    endpointKey?: LlmProviderName | null
  }
  review?: {
    categories?: string[]
    severityFloor?: string
    blockOn?: string
    maxFindings?: number
    maxChunks?: number
    minConfidence?: number
    requireEvidence?: boolean
    fullFile?: boolean
    committableSuggestions?: boolean
  }
  output?: { walkthrough?: boolean; postInline?: boolean; postSummary?: boolean; postCheck?: boolean }
  triggers?: { onPush?: boolean; drafts?: boolean; command?: boolean }
  ignorePaths?: string[]
  instructions?: string
  languageInstructions?: Record<string, string>
  [key: string]: unknown
}

export interface EffectiveConfig {
  profile: string
  llm: {
    model: string
    fallbackModels: string[]
    temperature: number
    maxTokens: number
    // null derives the prompt budget from the model's context window.
    contextBudget: number | null
    // The saved connection used for all model calls. Null is unconfigured.
    connection: LlmProviderName | null
    // One endpoint for every model call; null means each provider's official API.
    baseUrl: string | null
    // The stored key sent to baseUrl; null sends each model's own provider key.
    endpointKey: LlmProviderName | null
  }
  review: {
    categories: string[]
    severityFloor: string
    blockOn: string
    maxFindings: number
    maxChunks: number
    minConfidence: number
    requireEvidence: boolean
    fullFile: boolean
    committableSuggestions: boolean
  }
  output: { walkthrough: boolean; postInline: boolean; postSummary: boolean; postCheck: boolean }
  triggers: { onPush: boolean; drafts: boolean; command: boolean }
  ignorePaths: string[]
  instructions: string
  languageInstructions: Record<string, string>
}

// What a review of a repository's default branch would run with.
export interface ResolvedConfig {
  ref: string
  repoFile: string | null
  warnings: string[]
  sources: Record<string, string>
  config: EffectiveConfig
}

// The saved global config and what it resolves to before any repository.
export interface GlobalConfig {
  settings: ConfigOverride
  warnings: string[]
  sources: Record<string, string>
  config: EffectiveConfig
}

export interface ConfigSchema {
  defaults: EffectiveConfig
  // Each profile's preset, applied directly above the defaults.
  profiles: Record<string, ConfigOverride>
  severities: string[]
  categories: string[]
}

export function useConfigSchema() {
  return useQuery({
    queryKey: ["config-schema"],
    queryFn: () => api<ConfigSchema>("/config/schema"),
    staleTime: Infinity,
  })
}

export function useGlobalConfig() {
  return useQuery({
    queryKey: ["global-config"],
    queryFn: () => api<GlobalConfig>("/config/global"),
  })
}

export function useSaveGlobalConfig() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (settings: ConfigOverride) =>
      api<GlobalConfig>("/config/global", { method: "PUT", body: JSON.stringify({ settings }) }),
    onSuccess: (data) => {
      queryClient.setQueryData(["global-config"], data)
      // Every repository's effective config sits on top of the global one.
      queryClient.invalidateQueries({ queryKey: ["repo-config"] })
    },
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
    onSuccess: (_data, { repoId }) => {
      queryClient.invalidateQueries({ queryKey: ["repos"] })
      queryClient.invalidateQueries({ queryKey: ["repo-config", repoId] })
    },
  })
}

export function useSetFollowGlobal() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ repo, followGlobal }: { repo: ForgeRepo; followGlobal: boolean }) =>
      api<{ repo: SavedRepo }>(`/repos/${repo.id}`, { method: "PATCH", body: JSON.stringify({ followGlobal }) }),
    onSuccess: (_data, { repo }) => {
      queryClient.invalidateQueries({ queryKey: ["repos"] })
      queryClient.invalidateQueries({ queryKey: ["repo-config", repo.id] })
    },
  })
}
