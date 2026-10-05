import { Link } from "react-router"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { useGlobalConfig } from "@/features/config/api"
import { useConnections, useRepos } from "@/features/forge/api"

interface HeroState {
  title: string
  text: string
  action: { label: string; to: string }
}

// What stands between the user and automatic reviews, earliest missing step first.
function heroState(connections: number, enabledRepos: number, manualOnly: boolean): HeroState {
  if (connections === 0) {
    return {
      title: "Connect a Git provider",
      text: "Connect GitHub or GitLab so Bammy can review your pull requests.",
      action: { label: "Connect a provider", to: "/repositories?tab=installation" },
    }
  }
  if (enabledRepos === 0) {
    return {
      title: "Reviews are off",
      text: "Enable a repository to start reviewing its pull requests.",
      action: { label: "Add repositories", to: "/repositories" },
    }
  }
  if (manualOnly) {
    return {
      title: "Automatic reviews are off",
      text: "Only reviews you request run: comment /bammy review on a pull request or start one here.",
      action: { label: "Configure reviews", to: "/configuration" },
    }
  }
  return {
    title: "Reviews are on",
    text: "We'll automatically review PRs in your selected repositories.",
    action: { label: "View repositories", to: "/repositories" },
  }
}

export function StatusHero() {
  const connections = useConnections()
  const repos = useRepos()
  const globalConfig = useGlobalConfig()

  if (connections.isPending || repos.isPending) return <Skeleton className="h-36 w-full rounded-xl" />

  const enabledRepos = (repos.data?.repos ?? []).filter((r) => r.enabled).length
  // Repositories can override this, but the global setting is what most of them follow.
  const manualOnly = globalConfig.data?.config.triggers.review === "manual"
  const { title, text, action } = heroState(connections.data?.connections.length ?? 0, enabledRepos, manualOnly)

  return (
    <Card className="bg-gradient-to-br from-muted/70 via-card to-card">
      <CardContent className="flex flex-col items-start gap-2">
        <h3 className="text-lg font-medium">{title}</h3>
        <p className="text-sm text-muted-foreground">{text}</p>
        <Button asChild className="mt-2">
          <Link to={action.to}>{action.label}</Link>
        </Button>
      </CardContent>
    </Card>
  )
}
