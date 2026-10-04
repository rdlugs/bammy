import { GitPullRequest } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { useReviews } from "@/features/reviews/api"
import { ReviewUrlForm } from "@/features/reviews/ReviewUrlForm"
import { ReviewsTable } from "@/features/reviews/ReviewsTable"

export function ReviewsPage() {
  const { data, isPending, isError } = useReviews({ limit: 50 })

  return (
    <main className="flex flex-1 flex-col gap-6 p-6">
      <Card>
        <CardContent>
          <ReviewUrlForm />
        </CardContent>
      </Card>
      {isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : isError ? (
        <p className="text-sm text-destructive">Could not load reviews.</p>
      ) : data.reviews.length === 0 ? (
        <Empty className="flex-1 border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <GitPullRequest />
            </EmptyMedia>
            <EmptyTitle>No reviews yet</EmptyTitle>
            <EmptyDescription>Paste a pull or merge request link above to run the first one.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <Card>
          <CardContent>
            <ReviewsTable reviews={data.reviews} />
          </CardContent>
        </Card>
      )}
    </main>
  )
}
