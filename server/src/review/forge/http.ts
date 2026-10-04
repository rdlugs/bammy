export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export class ForgeError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface ForgeHttpOptions {
  baseUrl: string;
  headers: () => Promise<Record<string, string>>;
  fetch?: FetchLike;
}

// Thin JSON client shared by both adapters. Errors carry the forge's status so
// callers can tell "not found" from "not allowed" from "the forge is down".
export class ForgeHttp {
  constructor(private options: ForgeHttpOptions) {}

  async request(path: string, init: RequestInit = {}): Promise<Response> {
    const url = path.startsWith("http") ? path : `${this.options.baseUrl}${path}`;
    const doFetch = this.options.fetch ?? globalThis.fetch;
    const json: Record<string, string> = typeof init.body === "string" ? { "Content-Type": "application/json" } : {};
    const res = await doFetch(url, {
      ...init,
      headers: { ...json, ...(await this.options.headers()), ...(init.headers as Record<string, string> | undefined) },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      let message = body.slice(0, 300);
      try {
        const parsed = JSON.parse(body) as { message?: unknown; error?: unknown };
        message = String(parsed.message ?? parsed.error ?? message);
      } catch {
        // Not JSON; keep the raw excerpt.
      }
      throw new ForgeError(res.status, `${init.method ?? "GET"} ${url} failed (${res.status}): ${message}`);
    }
    return res;
  }

  async json<T>(path: string, init?: RequestInit): Promise<T> {
    return (await this.request(path, init)).json() as Promise<T>;
  }

  // Follows pagination until exhausted or `maxPages` is reached. `nextUrl` reads
  // the forge's own pagination signal from the response.
  async paginate<T>(
    path: string,
    nextUrl: (res: Response, current: string) => string | null,
    maxPages = 30,
    pick: (body: unknown) => T[] = (body) => body as T[],
  ): Promise<T[]> {
    const items: T[] = [];
    let url: string | null = path;
    for (let page = 0; url && page < maxPages; page++) {
      const res = await this.request(url);
      items.push(...pick(await res.json()));
      url = nextUrl(res, url);
    }
    return items;
  }
}

export function linkHeaderNext(res: Response): string | null {
  const link = res.headers.get("link");
  const match = link?.split(",").find((part) => /rel="next"/.test(part));
  return match ? (/<([^>]+)>/.exec(match)?.[1] ?? null) : null;
}

export function isNotFound(err: unknown): boolean {
  return err instanceof ForgeError && err.status === 404;
}
