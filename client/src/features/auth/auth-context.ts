import { createContext } from "react"
import type { LoginInput, RegisterInput } from "./schemas"

export type User = {
  id: string
  name: string
  email: string
  createdAt: string
}

export type AuthContextValue = {
  user: User | null
  isLoading: boolean
  login: (input: LoginInput) => Promise<User>
  register: (input: RegisterInput) => Promise<User>
  logout: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
