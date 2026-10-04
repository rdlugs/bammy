import type { Request, Response } from "express";
import { HttpError } from "../lib/httpError.ts";
import { prisma } from "../lib/prisma.ts";
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
      return { ...repo, id: saved?.id ?? null, enabled: saved?.enabled ?? false };
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

export async function updateRepo(req: Request, res: Response) {
  const { id } = repoIdParamSchema.parse(req.params);
  const { enabled } = updateRepoSchema.parse(req.body);

  const existing = await prisma.repository.findFirst({
    where: { id, connection: { userId: req.userId } },
  });
  if (!existing) {
    throw new HttpError(404, "Repository not found");
  }
  const repo = await prisma.repository.update({ where: { id }, data: { enabled }, select: publicRepo });
  res.json({ repo });
}
