import { PROVIDERS } from "@/features/forge/providers"
import type { Provider } from "./types"

// A link to the reviewed revision of a file at a line range.
export function forgeFileUrl(
  change: { provider: Provider; host: string; project: string; headSha: string },
  file: string,
  startLine: number,
  endLine: number,
) {
  const path = file.split("/").map(encodeURIComponent).join("/")
  return PROVIDERS[change.provider].fileUrl(change.host, change.project, change.headSha, path, startLine, endLine)
}

export function changeLabel(provider: Provider, number: number) {
  return PROVIDERS[provider].changeLabel(number)
}
