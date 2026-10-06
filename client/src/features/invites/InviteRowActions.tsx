import { Loader2, MoreHorizontal, Send, Trash2 } from "lucide-react"
import { toast } from "sonner"
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

// Row actions for pending invites, shared by instance and team invites. Each
// page passes its own mutation, so these never know which API they call.

interface InviteRow {
  id: string
  email: string | null
}

interface InviteAction {
  mutateAsync: (id: string) => Promise<unknown>
  isPending: boolean
}

// Open links have no recipient, so only email invites can be resent.
export function InviteActions({
  invite,
  onResend,
  onRevoke,
}: {
  invite: InviteRow
  onResend: () => void
  onRevoke: () => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label={`Actions for ${invite.email ?? "open invite link"}`}
        >
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      {/* The shared menu matches its trigger's width, which is far too narrow for an icon button. */}
      <DropdownMenuContent align="end" className="w-max whitespace-nowrap">
        {invite.email && (
          <>
            <DropdownMenuItem onSelect={onResend}>
              <Send />
              Resend email
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem variant="destructive" onSelect={onRevoke}>
          <Trash2 />
          Revoke
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// Resending retires the link sent before, so it asks first. `linkLabel` says
// what the link does, e.g. "sign-up link".
export function ResendInviteDialog({
  invite,
  onOpenChange,
  resend,
  linkLabel,
}: {
  invite: InviteRow | null
  onOpenChange: (open: boolean) => void
  resend: InviteAction
  linkLabel: string
}) {
  async function confirm() {
    if (!invite) return
    try {
      await resend.mutateAsync(invite.id)
      onOpenChange(false)
      toast.success(`Invite sent to ${invite.email}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not resend the invite")
    }
  }

  return (
    <Dialog open={invite !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        {invite && (
          <>
            <DialogHeader>
              <DialogTitle>Resend this invite?</DialogTitle>
              <DialogDescription>
                We'll email a new {linkLabel} to {invite.email}. The link sent before stops working, and the invite is
                valid for another 7 days.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </DialogClose>
              <Button disabled={resend.isPending} onClick={confirm}>
                {resend.isPending ? <Loader2 className="animate-spin" /> : <Send />}
                Send email
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

export function RevokeInviteDialog({
  invite,
  onOpenChange,
  revoke,
}: {
  invite: InviteRow | null
  onOpenChange: (open: boolean) => void
  revoke: InviteAction
}) {
  async function confirm() {
    if (!invite) return
    try {
      await revoke.mutateAsync(invite.id)
      onOpenChange(false)
      toast.success("Invite revoked")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not revoke the invite")
    }
  }

  return (
    <Dialog open={invite !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        {invite && (
          <>
            <DialogHeader>
              <DialogTitle>Revoke this invite?</DialogTitle>
              <DialogDescription>
                {invite.email
                  ? `The link sent to ${invite.email} stops working.`
                  : "The link stops working for anyone who has it."}{" "}
                You can always create a new invite.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </DialogClose>
              <Button variant="destructive" disabled={revoke.isPending} onClick={confirm}>
                {revoke.isPending && <Loader2 className="animate-spin" />}
                Revoke invite
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
