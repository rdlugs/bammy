import type { NextFunction, Request, Response } from "express";
import { AUTH_COOKIE, verifyToken } from "../lib/jwt.ts";
import { HttpError } from "../lib/httpError.ts";

declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.[AUTH_COOKIE];
  const payload = typeof token === "string" ? verifyToken(token) : null;
  if (!payload) {
    throw new HttpError(401, "Not authenticated");
  }
  req.userId = payload.sub;
  next();
}
