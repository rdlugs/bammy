import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { EyeOff, Loader2 } from "lucide-react"
import { toast } from "sonner"
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
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { applyServerErrors } from "@/features/auth/applyServerErrors"
import { useSetFindingState } from "./api"
import { IGNORE_REASON_LABEL, IGNORE_REASONS } from "./options"
import type { FindingRow, IgnoreReason } from "./types"

const NOTE_MAX = 1000

const ignoreSchema = z.object({
  reason: z.enum(IGNORE_REASONS.map((r) => r.value) as [IgnoreReason, ...IgnoreReason[]], {
    error: "Choose a reason",
  }),
  note: z.string().trim().max(NOTE_MAX, `Keep the note under ${NOTE_MAX} characters`),
})
type IgnoreInput = z.infer<typeof ignoreSchema>

// Ignoring hides a finding from the open list for good (later runs leave it
// ignored), so it asks why, and keeps the answer for whoever looks later.
export function IgnoreFindingDialog({
  finding,
  onOpenChange,
}: {
  finding: Pick<FindingRow, "id" | "title"> | null
  onOpenChange: (open: boolean) => void
}) {
  const setState = useSetFindingState()
  const form = useForm<IgnoreInput>({ resolver: zodResolver(ignoreSchema), defaultValues: { note: "" } })

  function handleOpenChange(next: boolean) {
    onOpenChange(next)
    if (!next) form.reset()
  }

  async function onSubmit({ reason, note }: IgnoreInput) {
    if (!finding) return
    try {
      await setState.mutateAsync({ id: finding.id, state: "ignored", reason, ...(note ? { note } : {}) })
      toast.success("Finding ignored")
      handleOpenChange(false)
    } catch (error) {
      applyServerErrors(error, form.setError)
    }
  }

  return (
    <Dialog open={finding !== null} onOpenChange={handleOpenChange}>
      <DialogContent>
        <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Ignore this finding?</DialogTitle>
            <DialogDescription>
              <span className="font-medium text-foreground">{finding?.title}</span> stays ignored on later runs
              until you reopen it.
            </DialogDescription>
          </DialogHeader>
          <Controller
            control={form.control}
            name="reason"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="ignore-reason">Why are you dismissing this?</FieldLabel>
                <Select value={field.value ?? ""} onValueChange={field.onChange}>
                  <SelectTrigger
                    id="ignore-reason"
                    className="w-full"
                    aria-invalid={fieldState.invalid}
                    onBlur={field.onBlur}
                  >
                    {/* The label alone; the items carry their descriptions. */}
                    <SelectValue placeholder="Select a reason">
                      {field.value ? IGNORE_REASON_LABEL[field.value] : undefined}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent position="popper">
                    {IGNORE_REASONS.map((reason) => (
                      <SelectItem key={reason.value} value={reason.value} className="py-2">
                        <div className="flex flex-col gap-0.5">
                          <span>{reason.label}</span>
                          <span className="text-xs text-muted-foreground">{reason.description}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />
          <Controller
            control={form.control}
            name="note"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="ignore-note">
                  Explain your reasoning <span className="font-normal text-muted-foreground">(optional)</span>
                </FieldLabel>
                <Textarea
                  {...field}
                  id="ignore-note"
                  rows={4}
                  maxLength={NOTE_MAX}
                  placeholder="e.g. The input is validated by the API gateway before it reaches this code."
                  aria-invalid={fieldState.invalid}
                />
                <FieldDescription>Saved with the finding, so others can see why it was dismissed.</FieldDescription>
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" variant="destructive" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? <Loader2 className="animate-spin" /> : <EyeOff />}
              Ignore finding
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
