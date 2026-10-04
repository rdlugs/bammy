import { markersIn, SUMMARY_MARKER } from "../core/markers.ts";
import type { ChangeSet, ChangeType, ForgeRef } from "../core/models.ts";
import { toChangedFile } from "../diff/parse.ts";
import { ForgeError, ForgeHttp, isNotFound, linkHeaderNext, type FetchLike } from "./http.ts";
import { githubApiBase } from "./githubApp.ts";
import {
  STATUS_CONTEXT,
  type ChangeHead,
  type CommitStatus,
  type ForgeAccount,
  type ForgeAdapter,
  type ForgeHooks,
  type ForgePublisher,
  type ForgeRepo,
  type HookTarget,
  type InlineComment,
  type InlineResult,
} from "./types.ts";

export interface GitHubAdapterOptions {
  host: string;
  token: () => Promise<string>;
  // The login Bammy posts as (an app's is "<slug>[bot]"), used to find its own
  // comments again.
  selfLogin?: string;
  // App installations have no user; their account comes from the installation.
  account?: () => Promise<ForgeAccount>;
  // An app lists the repositories it is installed on; a token lists the user's.
  repoSource?: "installation" | "user";
  fetch?: FetchLike;
}

interface GhRepo {
  id: number;
  full_name: string;
  default_branch: string;
  private: boolean;
  html_url: string;
}

interface GhPull {
  state: "open" | "closed";
  merged?: boolean;
  merged_at?: string | null;
  title: string;
  body: string | null;
  draft?: boolean;
  html_url: string;
  base: { sha: string; ref: string };
  head: { sha: string; ref: string };
}

interface GhFile {
  filename: string;
  previous_filename?: string;
  status: "added" | "removed" | "modified" | "renamed" | "copied" | "changed" | "unchanged";
  patch?: string;
  changes: number;
}

// GitHub caps the files endpoint at 3000 files, 100 per page.
const MAX_FILE_PAGES = 30;

function changeTypeOf(status: GhFile["status"]): ChangeType {
  switch (status) {
    case "added":
    case "copied":
      return "added";
    case "removed":
      return "deleted";
    case "renamed":
      return "renamed";
    default:
      return "modified";
  }
}

function repoApiPath(project: string): string {
  return `/repos/${project.split("/").map(encodeURIComponent).join("/")}`;
}

function toRepo(repo: GhRepo): ForgeRepo {
  return {
    externalId: String(repo.id),
    fullPath: repo.full_name,
    defaultBranch: repo.default_branch,
    private: repo.private,
    webUrl: repo.html_url,
  };
}

interface GhComment {
  id: number;
  body: string;
  user: { login: string } | null;
}

function reviewComment(comment: InlineComment) {
  return {
    path: comment.path,
    line: comment.endLine,
    side: "RIGHT" as const,
    ...(comment.endLine > comment.startLine ? { start_line: comment.startLine, start_side: "RIGHT" as const } : {}),
    body: comment.body,
  };
}

export class GitHubAdapter implements ForgeAdapter, ForgePublisher, ForgeHooks {
  readonly provider = "github" as const;
  readonly host: string;
  private http: ForgeHttp;

  constructor(private options: GitHubAdapterOptions) {
    this.host = options.host;
    this.http = new ForgeHttp({
      baseUrl: githubApiBase(options.host),
      fetch: options.fetch,
      headers: async () => ({
        Authorization: `Bearer ${await options.token()}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      }),
    });
  }

  async currentAccount(): Promise<ForgeAccount> {
    if (this.options.account) {
      return this.options.account();
    }
    const user = await this.http.json<{ login: string }>("/user");
    return { login: user.login };
  }

  async listRepos(): Promise<ForgeRepo[]> {
    if (this.options.repoSource === "user") {
      const repos = await this.http.paginate<GhRepo>(
        "/user/repos?per_page=100&affiliation=owner,collaborator,organization_member",
        linkHeaderNext,
        10,
      );
      return repos.map(toRepo);
    }
    const repos = await this.http.paginate<GhRepo>(
      "/installation/repositories?per_page=100",
      linkHeaderNext,
      10,
      (body) => (body as { repositories: GhRepo[] }).repositories,
    );
    return repos.map(toRepo);
  }

  async getRepo(externalId: string): Promise<ForgeRepo> {
    return toRepo(await this.http.json<GhRepo>(`/repositories/${encodeURIComponent(externalId)}`));
  }

  async getChange(project: string, number: number): Promise<ChangeSet> {
    const repoPath = repoApiPath(project);
    const pull = await this.http.json<GhPull>(`${repoPath}/pulls/${number}`);
    const files = await this.http.paginate<GhFile>(
      `${repoPath}/pulls/${number}/files?per_page=100`,
      linkHeaderNext,
      MAX_FILE_PAGES,
    );

    return {
      forgeRef: {
        provider: "github",
        host: this.host,
        project,
        number,
        baseSha: pull.base.sha,
        startSha: pull.base.sha,
        headSha: pull.head.sha,
        webUrl: pull.html_url,
      },
      title: pull.title,
      description: pull.body ?? "",
      baseRef: pull.base.ref,
      headRef: pull.head.ref,
      isDraft: pull.draft ?? false,
      files: files.map((file) =>
        toChangedFile({
          path: file.filename,
          previousPath: file.previous_filename,
          changeType: changeTypeOf(file.status),
          // GitHub omits `patch` for binary files and for oversized diffs; a
          // pure rename or empty file has no changes and so no patch either.
          patch: file.patch ?? (file.changes === 0 ? "" : undefined),
        }),
      ),
    };
  }

  async getChangeHead(project: string, number: number): Promise<ChangeHead> {
    const pull = await this.http.json<GhPull>(`${repoApiPath(project)}/pulls/${number}`);
    const merged = pull.merged ?? Boolean(pull.merged_at);
    return {
      headSha: pull.head.sha,
      title: pull.title,
      state: merged ? "merged" : pull.state,
      isDraft: pull.draft ?? false,
    };
  }

  async getFileAtRef(project: string, path: string, ref: string): Promise<string | null> {
    const encodedPath = path.split("/").map(encodeURIComponent).join("/");
    try {
      const res = await this.http.request(
        `${repoApiPath(project)}/contents/${encodedPath}?ref=${encodeURIComponent(ref)}`,
        { headers: { Accept: "application/vnd.github.raw+json" } },
      );
      return await res.text();
    } catch (err) {
      if (isNotFound(err)) {
        return null;
      }
      throw err;
    }
  }

  private isSelf(comment: GhComment): boolean {
    return Boolean(this.options.selfLogin) && comment.user?.login === this.options.selfLogin;
  }

  // One review carries every inline comment, posted as COMMENT: Bammy never
  // approves or requests changes. If GitHub rejects the batch (one bad anchor
  // fails the whole request), each comment is retried on its own so one
  // problem does not lose the rest.
  async postInlineComments(ref: ForgeRef, comments: InlineComment[]): Promise<InlineResult> {
    if (comments.length === 0) return { posted: [], failed: [] };
    const pulls = `${repoApiPath(ref.project)}/pulls/${ref.number}`;
    try {
      const review = await this.http.json<{ id: number }>(`${pulls}/reviews`, {
        method: "POST",
        body: JSON.stringify({ commit_id: ref.headSha, event: "COMMENT", comments: comments.map(reviewComment) }),
      });
      const created = await this.http.paginate<GhComment>(
        `${pulls}/reviews/${review.id}/comments?per_page=100`,
        linkHeaderNext,
      );
      const idByPrint = new Map<string, string>();
      for (const comment of created) {
        for (const print of markersIn(comment.body)) idByPrint.set(print, String(comment.id));
      }
      return {
        posted: comments.map((c) => ({ fingerprint: c.fingerprint, forgeCommentId: idByPrint.get(c.fingerprint) ?? `review:${review.id}` })),
        failed: [],
      };
    } catch (err) {
      if (!(err instanceof ForgeError) || err.status !== 422) throw err;
    }

    const result: InlineResult = { posted: [], failed: [] };
    for (const comment of comments) {
      try {
        const created = await this.http.json<GhComment>(`${pulls}/comments`, {
          method: "POST",
          body: JSON.stringify({ commit_id: ref.headSha, ...reviewComment(comment) }),
        });
        result.posted.push({ fingerprint: comment.fingerprint, forgeCommentId: String(created.id) });
      } catch (err) {
        result.failed.push({ fingerprint: comment.fingerprint, error: err instanceof Error ? err.message : String(err) });
      }
    }
    return result;
  }

  async listPostedFingerprints(ref: ForgeRef): Promise<Set<string>> {
    const comments = await this.http.paginate<GhComment>(
      `${repoApiPath(ref.project)}/pulls/${ref.number}/comments?per_page=100`,
      linkHeaderNext,
    );
    return new Set(comments.filter((c) => this.isSelf(c)).flatMap((c) => markersIn(c.body)));
  }

  async upsertSummaryComment(ref: ForgeRef, body: string): Promise<string> {
    const issue = `${repoApiPath(ref.project)}/issues/${ref.number}`;
    const comments = await this.http.paginate<GhComment>(`${issue}/comments?per_page=100`, linkHeaderNext);
    const existing = comments.filter((c) => this.isSelf(c) && c.body.includes(SUMMARY_MARKER)).at(-1);
    const saved = existing
      ? await this.http.json<GhComment>(`${repoApiPath(ref.project)}/issues/comments/${existing.id}`, {
          method: "PATCH",
          body: JSON.stringify({ body }),
        })
      : await this.http.json<GhComment>(`${issue}/comments`, { method: "POST", body: JSON.stringify({ body }) });
    return String(saved.id);
  }

  async setCommitStatus(ref: ForgeRef, status: CommitStatus): Promise<void> {
    await this.http.request(`${repoApiPath(ref.project)}/statuses/${ref.headSha}`, {
      method: "POST",
      body: JSON.stringify({
        state: status.state,
        context: STATUS_CONTEXT,
        description: status.description.slice(0, 140),
        ...(status.targetUrl ? { target_url: status.targetUrl } : {}),
      }),
    });
  }

  async createHook(repo: HookTarget, url: string, secret: string): Promise<string> {
    const hook = await this.http.json<{ id: number }>(`${repoApiPath(repo.fullPath)}/hooks`, {
      method: "POST",
      body: JSON.stringify({
        name: "web",
        active: true,
        events: ["pull_request", "issue_comment"],
        config: { url, secret, content_type: "json", insecure_ssl: "0" },
      }),
    });
    return String(hook.id);
  }

  async deleteHook(repo: HookTarget, hookId: string): Promise<void> {
    try {
      await this.http.request(`${repoApiPath(repo.fullPath)}/hooks/${encodeURIComponent(hookId)}`, { method: "DELETE" });
    } catch (err) {
      if (!isNotFound(err)) throw err;
    }
  }
}
