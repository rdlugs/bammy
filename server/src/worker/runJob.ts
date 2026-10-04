import type { ReviewJob } from "../generated/prisma/client.ts";
import { complete } from "./queue.ts";

// Placeholder until the review pipeline exists (phase 3). It completes the job
// with an empty result so the queue and worker can be exercised end to end.
export async function runJob(job: ReviewJob): Promise<void> {
  await complete(job.id, {
    status: "completed",
    verdict: "pass",
    result: { schemaVersion: 1, findings: [] },
  });
}
