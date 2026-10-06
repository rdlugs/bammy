import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useNavigate } from "react-router"
import { Check, ChevronsUpDown, Loader2, Plus, User, Users } from "lucide-react"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar"
import { applyServerErrors } from "@/features/auth/applyServerErrors"
import { TextField } from "@/features/auth/TextField"
import { useAuth } from "@/features/auth/useAuth"
import { useCreateWorkspace } from "./api"

const nameSchema = z.object({ name: z.string().trim().min(1, "Name is required").max(100) })
type NameInput = z.infer<typeof nameSchema>

function CreateTeamDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { switchWorkspace } = useAuth()
  const navigate = useNavigate()
  const create = useCreateWorkspace()
  const form = useForm<NameInput>({ resolver: zodResolver(nameSchema), defaultValues: { name: "" } })

  async function onSubmit({ name }: NameInput) {
    try {
      const workspace = await create.mutateAsync(name)
      onOpenChange(false)
      form.reset()
      switchWorkspace(workspace.id)
      navigate("/workspace")
    } catch (error) {
      applyServerErrors(error, form.setError)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) form.reset()
      }}
    >
      <DialogContent>
        <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Create a team</DialogTitle>
            <DialogDescription>
              A team has its own connections, repositories, reviews and keys, shared with the people you invite.
            </DialogDescription>
          </DialogHeader>
          <TextField control={form.control} name="name" label="Name" autoComplete="off" placeholder="Acme" />
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting && <Loader2 className="animate-spin" />}
              Create team
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function WorkspaceSwitcher() {
  const { workspaces, workspace, switchWorkspace } = useAuth()
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)

  if (!workspace) return null
  const Icon = workspace.personal ? User : Users

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              aria-label="Switch workspace"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <img src="/sentryward-192.png" alt="" className="size-8 shrink-0" />
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">Sentryward</span>
                <span className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                  <Icon className="size-3 shrink-0" aria-hidden />
                  {workspace.personal ? "Personal" : workspace.name}
                </span>
              </div>
              <ChevronsUpDown className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-56">
            <DropdownMenuLabel className="text-xs text-muted-foreground">Workspaces</DropdownMenuLabel>
            {workspaces.map((w) => (
              <DropdownMenuItem
                key={w.id}
                onSelect={() => {
                  if (w.id === workspace.id) return
                  switchWorkspace(w.id)
                  navigate("/home")
                }}
              >
                {w.personal ? <User /> : <Users />}
                <span className="truncate">{w.personal ? "Personal" : w.name}</span>
                {w.id === workspace.id && <Check className="ml-auto" aria-label="Current workspace" />}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => setCreating(true)}>
              <Plus />
              Create team
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <CreateTeamDialog open={creating} onOpenChange={setCreating} />
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
