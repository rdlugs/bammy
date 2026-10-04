import { createHash, timingSafeEqual } from "node:crypto";
import { HttpError } from "./httpError.ts";

// "/bammy review" at the start of any line of a comment.
export const REVIEW_COMMAND = /^\/bammy\s+review\b/im;

// Equal-length digests so the comparison takes the same time whatever the input.
export function safeEqual(a: string, b: string): boolean {
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(a), digest(b));
}

export function parseJson<T>(raw: Buffer): T {
  try {
    return JSON.parse(raw.toString("utf8")) as T;
  } catch {
    throw new HttpError(400, "Body is not JSON");
  }
}
