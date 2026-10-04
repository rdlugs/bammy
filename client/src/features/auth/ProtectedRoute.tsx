import { Navigate, Outlet, useLocation } from "react-router"
import { useAuth } from "./useAuth"
import { FullPageSpinner } from "./FullPageSpinner"

export function ProtectedRoute() {
  const { user, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return <FullPageSpinner />
  }
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }
  return <Outlet />
}
