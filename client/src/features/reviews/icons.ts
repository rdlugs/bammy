import {
  CircleAlert,
  CircleCheck,
  Info,
  ListChecks,
  MapPin,
  OctagonAlert,
  OctagonX,
  Sparkles,
  TriangleAlert,
  Wrench,
  type LucideIcon,
} from "lucide-react"
import type { Bucket, Severity, Verdict } from "./types"

// The dashboard's counterparts of the emoji in the forge comments
// (server/src/review/render/markdown.ts), so a finding reads the same in both.
export const SEVERITY_ICON: Record<Severity, LucideIcon> = {
  critical: OctagonAlert,
  major: TriangleAlert,
  minor: CircleAlert,
  info: Info,
}

export const BUCKET_ICON: Record<Bucket, LucideIcon> = {
  actionable: Wrench,
  requirement_gap: ListChecks,
  outside_diff: MapPin,
  nitpick: Sparkles,
}

export const VERDICT_ICON: Record<Verdict, LucideIcon> = {
  pass: CircleCheck,
  blocked: OctagonX,
  error: TriangleAlert,
}
