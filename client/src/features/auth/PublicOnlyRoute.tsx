import { Navigate, Outlet } from "react-router"
import { useAuth } from "./useAuth"
import { FullPageSpinner } from "./FullPageSpinner"

export function PublicOnlyRoute() {
  const { user, isLoading } = useAuth()

  if (isLoading) {
    return <FullPageSpinner />
  }
  if (user) {
    return <Navigate to="/home" replace />
  }
  return <Outlet />
}
