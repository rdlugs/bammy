import { useMemo } from "react"
import { Link, useSearchParams } from "react-router"
import { Globe, Plus } from "lucide-react"
import { SearchableSelect, type SelectOptionGroup } from "@/components/SearchableSelect"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { useGlobalConfig } from "@/features/config/api"
import { DEFAULT_CONFIG_TAB, isConfigTab, type ConfigTab } from "@/features/config/tabs"
import { GlobalConfigForm } from "@/features/config/GlobalConfigForm"
import { FollowGlobalSwitch, RepoConfigForm } from "@/features/config/RepoConfigForm"
import { useRepos } from "@/features/forge/api"
import { cn } from "@/lib/utils"

const GLOBAL = "global"

export function ConfigurationPage() {
  const repos = useRepos()
  const global = useGlobalConfig()
  const sorted = useMemo(
    () => [...(repos.data?.repos ?? [])].sort((a, b) => a.fullPath.localeCompare(b.fullPath)),
    [repos.data],
  )

  // ?repo= keeps the selected scope linkable and ?tab= the open tab; without
  // them (or with unknown values) the global config's first tab shows.
  const [params, setParams] = useSearchParams()
  const selected = sorted.find((repo) => repo.id === params.get("repo")) ?? null
  const requestedTab = params.get("tab")
  const tab = isConfigTab(requestedTab) ? requestedTab : DEFAULT_CONFIG_TAB

  const scopeOptions = useMemo<SelectOptionGroup[]>(
    () => [
      { options: [{ value: GLOBAL, label: "All repositories", icon: Globe }] },
      {
        heading: "Repositories",
        options: sorted.map((repo) => ({
          value: repo.id,
          label: repo.fullPath,
          description: repo.account.login,
          keywords: [repo.account.login],
          badge: !repo.followGlobal && Object.keys(repo.settings).length > 0 && (
            <Badge variant="secondary" className="ml-auto">
              Overrides
            </Badge>
          ),
        })),
      },
    ],
    [sorted],
  )

  // Both setters keep the other parameter, so switching scope stays on the same tab.
  function update(next: { repo?: string | null; tab?: string }) {
    const repo = next.repo === undefined ? params.get("repo") : next.repo
    const nextTab = next.tab ?? params.get("tab")
    setParams({ ...(repo ? { repo } : {}), ...(nextTab ? { tab: nextTab } : {}) }, { replace: true })
  }

  const onTabChange = (value: ConfigTab) => update({ tab: value })

  let body
  // Wait for the repository list before falling back, so a ?repo= link does not flash the global config.
  if (params.has("repo") && repos.isPending) body = <Skeleton className="h-96 w-full" />
  else if (selected) body = <RepoConfigForm key={selected.id} repo={selected} tab={tab} onTabChange={onTabChange} />
  else if (global.isPending) body = <Skeleton className="h-96 w-full" />
  else if (global.isError) body = <p className="text-sm text-destructive">{global.error.message}</p>
  else body = <GlobalConfigForm global={global.data} tab={tab} onTabChange={onTabChange} />

  return (
    <main className="@container flex min-w-0 flex-1 flex-col gap-4 p-4 sm:p-6">
      <div className="flex max-w-5xl flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-3">
          <Label htmlFor="config-scope">Scope</Label>
          <SearchableSelect
            id="config-scope"
            className="max-w-sm"
            value={selected?.id ?? GLOBAL}
            onValueChange={(value) => update({ repo: value === GLOBAL ? null : value })}
            searchPlaceholder="Search repositories..."
            emptyText="No matching repositories."
            options={scopeOptions}
          />
          {selected && (
            <div className="flex items-center gap-2">
              <FollowGlobalSwitch repo={selected} id="follow-global" />
              <Label htmlFor="follow-global">Follow global config</Label>
            </div>
          )}
          {repos.isSuccess && sorted.length === 0 && (
            <Button variant="ghost" size="sm" asChild>
              <Link to="/repositories">
                <Plus />
                Add repositories
              </Link>
            </Button>
          )}
          {repos.isError && <p className="text-sm text-destructive">{repos.error.message}</p>}
        </div>
        <p className="text-sm text-muted-foreground">
          {!selected ? (
            <>
              The global config applies to every repository. Repositories that do not follow it layer their own
              overrides on top, and a <code>.bammy.yaml</code> in a repository still wins over both.
            </>
          ) : selected.followGlobal ? (
            "Only the global config applies. Overrides are kept for when you stop following it."
          ) : (
            <>
              Overrides saved here sit on top of the global config and below a <code>.bammy.yaml</code> in the
              repository.
            </>
          )}
        </p>
      </div>
      {/* The Display tab splits the full width between its settings and the preview. */}
      <div className={cn("flex flex-col", tab !== "display" && "max-w-5xl")}>{body}</div>
    </main>
  )
}
