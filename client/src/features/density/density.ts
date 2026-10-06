// Ordered tightest to roomiest, which is how the menu lists them.
export const DENSITIES = ["compact", "comfortable", "spacious"] as const

export type Density = (typeof DENSITIES)[number]

const STORAGE_KEY = "sentryward-density"

// Storage can throw (private mode, blocked site data), so density silently
// falls back to the default instead of breaking the app.
export function readDensity(): Density {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return DENSITIES.find((density) => density === stored) ?? "comfortable"
  } catch {
    return "comfortable"
  }
}

export function saveDensity(density: Density) {
  try {
    localStorage.setItem(STORAGE_KEY, density)
  } catch {
    // Not persisted; the choice still applies for this session.
  }
}

// The `compact:` and `spacious:` Tailwind variants (index.css) keys off this attribute.
export function applyDensity(density: Density) {
  document.documentElement.dataset.density = density
}
