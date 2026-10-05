import { Loader2, RotateCw } from "lucide-react"
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
import { PROVIDERS } from "@/features/forge/providers"
import { changeLabel, changeTitle } from "./links"
import type { ReviewListItem } from "./types"

// A re-run spends model tokens and can post fresh comments on the forge, so a
// stray click in the row menu should not start one on its own.
export function RerunReviewDialog({
  review,
  open,
  onOpenChange,
  onConfirm,
  pending,
}: {
  review: ReviewListItem
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => Promise<void>
  pending: boolean
}) {
  const { provider, fullPath } = review.repository
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Re-run review of {changeTitle(review)}?</DialogTitle>
          <DialogDescription>
            Bammy will review the latest commit of {fullPath} {changeLabel(provider, review.number)} again. This uses
            model tokens and may post new comments to {PROVIDERS[provider].label}.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </DialogClose>
          <Button onClick={onConfirm} disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : <RotateCw />}
            Re-run review
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
