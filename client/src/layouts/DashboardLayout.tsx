import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router"
import {
  Bug,
  ChevronRight,
  ChevronsUpDown,
  FolderGit2,
  GitPullRequest,
  House,
  KeyRound,
  LogOut,
  Settings,
  SlidersHorizontal,
} from "lucide-react"
import { toast } from "sonner"
import { DensityToggle } from "@/components/density-toggle"
import { ModeToggle } from "@/components/mode-toggle"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Separator } from "@/components/ui/separator"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { useAuth } from "@/features/auth/useAuth"

const NAV = [
  { to: "/home", label: "Home", icon: House },
  { to: "/reviews", label: "Reviews", icon: GitPullRequest },
  { to: "/findings", label: "Findings", icon: Bug },
  { to: "/repositories", label: "Repositories", icon: FolderGit2 },
  { to: "/configuration", label: "Configuration", icon: SlidersHorizontal },
  { to: "/llm-connections", label: "LLM Connections", icon: KeyRound },
]

// Where you are, for the top bar; each page renders its own h1.
function breadcrumb(pathname: string): { label: string; to?: string }[] {
  if (pathname.startsWith("/reviews/")) return [{ label: "Reviews", to: "/reviews" }, { label: "Review" }]
  if (pathname.startsWith("/settings")) return [{ label: "Settings" }]
  return [{ label: NAV.find((item) => pathname.startsWith(item.to))?.label ?? "Home" }]
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("")
}

export function DashboardLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()

  async function handleLogout() {
    try {
      await logout()
      navigate("/login", { replace: true })
    } catch {
      toast.error("Could not log out, please try again")
    }
  }

  if (!user) {
    return null
  }

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg">
                <img src="/bammy.svg" alt="" className="size-8 shrink-0 rounded-lg" />
                <span className="truncate font-medium">Bammy</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarMenu>
              {NAV.map((item) => (
                <SidebarMenuItem key={item.to}>
                  <SidebarMenuButton asChild isActive={pathname.startsWith(item.to)} tooltip={item.label}>
                    <NavLink to={item.to}>
                      <item.icon />
                      <span>{item.label}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton
                    size="lg"
                    className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                  >
                    <Avatar className="size-8 rounded-lg">
                      <AvatarFallback className="rounded-lg">{initials(user.name)}</AvatarFallback>
                    </Avatar>
                    <div className="grid flex-1 text-left text-sm leading-tight">
                      <span className="truncate font-medium">{user.name}</span>
                      <span className="truncate text-xs text-muted-foreground">{user.email}</span>
                    </div>
                    <ChevronsUpDown className="ml-auto size-4" />
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="top" align="start" className="min-w-56">
                  <DropdownMenuLabel className="font-normal">
                    <div className="grid text-sm leading-tight">
                      <span className="truncate font-medium">{user.name}</span>
                      <span className="truncate text-xs text-muted-foreground">{user.email}</span>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link to="/settings">
                      <Settings />
                      Settings
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={handleLogout}>
                    <LogOut />
                    Log out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
      {/* min-w-0 lets wide content (code blocks, tables) scroll inside the
          page instead of stretching the whole layout past the viewport. */}
      <SidebarInset className="min-w-0">
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur supports-backdrop-filter:bg-background/80 lg:px-6">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
          <nav aria-label="Breadcrumb" className="min-w-0">
            <ol className="flex items-center gap-1.5 text-sm text-muted-foreground">
              {breadcrumb(pathname).map((crumb, i) => (
                <li key={crumb.label} className="flex min-w-0 items-center gap-1.5">
                  {i > 0 && <ChevronRight className="size-3.5 shrink-0" aria-hidden />}
                  {crumb.to ? (
                    <Link to={crumb.to} className="transition-colors hover:text-foreground">
                      {crumb.label}
                    </Link>
                  ) : (
                    <span aria-current="page" className="truncate font-medium text-foreground">
                      {crumb.label}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </nav>
          <div className="ml-auto flex items-center gap-1">
            <DensityToggle />
            <ModeToggle />
          </div>
        </header>
        <Outlet />
      </SidebarInset>
    </SidebarProvider>
  )
}
