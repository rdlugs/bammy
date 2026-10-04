import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/api"
import type { User } from "@/features/auth/auth-context"

const ME_QUERY_KEY = ["auth", "me"]
const API_KEYS_QUERY_KEY = ["settings", "api-keys"]

export type LlmProvider = "anthropic" | "openai" | "google"

export interface ApiKey {
  provider: LlmProvider
  stored: boolean
  last4: string | null
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

export function useSaveApiKey() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ provider, apiKey }: { provider: LlmProvider; apiKey: string }) =>
      api<{ key: ApiKey }>(`/settings/api-keys/${provider}`, { method: "PUT", body: JSON.stringify({ apiKey }) }),
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
