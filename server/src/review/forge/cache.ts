// A small in-process cache for forge reads whose answer is fixed by a commit
// sha: a file at a revision, and a change's diff between two shas. Reruns and
// re-reviews of the same head then skip the forge calls. Anything that can
// change without a new commit (title, description, labels, draft state) is
// never cached. `review.disableCache` turns it off for a repository.

const DEFAULT_MAX_ENTRIES = 200;
const DEFAULT_TTL_MS = 10 * 60_000;

interface Entry {
  value: unknown;
  expiresAt: number;
}

export class ForgeCache {
  // A Map iterates in insertion order, so re-inserting on read makes the
  // first key the least recently used.
  private entries = new Map<string, Entry>();

  constructor(
    private maxEntries = DEFAULT_MAX_ENTRIES,
    private ttlMs = DEFAULT_TTL_MS,
    private now: () => number = Date.now,
  ) {}

  get size(): number {
    return this.entries.size;
  }

  clear(): void {
    this.entries.clear();
  }

  // Concurrent misses for the same key each fetch; the last one wins. Jobs for
  // the same head are deduplicated by the queue, so this is rare and harmless.
  async memo<T>(key: string, fetch: () => Promise<T>): Promise<T> {
    const entry = this.entries.get(key);
    if (entry && entry.expiresAt > this.now()) {
      this.entries.delete(key);
      this.entries.set(key, entry);
      return entry.value as T;
    }
    this.entries.delete(key);
    const value = await fetch();
    this.entries.set(key, { value, expiresAt: this.now() + this.ttlMs });
    while (this.entries.size > this.maxEntries) {
      this.entries.delete(this.entries.keys().next().value!);
    }
    return value;
  }
}

// Fetches straight through when there is no cache, so callers need not branch.
export function cached<T>(cache: ForgeCache | undefined, key: string, fetch: () => Promise<T>): Promise<T> {
  return cache ? cache.memo(key, fetch) : fetch();
}

export function cacheKey(...parts: (string | number)[]): string {
  return JSON.stringify(parts);
}

// The worker's cache, shared by every job it runs.
export const forgeCache = new ForgeCache();
