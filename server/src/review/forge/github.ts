import type { ChangeSet, ChangeType } from "../core/models.ts";
import { toChangedFile } from "../diff/parse.ts";
import { ForgeHttp, isNotFound, linkHeaderNext, type FetchLike } from "./http.ts";
import { githubApiBase } from "./githubApp.ts";
import type { ChangeHead, ForgeAccount, ForgeAdapter, ForgeRepo } from "./types.ts";

export interface GitHubAdapterOptions {
  host: string;
  token: () => Promise<string>;
  // App installations have no user; their account comes from the installation.
  account?: () => Promise<ForgeAccount>;
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

export class GitHubAdapter implements ForgeAdapter {
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
}
