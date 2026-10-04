import type { Request, Response } from "express";
import { HttpError } from "../lib/httpError.ts";
import { prisma } from "../lib/prisma.ts";
import type { Repository } from "../generated/prisma/client.ts";
import { reviewResultSchema } from "../review/core/models.ts";
import { parseChangeUrl } from "../review/forge/url.ts";
import { toJson } from "../review/render/json.ts";
import { toMarkdown } from "../review/render/markdown.ts";
import { adapterForConnection, toHttpError } from "../services/forge.ts";
import { enqueue } from "../worker/queue.ts";
import { createReviewSchema, listReviewsQuerySchema, reviewIdParamSchema } from "../schemas/reviews.schema.ts";

const listFields = {
  id: true,
  number: true,
  headSha: true,
  trigger: true,
  status: true,
  verdict: true,
  summary: true,
  error: true,
  createdAt: true,
  startedAt: true,
  finishedAt: true,
  repository: { select: { id: true, provider: true, host: true, fullPath: true } },
} as const;

function ownedBy(userId: string) {
  return { repository: { connection: { userId } } };
}

async function queueLatest(repo: Repository & { connection: Parameters<typeof adapterForConnection>[0] }, number: number) {
  const head = await adapterForConnection(repo.connection)
    .getChangeHead(repo.fullPath, number)
    .catch((err: unknown) => {
      throw toHttpError(err, repo.provider);
    });
  return enqueue({ repositoryId: repo.id, number, headSha: head.headSha, trigger: "manual" });
}

export async function createReview(req: Request, res: Response) {
  const { url } = createReviewSchema.parse(req.body);
  const parsed = parseChangeUrl(url);
  if (!parsed) {
    throw new HttpError(400, "Not a pull or merge request URL");
  }

  // Forge paths are case-insensitive; compare the way the forge would.
  const candidates = await prisma.repository.findMany({
    where: { provider: parsed.provider, host: parsed.host, connection: { userId: req.userId } },
    include: { connection: true },
  });
  const repo = candidates.find((r) => r.fullPath.toLowerCase() === parsed.project.toLowerCase());
  if (!repo) {
    throw new HttpError(404, `${parsed.project} is not connected; enable it under Repositories first`);
  }
  if (!repo.enabled) {
    throw new HttpError(409, `Reviews are turned off for ${repo.fullPath}`);
  }

  const job = await queueLatest(repo, parsed.number);
  const review = await prisma.reviewJob.findUniqueOrThrow({ where: { id: job.id }, select: listFields });
  res.status(202).json({ review });
}

export async function listReviews(req: Request, res: Response) {
  const { repoId, status, cursor, limit } = listReviewsQuerySchema.parse(req.query);
  const reviews = await prisma.reviewJob.findMany({
    where: { ...ownedBy(req.userId!), ...(repoId ? { repositoryId: repoId } : {}), ...(status ? { status } : {}) },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: listFields,
  });
  const hasMore = reviews.length > limit;
  const page = reviews.slice(0, limit);
  res.json({ reviews: page, nextCursor: hasMore ? page.at(-1)!.id : null });
}

async function loadOwnedReview(userId: string, id: string) {
  const review = await prisma.reviewJob.findFirst({
    where: { id, ...ownedBy(userId) },
    select: { ...listFields, baseSha: true, attempts: true, result: true, publication: true, resolvedConfig: true },
  });
  if (!review) {
    throw new HttpError(404, "Review not found");
  }
  return review;
}

// A stored result that no longer matches the schema (written by an older
// version) is served as-is rather than failing the whole page.
function parseResult(raw: unknown) {
  const parsed = reviewResultSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export async function getReview(req: Request, res: Response) {
  const { id } = reviewIdParamSchema.parse(req.params);
  const { result: raw, ...review } = await loadOwnedReview(req.userId!, id);
  const result = raw === null ? null : parseResult(raw);
  res.json({ review: { ...review, result: result ? toJson(result) : raw } });
}

export async function getReviewMarkdown(req: Request, res: Response) {
  const { id } = reviewIdParamSchema.parse(req.params);
  const review = await loadOwnedReview(req.userId!, id);
  const result = review.result === null ? null : parseResult(review.result);
  if (!result) {
    throw new HttpError(409, review.result === null ? "This review has no result yet" : "This result can no longer be rendered");
  }
  res.type("text/markdown; charset=utf-8").send(toMarkdown(result));
}

export async function rerunReview(req: Request, res: Response) {
  const { id } = reviewIdParamSchema.parse(req.params);
  const existing = await prisma.reviewJob.findFirst({
    where: { id, ...ownedBy(req.userId!) },
    include: { repository: { include: { connection: true } } },
  });
  if (!existing) {
    throw new HttpError(404, "Review not found");
  }
  const job = await queueLatest(existing.repository, existing.number);
  const review = await prisma.reviewJob.findUniqueOrThrow({ where: { id: job.id }, select: listFields });
  res.status(202).json({ review });
}
