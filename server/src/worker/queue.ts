import { prisma } from "../lib/prisma.ts";
import type { ReviewJob, ReviewTrigger } from "../generated/prisma/client.ts";

export interface EnqueueInput {
  repositoryId: string;
  number: number;
  headSha: string;
  trigger: ReviewTrigger;
}

// A newer push makes any still-queued review of the same PR pointless, so it is
// marked superseded rather than left to spend a model call. A job for the same
// head that is already queued or running is returned instead of duplicated.
export async function enqueue(input: EnqueueInput): Promise<ReviewJob> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.reviewJob.findFirst({
      where: {
        repositoryId: input.repositoryId,
        number: input.number,
        headSha: input.headSha,
        status: { in: ["queued", "running"] },
      },
    });
    if (existing) {
      return existing;
    }

    await tx.reviewJob.updateMany({
      where: {
        repositoryId: input.repositoryId,
        number: input.number,
        status: "queued",
      },
      data: { status: "superseded", finishedAt: new Date() },
    });

    return tx.reviewJob.create({ data: input });
  });
}

// Claims the oldest queued job. SKIP LOCKED lets several workers poll the same
// table without ever handing one job to two of them.
export async function claimNext(): Promise<ReviewJob | null> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    UPDATE review_jobs
    SET status = 'running', locked_at = now(), started_at = now(), attempts = attempts + 1
    WHERE id = (
      SELECT id FROM review_jobs
      WHERE status = 'queued'
      ORDER BY created_at
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING id
  `;
  const claimed = rows[0];
  return claimed ? prisma.reviewJob.findUnique({ where: { id: claimed.id } }) : null;
}

export interface CompleteInput {
  status: "completed" | "partial" | "failed";
  verdict: ReviewJob["verdict"];
  result: unknown;
  summary?: unknown;
  publication?: unknown;
  resolvedConfig?: unknown;
  error?: string | null;
}

export async function complete(id: string, input: CompleteInput & Partial<Pick<ReviewJob, "headSha" | "baseSha">>): Promise<void> {
  await prisma.reviewJob.update({
    where: { id },
    data: {
      headSha: input.headSha,
      baseSha: input.baseSha,
      status: input.status,
      verdict: input.verdict,
      result: input.result as object,
      summary: input.summary as object | undefined,
      publication: input.publication as object | undefined,
      resolvedConfig: input.resolvedConfig as object | undefined,
      error: input.error ?? null,
      lockedAt: null,
      finishedAt: new Date(),
    },
  });
}

export async function fail(id: string, error: string): Promise<void> {
  await prisma.reviewJob.update({
    where: { id },
    data: { status: "failed", verdict: "error", error, lockedAt: null, finishedAt: new Date() },
  });
}

// A worker that died mid-job leaves it running forever. Jobs locked longer than
// the timeout go back to the queue, or fail once they have used every attempt.
export async function recoverStale(lockTimeoutMs: number, maxAttempts: number): Promise<number> {
  const cutoff = new Date(Date.now() - lockTimeoutMs);
  const [requeued, failed] = await prisma.$transaction([
    prisma.reviewJob.updateMany({
      where: { status: "running", lockedAt: { lt: cutoff }, attempts: { lt: maxAttempts } },
      data: { status: "queued", lockedAt: null },
    }),
    prisma.reviewJob.updateMany({
      where: { status: "running", lockedAt: { lt: cutoff }, attempts: { gte: maxAttempts } },
      data: {
        status: "failed",
        verdict: "error",
        error: "Worker stopped responding",
        lockedAt: null,
        finishedAt: new Date(),
      },
    }),
  ]);
  return requeued.count + failed.count;
}
