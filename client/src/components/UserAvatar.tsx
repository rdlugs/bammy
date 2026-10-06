import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"

export interface AvatarUser {
  id: string
  name: string
  avatarUpdatedAt?: string | null
}

// Fallback colors, each readable in both themes. A user always gets the same
// one, so people stay recognisable across lists and sessions.
const PALETTE = [
  "bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-100",
  "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-100",
  "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-100",
  "bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-100",
  "bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-100",
  "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-100",
  "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-100",
  "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-100",
]

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("")
}

function avatarColor(id: string) {
  let hash = 0
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return PALETTE[hash % PALETTE.length]!
}

// The upload time versions the URL, so the server can cache it for good and a
// new picture shows up immediately. Radix shows the initials until the image
// loads, and keeps them if it fails.
export function UserAvatar({
  user,
  size,
  className,
  fallbackClassName,
}: {
  user: AvatarUser
  size?: "default" | "sm" | "lg"
  className?: string
  fallbackClassName?: string
}) {
  return (
    <Avatar size={size} className={className}>
      {user.avatarUpdatedAt && (
        <AvatarImage
          src={`/api/users/${user.id}/avatar?v=${Date.parse(user.avatarUpdatedAt)}`}
          alt=""
          className={fallbackClassName}
        />
      )}
      <AvatarFallback className={cn("font-medium", avatarColor(user.id), fallbackClassName)}>
        {initials(user.name)}
      </AvatarFallback>
    </Avatar>
  )
}
