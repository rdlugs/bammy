import type { ChangeSet, ForgeProvider, ForgeRef } from "../core/models.ts";

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

// An open PR/MR as listed for picking one to review by hand.
export interface ChangeSummary {
  number: number;
  title: string;
  author?: string;
  isDraft: boolean;
  headSha: string;
  sourceBranch: string;
  targetBranch: string;
  webUrl: string;
  updatedAt: string;
}

// Busy repositories can have thousands of open changes; the most recently
// updated few hundred are the ones anyone would pick by hand.
export const MAX_OPEN_CHANGE_PAGES = 3;

export interface ForgeAccount {
  login: string;
}

// One forge, bound to one set of credentials. The read side; publishing is
// ForgePublisher below, which both adapters also implement.
export interface ForgeAdapter {
  readonly provider: ForgeProvider;
  readonly host: string;
  currentAccount(): Promise<ForgeAccount>;
  listRepos(): Promise<ForgeRepo[]>;
  getRepo(externalId: string): Promise<ForgeRepo>;
  getChange(project: string, number: number): Promise<ChangeSet>;
  // Just enough to queue a review, without fetching the diff.
  getChangeHead(project: string, number: number): Promise<ChangeHead>;
  // Open changes, most recently updated first.
  listOpenChanges(project: string): Promise<ChangeSummary[]>;
  // Raw file content at a ref, or null when the file does not exist there.
  getFileAtRef(project: string, path: string, ref: string): Promise<string | null>;
}

// Webhooks Bammy registers on one repository, for forges (or connection kinds)
// that do not deliver events through an app.
export interface HookTarget {
  externalId: string;
  fullPath: string;
}

export interface ForgeHooks {
  createHook(repo: HookTarget, url: string, secret: string): Promise<string>;
  // Succeeds when the hook is already gone.
  deleteHook(repo: HookTarget, hookId: string): Promise<void>;
}

// "gitlab.com" means https; a self-hosted plain-http instance keeps its scheme.
export function hostOrigin(host: string): string {
  return /^https?:\/\//.test(host) ? host.replace(/\/+$/, "") : `https://${host}`;
}

// ---------------------------------------------------------------------------
// Publishing. Only publishers translate new-file lines into forge positions.
// ---------------------------------------------------------------------------

export interface InlineComment {
  fingerprint: string;
  path: string;
  previousPath?: string;
  startLine: number;
  endLine: number;
  // Set when startLine is an unchanged context line; GitLab needs it.
  oldLine?: number;
  body: string;
}

export interface PostedComment {
  fingerprint: string;
  forgeCommentId: string;
}

export interface InlineResult {
  posted: PostedComment[];
  failed: { fingerprint: string; error: string }[];
}

export type CommitState = "pending" | "success" | "failure" | "error";

export interface CommitStatus {
  state: CommitState;
  description: string;
  targetUrl?: string;
}

export const STATUS_CONTEXT = "bammy/review";

export interface ForgePublisher {
  postInlineComments(ref: ForgeRef, comments: InlineComment[]): Promise<InlineResult>;
  // Fingerprints in Bammy's own inline comments on this change, read from their
  // hidden markers, so a lost database row never means a duplicate comment.
  listPostedFingerprints(ref: ForgeRef): Promise<Set<string>>;
  // Creates Bammy's summary comment, or edits the one it posted before.
  upsertSummaryComment(ref: ForgeRef, body: string): Promise<string>;
  // The same for any comment Bammy owns, found by the hidden marker in its body.
  upsertComment(ref: ForgeRef, marker: string, body: string): Promise<string>;
  // Rewrites the PR/MR description from its current text.
  updateDescription(ref: ForgeRef, transform: (description: string) => string): Promise<void>;
  // Adds and removes labels; removing one the change does not carry is not an error.
  setLabels(ref: ForgeRef, add: string[], remove: string[]): Promise<void>;
  setCommitStatus(ref: ForgeRef, status: CommitStatus): Promise<void>;
}
