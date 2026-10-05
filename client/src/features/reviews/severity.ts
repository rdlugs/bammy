import type { Severity } from "./types"

export const SEVERITY_CLASS: Record<Severity, string> = {
  critical: "bg-destructive/15 text-destructive",
  major: "bg-orange-500/15 text-orange-700 dark:text-orange-400",
  minor: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
  info: "bg-muted text-muted-foreground",
}

// Left edge of a finding card, so severity reads at a glance in a long list.
export const SEVERITY_BORDER: Record<Severity, string> = {
  critical: "border-l-destructive",
  major: "border-l-orange-500",
  minor: "border-l-sky-500",
  info: "border-l-border",
}

