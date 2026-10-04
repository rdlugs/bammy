import type { ComponentType, ReactNode, SVGProps } from "react"
import type { Provider } from "@/features/reviews/types"
import type { Connection } from "./api"
import { GitHubIcon, GitLabIcon } from "./icons"

// Everything the client knows about each forge. Keyed by Provider, so adding a
// forge to that type fails to compile until it has an entry here. The server
// side is described in server/src/review/forge/providers.ts.

export interface TokenField {
  name: string
  label: string
  placeholder?: string
  type?: "text" | "password"
}

export type ConnectMethod =
  // A redirect to an app install flow, offered when the server lists the
  // provider in availableApps.
  | { type: "app"; name: string; installHref: string }
  // A pasted token, posted to /connections/:provider. A fixed host hides the
  // host field. Extra fields are sent alongside host and token.
  | {
      type: "token"
      fixedHost?: string
      hostPlaceholder: string
      tokenPlaceholder: string
      extraFields?: TokenField[]
    }

export type TokenMethod = Extract<ConnectMethod, { type: "token" }>

export interface HostingOption {
  label: string
  hint: ReactNode
  method: ConnectMethod
}

export interface ProviderDefinition {
  label: string
  changeNoun: string
  changeLabel(number: number): string
  fileUrl(host: string, project: string, sha: string, path: string, startLine: number, endLine: number): string
  icon: ComponentType<SVGProps<SVGSVGElement>>
  kindLabel: Partial<Record<Connection["kind"], string>>
  // The add-connection sheet offers selfHosted behind a checkbox, so a forge
  // without it simply hides the checkbox.
  hosting: { cloud: HostingOption; selfHosted?: HostingOption }
}

export function forgeOrigin(host: string) {
  return /^https?:\/\//.test(host) ? host.replace(/\/+$/, "") : `https://${host}`
}

const GITLAB_TOKEN_HINT = (
  <>
    A personal, project or group token with the <code>api</code> scope and at least Developer access.
  </>
)

export const PROVIDERS: Record<Provider, ProviderDefinition> = {
  github: {
    label: "GitHub",
    changeNoun: "Pull request",
    changeLabel: (number) => `#${number}`,
    fileUrl(host, project, sha, path, startLine, endLine) {
      const lines = endLine > startLine ? `#L${startLine}-L${endLine}` : `#L${startLine}`
      return `${forgeOrigin(host)}/${project}/blob/${sha}/${path}${lines}`
    },
    icon: GitHubIcon,
    kindLabel: { github_app: "GitHub App", token: "GitHub token" },
    hosting: {
      cloud: {
        label: "GitHub.com",
        hint: "Install the Bammy GitHub App on the accounts and repositories to review.",
        method: { type: "app", name: "GitHub App", installHref: "/api/connections/github/install" },
      },
      selfHosted: {
        label: "Self-hosted",
        hint: (
          <>
            A personal access token from GitHub Enterprise Server with the <code>repo</code> and{" "}
            <code>admin:repo_hook</code> scopes.
          </>
        ),
        method: { type: "token", hostPlaceholder: "github.example.com", tokenPlaceholder: "ghp_..." },
      },
    },
  },
  gitlab: {
    label: "GitLab",
    changeNoun: "Merge request",
    changeLabel: (number) => `!${number}`,
    fileUrl(host, project, sha, path, startLine, endLine) {
      const lines = endLine > startLine ? `#L${startLine}-${endLine}` : `#L${startLine}`
      return `${forgeOrigin(host)}/${project}/-/blob/${sha}/${path}${lines}`
    },
    icon: GitLabIcon,
    kindLabel: { token: "GitLab token" },
    hosting: {
      cloud: {
        label: "GitLab.com",
        hint: GITLAB_TOKEN_HINT,
        method: { type: "token", fixedHost: "gitlab.com", hostPlaceholder: "gitlab.com", tokenPlaceholder: "glpat-..." },
      },
      selfHosted: {
        label: "Self-hosted",
        hint: GITLAB_TOKEN_HINT,
        method: { type: "token", hostPlaceholder: "gitlab.example.com", tokenPlaceholder: "glpat-..." },
      },
    },
  },
}

export const PROVIDER_IDS = Object.keys(PROVIDERS) as Provider[]
