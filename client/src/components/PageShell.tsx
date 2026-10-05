import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

const VARIANTS = {
  // Working pages (tables, forms) use the full width with a tight gutter.
  default: "p-4 sm:p-6 compact:p-4 compact:sm:p-4 spacious:p-6 spacious:sm:p-8",
  // Home is the only centered page: an overview reads better with room around it.
  wide: "mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8 compact:py-4 lg:compact:py-6 spacious:lg:px-10 spacious:lg:py-10",
} as const

// One gutter and rhythm for every dashboard page, so switching pages does not
// shift the content edge.
export function PageShell({
  variant = "default",
  className,
  children,
}: {
  variant?: keyof typeof VARIANTS
  className?: string
  children: ReactNode
}) {
  return (
    <main className="flex min-w-0 flex-1 flex-col">
      <div className={cn("flex w-full flex-1 flex-col gap-6 compact:gap-4 spacious:gap-8", VARIANTS[variant], className)}>
        {children}
      </div>
    </main>
  )
}
