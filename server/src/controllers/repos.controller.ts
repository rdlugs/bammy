import type { Request, Response } from "express";
import { HttpError } from "../lib/httpError.ts";
import { prisma } from "../lib/prisma.ts";
import { loadReviewConfig } from "../review/config/load.ts";
import { adapterForConnection, loadOwnedConnection, toHttpError } from "../services/forge.ts";
import {
  enableRepoSchema,
  listReposQuerySchema,
  repoIdParamSchema,
  updateRepoSchema,
} from "../schemas/repos.schema.ts";

const publicRepo = {
  id: true,
  connectionId: true,
  provider: true,
  host: true,
  fullPath: true,
  externalId: true,
  defaultBranch: true,
  enabled: true,
  settings: true,
  createdAt: true,
} as const;

// The forge is the source of truth for which repositories exist; the database
// only remembers the ones a user has turned on.
export async function listRepos(req: Request, res: Response) {
  const { connectionId } = listReposQuerySchema.parse(req.query);
  const connection = await loadOwnedConnection(req.userId!, connectionId);

  const forgeRepos = await adapterForConnection(connection)
    .listRepos()
    .catch((err: unknown) => {
      throw toHttpError(err, connection.provider);
    });
  const stored = await prisma.repository.findMany({ where: { connectionId } });
  const byExternalId = new Map(stored.map((repo) => [repo.externalId, repo]));

  res.json({
    repos: forgeRepos.map((repo) => {
      const saved = byExternalId.get(repo.externalId);
      return { ...repo, id: saved?.id ?? null, enabled: saved?.enabled ?? false, settings: saved?.settings ?? {} };
    }),
  });
}

export async function enableRepo(req: Request, res: Response) {
  const { connectionId, externalId } = enableRepoSchema.parse(req.body);
  const connection = await loadOwnedConnection(req.userId!, connectionId);

  const forgeRepo = await adapterForConnection(connection)
    .getRepo(externalId)
    .catch((err: unknown) => {
      throw toHttpError(err, connection.provider);
    });
  const details = { fullPath: forgeRepo.fullPath, defaultBranch: forgeRepo.defaultBranch, enabled: true };
  const repo = await prisma.repository.upsert({
    where: { connectionId_externalId: { connectionId, externalId: forgeRepo.externalId } },
    update: details,
    create: {
      ...details,
      connectionId,
      externalId: forgeRepo.externalId,
      provider: connection.provider,
      host: connection.host,
    },
    select: publicRepo,
  });
  res.status(201).json({ repo });
}

async function loadOwnedRepo(userId: string, id: string) {
  const repo = await prisma.repository.findFirst({
    where: { id, connection: { userId } },
    include: { connection: true },
  });
  if (!repo) {
    throw new HttpError(404, "Repository not found");
  }
  return repo;
}

export async function updateRepo(req: Request, res: Response) {
  const { id } = repoIdParamSchema.parse(req.params);
  const { enabled, settings } = updateRepoSchema.parse(req.body);
  await loadOwnedRepo(req.userId!, id);

  const repo = await prisma.repository.update({
    where: { id },
    data: { enabled, settings },
    select: publicRepo,
  });
  res.json({ repo });
}

// The configuration a review of the default branch would run with right now,
// with where each value came from and anything wrong with the repository file.
export async function getRepoConfig(req: Request, res: Response) {
  const { id } = repoIdParamSchema.parse(req.params);
  const repo = await loadOwnedRepo(req.userId!, id);

  const loaded = await loadReviewConfig({
    adapter: adapterForConnection(repo.connection),
    project: repo.fullPath,
    ref: repo.defaultBranch,
    repoSettings: repo.settings,
  }).catch((err: unknown) => {
    throw toHttpError(err, repo.provider);
  });
  res.json({ ref: repo.defaultBranch, ...loaded });
}
