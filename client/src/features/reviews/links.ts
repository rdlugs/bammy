import type { Provider } from "./types"

function origin(host: string) {
  return /^https?:\/\//.test(host) ? host.replace(/\/+$/, "") : `https://${host}`
}

// A link to the reviewed revision of a file at a line range.
export function forgeFileUrl(
  change: { provider: Provider; host: string; project: string; headSha: string },
  file: string,
  startLine: number,
  endLine: number,
) {
  const path = file.split("/").map(encodeURIComponent).join("/")
  if (change.provider === "github") {
    const base = change.host === "github.com" ? "https://github.com" : origin(change.host)
    const lines = endLine > startLine ? `#L${startLine}-L${endLine}` : `#L${startLine}`
    return `${base}/${change.project}/blob/${change.headSha}/${path}${lines}`
  }
  const lines = endLine > startLine ? `#L${startLine}-${endLine}` : `#L${startLine}`
  return `${origin(change.host)}/${change.project}/-/blob/${change.headSha}/${path}${lines}`
}

export function changeLabel(provider: Provider, number: number) {
  return provider === "gitlab" ? `!${number}` : `#${number}`
}
