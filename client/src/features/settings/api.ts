import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/api"
import type { User } from "@/features/auth/auth-context"

const ME_QUERY_KEY = ["auth", "me"]
const API_KEYS_QUERY_KEY = ["settings", "api-keys"]

export type LlmProvider = "anthropic" | "openai" | "google" | "ollama"
export type LlmConnectionStatus = "active" | "revoked" | "unreachable"

export interface ApiKey {
  provider: LlmProvider
  stored: boolean
  last4: string | null
  baseUrl: string | null
  updatedAt: string | null
  serverDefault: boolean
}

export interface ProfileInput {
  name: string
  email: string
}

export interface PasswordInput {
  currentPassword: string
  newPassword: string
  confirmPassword: string
}

export function useUpdateProfile() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: ProfileInput) =>
      api<{ user: User }>("/settings/profile", { method: "PATCH", body: JSON.stringify(input) }),
    onSuccess: ({ user }) => queryClient.setQueryData(ME_QUERY_KEY, user),
  })
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (input: PasswordInput) =>
      api<void>("/settings/password", { method: "PUT", body: JSON.stringify(input) }),
  })
}

export function useApiKeys() {
  return useQuery({
    queryKey: API_KEYS_QUERY_KEY,
    queryFn: () => api<{ keys: ApiKey[] }>("/settings/api-keys"),
  })
}

function apiKeyStatusQuery(provider: LlmProvider) {
  return {
    queryKey: [...API_KEYS_QUERY_KEY, provider, "status"],
    queryFn: () => api<{ status: LlmConnectionStatus }>(`/settings/api-keys/${provider}/status`),
    staleTime: 60_000,
    retry: false,
  }
}

// Each provider is checked independently so one slow host does not delay the
// other badges. Undefined means its request is still in progress.
export function useApiKeyStatuses(keys: ApiKey[]): Partial<Record<LlmProvider, LlmConnectionStatus | undefined>> {
  return useQueries({
    queries: keys.map((key) => apiKeyStatusQuery(key.provider)),
    combine: (results) =>
      Object.fromEntries(
        results.map((result, index) => [
          keys[index]!.provider,
          result.isError ? "unreachable" : result.data?.status,
        ]),
      ),
  })
}

// Feeds the model pickers. Saving or deleting a key invalidates the api-keys
// prefix, so a changed connection lists afresh.
export function useLlmModels(provider: LlmProvider | null) {
  return useQuery({
    queryKey: [...API_KEYS_QUERY_KEY, provider, "models"],
    queryFn: () => api<{ models: string[] }>(`/settings/api-keys/${provider}/models`),
    enabled: Boolean(provider),
    staleTime: 5 * 60_000,
    retry: false,
  })
}

export function useSaveApiKey() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ provider, apiKey, baseUrl }: { provider: LlmProvider; apiKey?: string; baseUrl?: string }) =>
      api<{ key: ApiKey }>(`/settings/api-keys/${provider}`, {
        method: "PUT",
        body: JSON.stringify({ apiKey: apiKey || undefined, baseUrl }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: API_KEYS_QUERY_KEY }),
  })
}

export function useDeleteApiKey() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (provider: LlmProvider) => api<void>(`/settings/api-keys/${provider}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: API_KEYS_QUERY_KEY }),
  })
}

// Signing out locally is enough: ProtectedRoute sends a null user to /login.
export function useDeleteAccount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (password: string) =>
      api<void>("/settings/account", { method: "DELETE", body: JSON.stringify({ password }) }),
    onSuccess: () => {
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== "auth" })
      queryClient.setQueryData(ME_QUERY_KEY, null)
    },
  })
}
