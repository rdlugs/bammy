import { useSearchParams } from "react-router"
import { FolderGit2, Plug } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useConnections } from "@/features/forge/api"
import { InstallationTab } from "@/pages/forge/InstallationTab"
import { RepositoriesTab } from "@/pages/forge/RepositoriesTab"

const TAB_ITEMS = [
  { value: "installation", label: "Installation", icon: Plug },
  { value: "repositories", label: "Repositories", icon: FolderGit2 },
] as const
type Tab = (typeof TAB_ITEMS)[number]["value"]
const TABS: readonly string[] = TAB_ITEMS.map((item) => item.value)

export function RepositoriesPage() {
  const { data, isPending } = useConnections()
  // ?tab= keeps the open tab linkable, e.g. /repositories?tab=installation.
  const [params, setParams] = useSearchParams()
  const requested = params.get("tab")

  if (isPending) return null

  // Without a connection there are no repositories to pick, so start on setup.
  const fallback: Tab = data?.connections.length ? "repositories" : "installation"
  const tab = requested && TABS.includes(requested) ? (requested as Tab) : fallback

  return (
    <main className="flex flex-1 flex-col p-4 sm:p-6">
      <Tabs className="flex-1" value={tab} onValueChange={(value) => setParams({ tab: value }, { replace: true })}>
        <TabsList>
          {TAB_ITEMS.map((item) => (
            <TabsTrigger key={item.value} value={item.value}>
              <item.icon />
              <span>{item.label}</span>
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="installation" className="flex flex-col">
          <InstallationTab />
        </TabsContent>
        <TabsContent value="repositories" className="flex flex-col">
          <RepositoriesTab />
        </TabsContent>
      </Tabs>
    </main>
  )
}
