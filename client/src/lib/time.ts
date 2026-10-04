const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000],
]

const format = new Intl.RelativeTimeFormat("en", { numeric: "auto" })

export function timeAgo(iso: string, now = Date.now()) {
  const diff = new Date(iso).getTime() - now
  for (const [unit, ms] of UNITS) {
    if (Math.abs(diff) >= ms) return format.format(Math.round(diff / ms), unit)
  }
  return "just now"
}
