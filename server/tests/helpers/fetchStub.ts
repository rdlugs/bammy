import { vi } from "vitest";

export interface StubRoute {
  method?: string;
  url: RegExp;
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
}

export interface FetchCall {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
}

// A fetch that answers from a route table and records every call. Unmatched
// requests fail loudly so a test can never reach the network by accident.
export function fetchStub(routes: StubRoute[]) {
  const calls: FetchCall[] = [];
  const fetch = vi.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input);
    const method = (init.method ?? "GET").toUpperCase();
    calls.push({
      method,
      url,
      headers: Object.fromEntries(new Headers(init.headers).entries()),
      body: typeof init.body === "string" ? init.body : undefined,
    });
    const route = routes.find((r) => (r.method ?? "GET") === method && r.url.test(url));
    if (!route) {
      throw new Error(`Unstubbed request: ${method} ${url}`);
    }
    const body =
      typeof route.body === "string" ? route.body : JSON.stringify(route.body ?? {});
    return new Response(body, { status: route.status ?? 200, headers: route.headers });
  });
  return { fetch, calls };
}
