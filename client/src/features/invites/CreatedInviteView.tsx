import { Copy } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DialogClose, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { copyToClipboard } from "@/lib/clipboard"

// The step after creating an invite, for instance and team invites alike. The
// link appears only here: the server keeps just a hash of its token.
export function CreatedInviteView({
  created,
}: {
  created: { link: string; emailed: boolean; invite: { email: string | null } }
}) {
  return (
    <div className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>Invite created</DialogTitle>
        <DialogDescription>
          {created.emailed
            ? `We emailed this link to ${created.invite.email}. You can also share it yourself.`
            : "Share this link with the person you're inviting. It's shown only once and expires in 7 days."}
        </DialogDescription>
      </DialogHeader>
      <div className="flex gap-2">
        <Input readOnly value={created.link} aria-label="Invite link" onFocus={(e) => e.currentTarget.select()} />
        <Button type="button" variant="outline" onClick={() => copyToClipboard(created.link, "Invite link")}>
          <Copy />
          Copy
        </Button>
      </div>
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button">Done</Button>
        </DialogClose>
      </DialogFooter>
    </div>
  )
}
