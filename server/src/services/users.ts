import { HttpError } from "../lib/httpError.ts";
import { Prisma, type PrismaClient } from "../generated/prisma/client.ts";

const EMAIL_TAKEN = "An account with this email already exists";

export function emailTaken(): HttpError {
  return new HttpError(409, EMAIL_TAKEN, { email: [EMAIL_TAKEN] });
}

// The check gives a friendly field error up front; callers still catch the
// unique violation (isUniqueViolation) for an account that claims the email
// between the check and the update.
export async function assertEmailAvailable(
  db: PrismaClient | Prisma.TransactionClient,
  email: string,
  userId: string,
): Promise<void> {
  const owner = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (owner && owner.id !== userId) {
    throw emailTaken();
  }
}

export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
