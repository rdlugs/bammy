import { Navigate, Route, Routes, useLocation } from "react-router"
import { ProtectedRoute } from "@/features/auth/ProtectedRoute"
import { PublicOnlyRoute } from "@/features/auth/PublicOnlyRoute"
import { DashboardLayout } from "@/layouts/DashboardLayout"
import { ConfigurationPage } from "@/pages/config/ConfigurationPage"
import { DashboardPage } from "@/pages/dashboard/DashboardPage"
import { LoginPage } from "@/pages/auth/LoginPage"
import { RegisterPage } from "@/pages/auth/RegisterPage"
import { RepositoriesPage } from "@/pages/forge/RepositoriesPage"
import { ReviewDetailPage } from "@/pages/reviews/ReviewDetailPage"
import { ReviewsPage } from "@/pages/reviews/ReviewsPage"
import { SettingsPage } from "@/pages/settings/SettingsPage"

// Connections now live on the Repositories page. Keep the old path working for
// bookmarks and GitHub returns already in flight, passing ?connected=/?error= on.
function ConnectionsRedirect() {
  const params = new URLSearchParams(useLocation().search)
  params.set("tab", "installation")
  return <Navigate to={`/repositories?${params}`} replace />
}

export function App() {
  return (
    <Routes>
      <Route element={<PublicOnlyRoute />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
      </Route>
      <Route element={<ProtectedRoute />}>
        <Route element={<DashboardLayout />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/reviews" element={<ReviewsPage />} />
          <Route path="/reviews/:id" element={<ReviewDetailPage />} />
          <Route path="/repositories" element={<RepositoriesPage />} />
          <Route path="/connections" element={<ConnectionsRedirect />} />
          <Route path="/configuration" element={<ConfigurationPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}
