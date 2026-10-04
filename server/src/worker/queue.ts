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

// Forge redeliveries and repeated events must not review a commit twice, and a
// burst of pushes must not pile up work: a repository holds at most this many
// queued jobs (newer pushes already supersede older ones).
const MAX_QUEUED_PER_REPOSITORY = 10;

export type WebhookEnqueueResult =
  | { queued: true; job: ReviewJob }
  | { queued: false; reason: "duplicate" | "queue_full" };

// For automatic triggers: a head that was ever queued or reviewed is left
// alone. A person asking explicitly (manual or comment) goes through enqueue().
export async function enqueueFromWebhook(input: EnqueueInput): Promise<WebhookEnqueueResult> {
  const seen = await prisma.reviewJob.findFirst({
    where: {
      repositoryId: input.repositoryId,
      number: input.number,
      headSha: input.headSha,
      status: { not: "superseded" },
    },
    select: { id: true },
  });
  if (seen) return { queued: false, reason: "duplicate" };

  const queued = await prisma.reviewJob.count({
    where: { repositoryId: input.repositoryId, status: "queued", number: { not: input.number } },
  });
  if (queued >= MAX_QUEUED_PER_REPOSITORY) return { queued: false, reason: "queue_full" };

  return { queued: true, job: await enqueue(input) };
}

// Claims the oldest queued job whose owner is under the per-user running
// limit. SKIP LOCKED lets several workers poll the same table without ever
// handing one job to two of them. Two workers claiming for the same user at
// the same instant can exceed the limit by one; it is a fairness bound, not a
// hard quota.
export async function claimNext(userConcurrency = Number.MAX_SAFE_INTEGER): Promise<ReviewJob | null> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    UPDATE review_jobs
    SET status = 'running', locked_at = now(), started_at = now(), attempts = attempts + 1
    WHERE id = (
      SELECT j.id FROM review_jobs j
      JOIN repositories r ON r.id = j.repository_id
      JOIN forge_connections c ON c.id = r.connection_id
      WHERE j.status = 'queued'
        AND (
          SELECT count(*) FROM review_jobs running
          JOIN repositories rr ON rr.id = running.repository_id
          JOIN forge_connections rc ON rc.id = rr.connection_id
          WHERE running.status = 'running' AND rc.user_id = c.user_id
        ) < ${userConcurrency}
      ORDER BY j.created_at
      FOR UPDATE OF j SKIP LOCKED
      LIMIT 1
    )
    RETURNING id
  `;
  const claimed = rows[0];
  return claimed ? prisma.reviewJob.findUnique({ where: { id: claimed.id } }) : null;
}

export interface CompleteInput {
  status: "completed" | "partial" | "failed" | "skipped";
  verdict: ReviewJob["verdict"];
  result?: unknown;
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
      result: input.result as object | undefined,
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
