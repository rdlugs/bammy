import { Navigate, Route, Routes } from "react-router"
import { ProtectedRoute } from "@/features/auth/ProtectedRoute"
import { PublicOnlyRoute } from "@/features/auth/PublicOnlyRoute"
import { DashboardLayout } from "@/layouts/DashboardLayout"
import { ConfigurationPage } from "@/pages/config/ConfigurationPage"
import { ConnectionsPage } from "@/pages/forge/ConnectionsPage"
import { DashboardPage } from "@/pages/dashboard/DashboardPage"
import { LoginPage } from "@/pages/auth/LoginPage"
import { RegisterPage } from "@/pages/auth/RegisterPage"
import { RepositoriesPage } from "@/pages/forge/RepositoriesPage"
import { ReviewDetailPage } from "@/pages/reviews/ReviewDetailPage"
import { ReviewsPage } from "@/pages/reviews/ReviewsPage"
import { SettingsPage } from "@/pages/settings/SettingsPage"

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
          <Route path="/connections" element={<ConnectionsPage />} />
          <Route path="/configuration" element={<ConfigurationPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}
