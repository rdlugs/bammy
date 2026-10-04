import { LayoutDashboard } from "lucide-react"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { useAuth } from "@/features/auth/useAuth"

export function DashboardPage() {
  const { user } = useAuth()

  return (
    <main className="flex flex-1 flex-col gap-6 p-6">
      <h2 className="text-2xl font-semibold tracking-tight">Welcome, {user?.name}</h2>
      <Empty className="flex-1 border border-dashed">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <LayoutDashboard />
          </EmptyMedia>
          <EmptyTitle>Nothing here yet</EmptyTitle>
          <EmptyDescription>Your dashboard is empty. Content will appear here soon.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    </main>
  )
}
