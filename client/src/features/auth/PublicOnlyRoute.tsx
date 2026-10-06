import { Navigate, Outlet, useLocation } from "react-router"
import { useAuth } from "./useAuth"
import { FullPageSpinner } from "./FullPageSpinner"

export function PublicOnlyRoute() {
  const { user, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return <FullPageSpinner />
  }
  if (user) {
    // Logging in re-renders this before the login page can navigate, so the
    // page you were sent here from (a protected page, an invite) is honoured
    // here too.
    const from = (location.state as { from?: string } | null)?.from
    return <Navigate to={from?.startsWith("/") && !from.startsWith("//") ? from : "/home"} replace />
  }
  return <Outlet />
}
