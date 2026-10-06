import jwt from "jsonwebtoken";
import type { CookieOptions } from "express";
import { env } from "../config/env.ts";

export const AUTH_COOKIE = "sentryward_token";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

type TokenPayload = { sub: string };

export function signToken(userId: string) {
  return jwt.sign({ sub: userId } satisfies TokenPayload, env.JWT_SECRET, {
    expiresIn: MAX_AGE_SECONDS,
  });
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET);
    if (typeof payload === "object" && typeof payload.sub === "string") {
      return { sub: payload.sub };
    }
    return null;
  } catch {
    return null;
  }
}

export const authCookieOptions: CookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  secure: env.NODE_ENV === "production",
  path: "/",
  maxAge: MAX_AGE_SECONDS * 1000,
};
