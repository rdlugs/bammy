import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup } from "@/components/ui/field"
import { TextField } from "@/features/auth/TextField"
import { applyServerErrors } from "@/features/auth/applyServerErrors"
import { useChangePassword, type PasswordInput } from "./api"

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z.string().min(8, "Password must be at least 8 characters").max(128),
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  })

const EMPTY: PasswordInput = { currentPassword: "", newPassword: "", confirmPassword: "" }

export function PasswordForm() {
  const change = useChangePassword()
  const form = useForm<PasswordInput>({ resolver: zodResolver(passwordSchema), defaultValues: EMPTY })

  async function onSubmit(values: PasswordInput) {
    try {
      await change.mutateAsync(values)
      form.reset(EMPTY)
      toast.success("Password changed")
    } catch (error) {
      applyServerErrors(error, form.setError)
    }
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
      <FieldGroup>
        <TextField
          control={form.control}
          name="currentPassword"
          label="Current password"
          type="password"
          autoComplete="current-password"
          placeholder="Enter your current password"
        />
        <TextField
          control={form.control}
          name="newPassword"
          label="New password"
          type="password"
          autoComplete="new-password"
          placeholder="At least 8 characters"
        />
        <TextField
          control={form.control}
          name="confirmPassword"
          label="Confirm new password"
          type="password"
          autoComplete="new-password"
          placeholder="Repeat the new password"
        />
        <Field orientation="horizontal">
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting && <Loader2 className="animate-spin" />}
            Change password
          </Button>
        </Field>
      </FieldGroup>
    </form>
  )
}
