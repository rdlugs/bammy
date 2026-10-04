import { useCallback, useMemo, type ReactNode } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { api, ApiError } from "@/lib/api"
import { AuthContext, type User } from "./auth-context"
import type { LoginInput, RegisterInput } from "./schemas"

const ME_QUERY_KEY = ["auth", "me"] as const

async function fetchMe(): Promise<User | null> {
  try {
    const { user } = await api<{ user: User }>("/auth/me")
    return user
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return null
    }
    throw error
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const { data: user = null, isLoading } = useQuery({
    queryKey: ME_QUERY_KEY,
    queryFn: fetchMe,
    staleTime: Infinity,
    retry: false,
  })

  const login = useCallback(
    async (input: LoginInput) => {
      const { user } = await api<{ user: User }>("/auth/login", {
        method: "POST",
        body: JSON.stringify(input),
      })
      queryClient.setQueryData(ME_QUERY_KEY, user)
      return user
    },
    [queryClient],
  )

  const register = useCallback(
    async (input: RegisterInput) => {
      const { user } = await api<{ user: User }>("/auth/register", {
        method: "POST",
        body: JSON.stringify(input),
      })
      queryClient.setQueryData(ME_QUERY_KEY, user)
      return user
    },
    [queryClient],
  )

  const logout = useCallback(async () => {
    await api<void>("/auth/logout", { method: "POST" })
    queryClient.setQueryData(ME_QUERY_KEY, null)
  }, [queryClient])

  const value = useMemo(
    () => ({ user, isLoading, login, register, logout }),
    [user, isLoading, login, register, logout],
  )

  return <AuthContext value={value}>{children}</AuthContext>
}
