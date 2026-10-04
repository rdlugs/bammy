import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useNavigate } from "react-router"
import { Loader2 } from "lucide-react"
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
  DialogTrigger,
} from "@/components/ui/dialog"
import { TextField } from "@/features/auth/TextField"
import { applyServerErrors } from "@/features/auth/applyServerErrors"
import { useDeleteAccount } from "./api"

const confirmSchema = z.object({ password: z.string().min(1, "Password is required") })
type ConfirmInput = z.infer<typeof confirmSchema>

export function DeleteAccount() {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const deleteAccount = useDeleteAccount()
  const form = useForm<ConfirmInput>({ resolver: zodResolver(confirmSchema), defaultValues: { password: "" } })

  async function onSubmit({ password }: ConfirmInput) {
    try {
      await deleteAccount.mutateAsync(password)
      toast.success("Your account was deleted")
      navigate("/login", { replace: true })
    } catch (error) {
      applyServerErrors(error, form.setError)
    }
  }

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) form.reset()
  }

  return (
    <div className="flex flex-wrap items-center gap-4">
      <p className="flex-1 text-sm text-muted-foreground">
        Permanently delete your account along with your connections, repositories, review history and API keys.
      </p>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogTrigger asChild>
          <Button variant="destructive">Delete account</Button>
        </DialogTrigger>
        <DialogContent>
          <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>Delete your account?</DialogTitle>
              <DialogDescription>This cannot be undone. Enter your password to confirm.</DialogDescription>
            </DialogHeader>
            <TextField
              control={form.control}
              name="password"
              label="Password"
              type="password"
              autoComplete="current-password"
              placeholder="Enter your password to confirm"
            />
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" variant="destructive" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting && <Loader2 className="animate-spin" />}
                Delete permanently
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
