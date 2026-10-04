import { prisma } from "../../src/lib/prisma.ts";
import { AUTH_COOKIE, signToken } from "../../src/lib/jwt.ts";

export async function createUser(email = "dev@example.com") {
  const user = await prisma.user.create({ data: { name: "Dev", email, passwordHash: "x" } });
  return { user, cookie: `${AUTH_COOKIE}=${signToken(user.id)}` };
}
