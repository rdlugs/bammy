import { Link } from "react-router"
import { CheckCircle2, Circle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useAuth } from "@/features/auth/useAuth"
import { useConnections } from "@/features/forge/api"
import { useReviews } from "@/features/reviews/api"
import { ReviewUrlForm } from "@/features/reviews/ReviewUrlForm"
import { ReviewsTable } from "@/features/reviews/ReviewsTable"

function Step({ done, children }: { done: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-2 text-sm">
      {done ? <CheckCircle2 className="size-4 text-emerald-600" /> : <Circle className="size-4 text-muted-foreground" />}
      <span className={done ? "text-muted-foreground line-through" : undefined}>{children}</span>
    </li>
  )
}

export function DashboardPage() {
  const { user } = useAuth()
  const connections = useConnections()
  const reviews = useReviews({ limit: 5 })

  const connected = (connections.data?.connections.length ?? 0) > 0
  const reviewed = (reviews.data?.reviews.length ?? 0) > 0

  return (
    <main className="flex flex-1 flex-col gap-6 p-6">
      <h2 className="text-2xl font-semibold tracking-tight">Welcome, {user?.name}</h2>

      {!(connected && reviewed) && connections.data && reviews.data && (
        <Card>
          <CardHeader>
            <CardTitle>Get started</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="flex flex-col gap-2">
              <Step done={connected}>
                <Link to="/connections" className="hover:underline">
                  Connect GitHub or GitLab
                </Link>
              </Step>
              <Step done={reviewed}>
                <Link to="/repositories" className="hover:underline">
                  Enable a repository
                </Link>{" "}
                and run a first review
              </Step>
            </ol>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent>
          <ReviewUrlForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Recent reviews</CardTitle>
          <Button asChild variant="ghost" size="sm">
            <Link to="/reviews">View all</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {reviews.data?.reviews.length ? (
            <ReviewsTable reviews={reviews.data.reviews} />
          ) : (
            <p className="text-sm text-muted-foreground">No reviews yet.</p>
          )}
        </CardContent>
      </Card>
    </main>
  )
}
