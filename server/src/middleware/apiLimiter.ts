import type { Request } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { env } from "../config/env.ts";

// Keyed by user once requireAuth has run: in development every request reaches
// the API through the Vite proxy, so a per-IP limit would be one shared bucket.
// Requests without a user (logout, the GitHub install callback) fall back to IP.
function userOrIp(req: Request): string {
  return req.userId ? `user:${req.userId}` : `ip:${ipKeyGenerator(req.ip ?? "")}`;
}

// Generous enough for dashboard polling; it exists to bound runaway clients and
// scripted abuse of endpoints that queue model work or call forges.
export function createUserLimiter(limit: number, skip: () => boolean = () => false) {
  return rateLimit({
    windowMs: 60 * 1000,
    limit,
    keyGenerator: userOrIp,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    skip,
    message: { message: "Too many requests, please slow down" },
  });
}

export const userLimiter = createUserLimiter(600, () => env.NODE_ENV === "test");

// Webhooks arrive unauthenticated until their signature is checked, so they are
// limited by sender before the body is read.
export const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skip: () => env.NODE_ENV === "test",
  message: { message: "Too many requests" },
});
