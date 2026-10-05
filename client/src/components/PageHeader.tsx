import type { ReactNode } from "react"

// The page's only h1; the top bar just shows where you are.
export function PageHeader({
  title,
  description,
  actions,
  children,
}: {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  children?: ReactNode
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
      <div className="flex min-w-0 flex-1 basis-80 flex-col gap-1.5">
        <h1 className="text-2xl font-semibold tracking-tight break-words compact:text-xl spacious:text-3xl">{title}</h1>
        {description && <p className="max-w-prose text-sm text-muted-foreground">{description}</p>}
        {children}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}
