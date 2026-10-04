import type { Request, Response } from "express";
import { prisma } from "../lib/prisma.ts";
import { hashPassword, verifyPassword } from "../lib/password.ts";
import { AUTH_COOKIE, authCookieOptions, signToken } from "../lib/jwt.ts";
import { HttpError } from "../lib/httpError.ts";
import { loginSchema, registerSchema } from "../schemas/auth.schema.ts";

export const publicUser = { id: true, name: true, email: true, createdAt: true } as const;

function setAuthCookie(res: Response, userId: string) {
  res.cookie(AUTH_COOKIE, signToken(userId), authCookieOptions);
}

export async function register(req: Request, res: Response) {
  const { name, email, password } = registerSchema.parse(req.body);

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new HttpError(409, "An account with this email already exists");
  }

  const user = await prisma.user.create({
    data: { name, email, passwordHash: await hashPassword(password) },
    select: publicUser,
  });

  setAuthCookie(res, user.id);
  res.status(201).json({ user });
}

export async function login(req: Request, res: Response) {
  const { email, password } = loginSchema.parse(req.body);

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await verifyPassword(user.passwordHash, password))) {
    throw new HttpError(401, "Invalid email or password");
  }

  setAuthCookie(res, user.id);
  res.json({ user: { id: user.id, name: user.name, email: user.email, createdAt: user.createdAt } });
}

export function clearAuthCookie(res: Response) {
  const { maxAge: _maxAge, ...clearOptions } = authCookieOptions;
  res.clearCookie(AUTH_COOKIE, clearOptions);
}

export function logout(_req: Request, res: Response) {
  clearAuthCookie(res);
  res.status(204).end();
}

export async function me(req: Request, res: Response) {
  const user = await prisma.user.findUnique({ where: { id: req.userId }, select: publicUser });
  if (!user) {
    throw new HttpError(401, "Not authenticated");
  }
  res.json({ user });
}
