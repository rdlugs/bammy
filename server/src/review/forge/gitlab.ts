import type { ChangeSet, ChangeType } from "../core/models.ts";
import { toChangedFile } from "../diff/parse.ts";
import { ForgeHttp, isNotFound, type FetchLike } from "./http.ts";
import { hostOrigin, type ChangeHead, type ForgeAccount, type ForgeAdapter, type ForgeRepo } from "./types.ts";

export interface GitLabAdapterOptions {
  host: string;
  token: () => Promise<string>;
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

export class GitLabAdapter implements ForgeAdapter {
  readonly provider = "gitlab" as const;
  readonly host: string;
  private http: ForgeHttp;

  constructor(options: GitLabAdapterOptions) {
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
}
