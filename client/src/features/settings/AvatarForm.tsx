import { useRef, useState, type ChangeEvent } from "react"
import { ImageUp, Loader2, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { UserAvatar } from "@/components/UserAvatar"
import { Button } from "@/components/ui/button"
import type { User } from "@/features/auth/auth-context"
import { useRemoveAvatar, useUploadAvatar } from "./api"
import { toAvatarJpeg } from "./avatarImage"

export function AvatarForm({ user }: { user: User }) {
  const input = useRef<HTMLInputElement>(null)
  const upload = useUploadAvatar()
  const remove = useRemoveAvatar()
  // Conversion runs in the browser before the upload; it counts as busy too, so
  // Remove and a second pick stay disabled from selection through to the end.
  const [converting, setConverting] = useState(false)
  const busy = converting || upload.isPending || remove.isPending

  async function onPick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    // Cleared so picking the same file again still fires a change.
    event.target.value = ""
    if (!file) return
    setConverting(true)
    try {
      const image = await toAvatarJpeg(file)
      await upload.mutateAsync(image)
      toast.success("Profile picture updated")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update the picture")
    } finally {
      setConverting(false)
    }
  }

  async function onRemove() {
    try {
      await remove.mutateAsync()
      toast.success("Profile picture removed")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not remove the picture")
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-4">
      <UserAvatar user={user} className="size-16" fallbackClassName="text-xl" />
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => input.current?.click()}>
            {converting || upload.isPending ? <Loader2 className="animate-spin" /> : <ImageUp />}
            Upload picture
          </Button>
          {user.avatarUpdatedAt && (
            <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={onRemove}>
              {remove.isPending ? <Loader2 className="animate-spin" /> : <Trash2 />}
              Remove
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          PNG, JPEG or WebP. It is cropped to a square; without one your initials are shown.
        </p>
      </div>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        aria-label="Profile picture file"
        onChange={onPick}
      />
    </div>
  )
}
