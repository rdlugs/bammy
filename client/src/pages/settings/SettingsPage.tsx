import type { ReactNode } from "react"
import { Navigate, useSearchParams } from "react-router"
import { LockKeyhole, TriangleAlert, UserRound } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useAuth } from "@/features/auth/useAuth"
import { DeleteAccount } from "@/features/settings/DeleteAccount"
import { PasswordForm } from "@/features/settings/PasswordForm"
import { ProfileForm } from "@/features/settings/ProfileForm"

const TAB_ITEMS = [
  { value: "profile", label: "Profile", icon: UserRound },
  { value: "password", label: "Password", icon: LockKeyhole },
  { value: "account", label: "Account", icon: TriangleAlert },
] as const
type Tab = (typeof TAB_ITEMS)[number]["value"]
const TABS: readonly string[] = TAB_ITEMS.map((item) => item.value)

function Section({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

export function SettingsPage() {
  const { user } = useAuth()
  // ?tab= keeps the open tab linkable, e.g. /settings?tab=password.
  const [params, setParams] = useSearchParams()
  const requested = params.get("tab")
  const tab = requested && TABS.includes(requested) ? (requested as Tab) : "profile"

  // LLM connections moved to their own page; keep old bookmarks working.
  if (requested === "api-keys") return <Navigate to="/llm-connections" replace />
  if (!user) return null

  return (
    <main className="flex min-w-0 flex-1 flex-col p-4 sm:p-6">
      <Tabs value={tab} onValueChange={(value) => setParams({ tab: value }, { replace: true })}>
        <TabsList>
          {TAB_ITEMS.map((item) => (
            <TabsTrigger key={item.value} value={item.value}>
              <item.icon />
              <span>{item.label}</span>
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="profile">
          <Section title="Profile" description="Your name and the email you sign in with.">
            <ProfileForm user={user} />
          </Section>
        </TabsContent>
        <TabsContent value="password">
          <Section title="Password" description="Choose a new password of at least 8 characters.">
            <PasswordForm />
          </Section>
        </TabsContent>
        <TabsContent value="account">
          <Section title="Delete account" description="Remove your account and everything it owns.">
            <DeleteAccount />
          </Section>
        </TabsContent>
      </Tabs>
    </main>
  )
}
