import { toast } from "sonner"

// Takes a promise too, so text that has to be fetched first (the review markdown)
// shares the same success and failure toasts.
export async function copyToClipboard(text: string | Promise<string>, label: string) {
  try {
    await navigator.clipboard.writeText(await text)
    toast.success(`${label} copied`)
  } catch {
    toast.error(`Could not copy the ${label.toLowerCase()}`)
  }
}
