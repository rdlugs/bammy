// Every filter select starts on this value, which matches all rows.
export const ALL = "all"

export function matchesQuery(query: string, ...fields: string[]) {
  const needle = query.trim().toLowerCase()
  return !needle || fields.some((field) => field.toLowerCase().includes(needle))
}

// Label of the selected option, or null while a filter is on ALL.
export function selectedLabel(value: string, options: { value: string; label: string }[]) {
  if (value === ALL) return null
  return options.find((option) => option.value === value)?.label ?? null
}
