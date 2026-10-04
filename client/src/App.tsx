import { Navigate, Route, Routes } from "react-router"
import { ProtectedRoute } from "@/features/auth/ProtectedRoute"
import { PublicOnlyRoute } from "@/features/auth/PublicOnlyRoute"
import { DashboardLayout } from "@/layouts/DashboardLayout"
import { ConnectionsPage } from "@/pages/ConnectionsPage"
import { DashboardPage } from "@/pages/DashboardPage"
import { LoginPage } from "@/pages/LoginPage"
import { RegisterPage } from "@/pages/RegisterPage"
import { RepositoriesPage } from "@/pages/RepositoriesPage"
import { ReviewDetailPage } from "@/pages/ReviewDetailPage"
import { ReviewsPage } from "@/pages/ReviewsPage"
import { SettingsPage } from "@/pages/SettingsPage"

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
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}
