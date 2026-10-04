import type { ReactNode } from "react"
import { ModeToggle } from "@/components/mode-toggle"

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-6 md:p-10">
      <div className="absolute top-4 right-4">
        <ModeToggle />
      </div>
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex items-center gap-2 self-center font-medium">
          <img src="/bammy.svg" alt="" className="size-6 rounded-md" />
          Bammy
        </div>
        {children}
      </div>
    </div>
  )
}
