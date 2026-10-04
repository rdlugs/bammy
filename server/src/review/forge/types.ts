import type { ChangeSet, ForgeProvider } from "../core/models.ts";

export interface ForgeRepo {
  externalId: string;
  fullPath: string;
  defaultBranch: string;
  private: boolean;
  webUrl: string;
}

export interface ChangeHead {
  headSha: string;
  title: string;
  state: "open" | "closed" | "merged";
  isDraft: boolean;
}

export interface ForgeAccount {
  login: string;
}

// One forge, bound to one set of credentials. Publishing methods join this
// interface with the publisher; everything here is read-only.
export interface ForgeAdapter {
  readonly provider: ForgeProvider;
  readonly host: string;
  currentAccount(): Promise<ForgeAccount>;
  listRepos(): Promise<ForgeRepo[]>;
  getRepo(externalId: string): Promise<ForgeRepo>;
  getChange(project: string, number: number): Promise<ChangeSet>;
  // Just enough to queue a review, without fetching the diff.
  getChangeHead(project: string, number: number): Promise<ChangeHead>;
  // Raw file content at a ref, or null when the file does not exist there.
  getFileAtRef(project: string, path: string, ref: string): Promise<string | null>;
}

// "gitlab.com" means https; a self-hosted plain-http instance keeps its scheme.
export function hostOrigin(host: string): string {
  return /^https?:\/\//.test(host) ? host.replace(/\/+$/, "") : `https://${host}`;
}
