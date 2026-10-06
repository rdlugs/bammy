import { HttpError } from "../lib/httpError.ts";
import type { Prisma } from "../generated/prisma/client.ts";

// Call inside the transaction that demotes or deletes `userId`. Locking the
// admin rows makes two admins demoting each other at once serialize, so the
// second one sees it would leave the instance without an admin.
export async function assertAnotherAdminRemains(tx: Prisma.TransactionClient, userId: string): Promise<void> {
  const admins = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM users WHERE role = 'admin' ORDER BY id FOR UPDATE
  `;
  if (admins.some((admin) => admin.id === userId) && admins.length === 1) {
    throw new HttpError(409, "Sentryward needs at least one admin; make someone else an admin first");
  }
}
