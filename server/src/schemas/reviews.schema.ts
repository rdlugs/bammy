import { z } from "zod";

export const createReviewSchema = z.object({
  url: z.string().trim().min(1, "Paste a pull or merge request URL"),
});

export const listReviewsQuerySchema = z.object({
  repoId: z.uuid().optional(),
  status: z.enum(["queued", "running", "completed", "partial", "failed", "superseded", "skipped"]).optional(),
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const reviewIdParamSchema = z.object({ id: z.uuid() });
