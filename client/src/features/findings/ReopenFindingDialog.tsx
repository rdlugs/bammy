import { Loader2, RotateCcw } from "lucide-react"
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
import { useSetFindingState } from "./api"
import { IGNORE_REASON_LABEL } from "./options"
import type { FindingRow } from "./types"

// Reopening discards why the finding was ignored (the server clears the reason
// and note), so it is confirmed rather than done on a stray click.
export function ReopenFindingDialog({
  finding,
  onOpenChange,
}: {
  finding: Pick<FindingRow, "id" | "title" | "ignoreReason" | "ignoreNote"> | null
  onOpenChange: (open: boolean) => void
}) {
  const setState = useSetFindingState()

  async function reopen() {
    if (!finding) return
    try {
      await setState.mutateAsync({ id: finding.id, state: "open" })
      toast.success("Finding reopened")
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not reopen the finding")
    }
  }

  return (
    <Dialog open={finding !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reopen this finding?</DialogTitle>
          <DialogDescription>
            <span className="font-medium text-foreground">{finding?.title}</span> moves back to Open, and later runs
            will resolve it once the code no longer has the problem. The reason it was ignored is discarded.
          </DialogDescription>
        </DialogHeader>
        {(finding?.ignoreReason || finding?.ignoreNote) && (
          <div aria-label="Ignore reason" className="flex flex-col gap-1 rounded-md bg-muted p-3 text-sm">
            {finding.ignoreReason && (
              <span>
                <span className="text-muted-foreground">Ignored as:</span> {IGNORE_REASON_LABEL[finding.ignoreReason]}
              </span>
            )}
            {/* Typed by a user; plain text, never HTML. */}
            {finding.ignoreNote && <p className="whitespace-pre-wrap text-muted-foreground">{finding.ignoreNote}</p>}
          </div>
        )}
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </DialogClose>
          <Button onClick={reopen} disabled={setState.isPending}>
            {setState.isPending ? <Loader2 className="animate-spin" /> : <RotateCcw />}
            Reopen finding
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
