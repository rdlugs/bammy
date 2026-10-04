import { markersIn, SUMMARY_MARKER } from "../core/markers.ts";
import type { ChangeSet, ChangeType, ForgeRef } from "../core/models.ts";
import { toChangedFile } from "../diff/parse.ts";
import { ForgeHttp, isNotFound, type FetchLike } from "./http.ts";
import {
  hostOrigin,
  STATUS_CONTEXT,
  type ChangeHead,
  type CommitState,
  type CommitStatus,
  type ForgeAccount,
  type ForgeAdapter,
  type ForgePublisher,
  type ForgeRepo,
  type InlineComment,
  type InlineResult,
} from "./types.ts";

export interface GitLabAdapterOptions {
  host: string;
  token: () => Promise<string>;
  // The username Bammy posts as (the token's user), to find its own notes.
  selfLogin?: string;
  fetch?: FetchLike;
}

interface GlProject {
  id: number;
  path_with_namespace: string;
  default_branch: string | null;
  visibility: "private" | "internal" | "public";
  web_url: string;
}

interface GlMergeRequest {
  state: "opened" | "closed" | "merged" | "locked";
  sha: string;
  title: string;
  description: string | null;
  draft?: boolean;
  work_in_progress?: boolean;
  web_url: string;
  source_branch: string;
  target_branch: string;
  diff_refs: { base_sha: string; start_sha: string; head_sha: string } | null;
}

interface GlDiff {
  old_path: string;
  new_path: string;
  new_file: boolean;
  renamed_file: boolean;
  deleted_file: boolean;
  diff: string;
  too_large?: boolean;
  collapsed?: boolean;
}

function changeTypeOf(diff: GlDiff): ChangeType {
  if (diff.new_file) return "added";
  if (diff.deleted_file) return "deleted";
  if (diff.renamed_file) return "renamed";
  return "modified";
}

function toRepo(project: GlProject): ForgeRepo {
  return {
    externalId: String(project.id),
    fullPath: project.path_with_namespace,
    defaultBranch: project.default_branch ?? "main",
    private: project.visibility !== "public",
    webUrl: project.web_url,
  };
}

function nextPage(res: Response, current: string): string | null {
  const next = res.headers.get("x-next-page");
  if (!next) {
    return null;
  }
  const url = new URL(current, "http://placeholder");
  url.searchParams.set("page", next);
  return `${url.pathname}${url.search}`;
}

interface GlNote {
  id: number;
  body: string;
  system: boolean;
  author: { username: string };
}

interface GlDiscussion {
  id: string;
  notes: GlNote[];
}

// GitLab has no "error" state; a review that could not finish fails the check.
const GITLAB_STATE: Record<CommitState, string> = {
  pending: "running",
  success: "success",
  failure: "failed",
  error: "failed",
};

export class GitLabAdapter implements ForgeAdapter, ForgePublisher {
  readonly provider = "gitlab" as const;
  readonly host: string;
  private http: ForgeHttp;
  private selfLogin: string | undefined;

  constructor(options: GitLabAdapterOptions) {
    this.selfLogin = options.selfLogin;
    this.host = options.host;
    this.http = new ForgeHttp({
      baseUrl: `${hostOrigin(options.host)}/api/v4`,
      fetch: options.fetch,
      headers: async () => ({ "PRIVATE-TOKEN": await options.token() }),
    });
  }

  private project(project: string): string {
    return `/projects/${encodeURIComponent(project)}`;
  }

  async currentAccount(): Promise<ForgeAccount> {
    const user = await this.http.json<{ username: string }>("/user");
    return { login: user.username };
  }

  async listRepos(): Promise<ForgeRepo[]> {
    // Developer access (30) is the least that can read MRs and post discussions.
    const projects = await this.http.paginate<GlProject>(
      "/projects?membership=true&min_access_level=30&archived=false&per_page=100&order_by=last_activity_at",
      nextPage,
      10,
    );
    return projects.map(toRepo);
  }

  async getRepo(externalId: string): Promise<ForgeRepo> {
    return toRepo(await this.http.json<GlProject>(this.project(externalId)));
  }

  async getChange(project: string, number: number): Promise<ChangeSet> {
    const base = `${this.project(project)}/merge_requests/${number}`;
    const mr = await this.http.json<GlMergeRequest>(base);
    if (!mr.diff_refs) {
      throw new Error(`Merge request !${number} has no diff yet`);
    }
    const diffs = await this.http.paginate<GlDiff>(`${base}/diffs?per_page=100`, nextPage);

    return {
      forgeRef: {
        provider: "gitlab",
        host: this.host,
        project,
        number,
        baseSha: mr.diff_refs.base_sha,
        startSha: mr.diff_refs.start_sha,
        headSha: mr.diff_refs.head_sha,
        webUrl: mr.web_url,
      },
      title: mr.title,
      description: mr.description ?? "",
      baseRef: mr.target_branch,
      headRef: mr.source_branch,
      isDraft: mr.draft ?? mr.work_in_progress ?? false,
      files: diffs.map((diff) =>
        toChangedFile({
          path: diff.deleted_file ? diff.old_path : diff.new_path,
          previousPath: diff.old_path,
          changeType: changeTypeOf(diff),
          // GitLab empties `diff` and flags it when a file is over its limits.
          patch: diff.too_large || diff.collapsed ? undefined : diff.diff,
        }),
      ),
    };
  }

  async getChangeHead(project: string, number: number): Promise<ChangeHead> {
    const mr = await this.http.json<GlMergeRequest>(`${this.project(project)}/merge_requests/${number}`);
    return {
      headSha: mr.diff_refs?.head_sha ?? mr.sha,
      title: mr.title,
      state: mr.state === "merged" ? "merged" : mr.state === "closed" ? "closed" : "open",
      isDraft: mr.draft ?? mr.work_in_progress ?? false,
    };
  }

  async getFileAtRef(project: string, path: string, ref: string): Promise<string | null> {
    try {
      const res = await this.http.request(
        `${this.project(project)}/repository/files/${encodeURIComponent(path)}/raw?ref=${encodeURIComponent(ref)}`,
      );
      return await res.text();
    } catch (err) {
      if (isNotFound(err)) {
        return null;
      }
      throw err;
    }
  }

  private mergeRequest(ref: ForgeRef): string {
    return `${this.project(ref.project)}/merge_requests/${ref.number}`;
  }

  private isSelf(note: GlNote): boolean {
    return !note.system && Boolean(this.selfLogin) && note.author.username === this.selfLogin;
  }

  // GitLab has no batch review API, so each finding is its own discussion. A
  // multi-line finding is anchored on its first line; its suggestion block
  // carries the range.
  async postInlineComments(ref: ForgeRef, comments: InlineComment[]): Promise<InlineResult> {
    const result: InlineResult = { posted: [], failed: [] };
    for (const comment of comments) {
      const position = {
        position_type: "text",
        base_sha: ref.baseSha,
        start_sha: ref.startSha,
        head_sha: ref.headSha,
        new_path: comment.path,
        old_path: comment.previousPath ?? comment.path,
        new_line: comment.startLine,
        ...(comment.oldLine !== undefined ? { old_line: comment.oldLine } : {}),
      };
      try {
        const discussion = await this.http.json<GlDiscussion>(`${this.mergeRequest(ref)}/discussions`, {
          method: "POST",
          body: JSON.stringify({ body: comment.body, position }),
        });
        result.posted.push({ fingerprint: comment.fingerprint, forgeCommentId: discussion.id });
      } catch (err) {
        result.failed.push({ fingerprint: comment.fingerprint, error: err instanceof Error ? err.message : String(err) });
      }
    }
    return result;
  }

  async listPostedFingerprints(ref: ForgeRef): Promise<Set<string>> {
    const discussions = await this.http.paginate<GlDiscussion>(
      `${this.mergeRequest(ref)}/discussions?per_page=100`,
      nextPage,
    );
    return new Set(
      discussions.flatMap((d) => d.notes.slice(0, 1)).filter((n) => this.isSelf(n)).flatMap((n) => markersIn(n.body)),
    );
  }

  async upsertSummaryComment(ref: ForgeRef, body: string): Promise<string> {
    const notes = await this.http.paginate<GlNote>(`${this.mergeRequest(ref)}/notes?per_page=100&sort=asc`, nextPage);
    const existing = notes.filter((n) => this.isSelf(n) && n.body.includes(SUMMARY_MARKER)).at(-1);
    const saved = existing
      ? await this.http.json<GlNote>(`${this.mergeRequest(ref)}/notes/${existing.id}`, {
          method: "PUT",
          body: JSON.stringify({ body }),
        })
      : await this.http.json<GlNote>(`${this.mergeRequest(ref)}/notes`, { method: "POST", body: JSON.stringify({ body }) });
    return String(saved.id);
  }

  async setCommitStatus(ref: ForgeRef, status: CommitStatus): Promise<void> {
    await this.http.request(`${this.project(ref.project)}/statuses/${ref.headSha}`, {
      method: "POST",
      body: JSON.stringify({
        state: GITLAB_STATE[status.state],
        name: STATUS_CONTEXT,
        description: status.description.slice(0, 255),
        ...(status.targetUrl ? { target_url: status.targetUrl } : {}),
      }),
    });
  }

  // Project hooks need Maintainer access; callers treat a failure as "automatic
  // reviews unavailable" rather than an error.
  async createProjectHook(project: string, url: string, token: string): Promise<string> {
    const hook = await this.http.json<{ id: number }>(`${this.project(project)}/hooks`, {
      method: "POST",
      body: JSON.stringify({
        url,
        token,
        merge_requests_events: true,
        note_events: true,
        push_events: false,
        enable_ssl_verification: true,
      }),
    });
    return String(hook.id);
  }

  async deleteProjectHook(project: string, hookId: string): Promise<void> {
    try {
      await this.http.request(`${this.project(project)}/hooks/${encodeURIComponent(hookId)}`, { method: "DELETE" });
    } catch (err) {
      if (!isNotFound(err)) throw err;
    }
  }

  // Effective access level of a user on the project, inherited membership
  // included; 0 when they are not a member.
  async memberAccessLevel(project: string, userId: number): Promise<number> {
    try {
      const member = await this.http.json<{ access_level: number }>(`${this.project(project)}/members/all/${userId}`);
      return member.access_level;
    } catch (err) {
      if (isNotFound(err)) return 0;
      throw err;
    }
  }
}
