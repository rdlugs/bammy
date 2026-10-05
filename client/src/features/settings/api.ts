import { useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/api"
import type { User } from "@/features/auth/auth-context"

const ME_QUERY_KEY = ["auth", "me"]

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
