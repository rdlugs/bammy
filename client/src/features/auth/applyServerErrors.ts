import type { FieldValues, Path, UseFormSetError } from "react-hook-form"
import { toast } from "sonner"
import { ApiError } from "@/lib/api"

export function applyServerErrors<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
) {
  if (error instanceof ApiError && error.fieldErrors) {
    for (const [field, messages] of Object.entries(error.fieldErrors)) {
      if (messages?.[0]) {
        setError(field as Path<T>, { message: messages[0] })
      }
    }
    return
  }
  toast.error(error instanceof Error ? error.message : "Something went wrong")
}
