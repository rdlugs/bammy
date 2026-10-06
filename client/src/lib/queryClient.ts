import { QueryCache, QueryClient, type QueryClientConfig } from "@tanstack/react-query"
import { apiWorkspace } from "@/lib/api"
import { WORKSPACES_QUERY_KEY, isStaleWorkspaceError } from "@/features/auth/AuthProvider"

// Any workspace-scoped request 404s once the team in the workspace header is
// gone. Because the workspaces query never goes stale on its own, refreshing it
// here is what lets AuthProvider notice the workspace vanished and fall back to
// the personal one (which also clears the stale header). The guard limits this
// to when a team is actually selected; /workspaces is scoped by the user, not
// the header, so the refetch itself still succeeds.
export function createQueryClient(config?: QueryClientConfig) {
  const queryClient = new QueryClient({
    ...config,
    queryCache: new QueryCache({
      onError: (error) => {
        if (apiWorkspace() !== null && isStaleWorkspaceError(error)) {
          queryClient.invalidateQueries({ queryKey: WORKSPACES_QUERY_KEY })
        }
      },
    }),
  })
  return queryClient
}
