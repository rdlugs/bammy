import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/api"
import { isActive, type ReviewDetail, type ReviewListItem } from "./types"

// While anything is queued or running, poll; otherwise stay quiet.
const POLL_MS = 3000

export function useReviews(params: { repoId?: string; limit?: number } = {}) {
  const search = new URLSearchParams()
  if (params.repoId) search.set("repoId", params.repoId)
  if (params.limit) search.set("limit", String(params.limit))
  const query = search.toString()
  return useQuery({
    queryKey: ["reviews", params],
    queryFn: () => api<{ reviews: ReviewListItem[]; nextCursor: string | null }>(`/reviews${query ? `?${query}` : ""}`),
    refetchInterval: (q) => (q.state.data?.reviews.some((r) => isActive(r.status)) ? POLL_MS : false),
  })
}

export function useReview(id: string) {
  return useQuery({
    queryKey: ["review", id],
    queryFn: () => api<{ review: ReviewDetail }>(`/reviews/${id}`),
    refetchInterval: (q) => (q.state.data && isActive(q.state.data.review.status) ? POLL_MS : false),
  })
}

export function useCreateReview() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (url: string) =>
      api<{ review: ReviewListItem }>("/reviews", { method: "POST", body: JSON.stringify({ url }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["reviews"] }),
  })
}

export function useRerunReview() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api<{ review: ReviewListItem }>(`/reviews/${id}/rerun`, { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["reviews"] }),
  })
}

export async function fetchReviewMarkdown(id: string): Promise<string> {
  const res = await fetch(`/api/reviews/${id}/markdown`, { credentials: "include" })
  if (!res.ok) throw new Error("Could not load the markdown")
  return res.text()
}
