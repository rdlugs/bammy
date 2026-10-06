import type { NextFunction, Request, Response } from "express";
import { HttpError } from "../lib/httpError.ts";
import { prisma } from "../lib/prisma.ts";

// Runs after requireAuth. The role is read from the database rather than the
// JWT, so demoting an admin takes effect on their next request.
export async function requireInstanceAdmin(req: Request, _res: Response, next: NextFunction) {
  const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { role: true } });
  if (!user) {
    throw new HttpError(401, "Not authenticated");
  }
  if (user.role !== "admin") {
    throw new HttpError(403, "Only Sentryward admins can do this");
  }
  next();
}
