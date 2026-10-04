import { z } from "zod";

export const listReposQuerySchema = z.object({
  connectionId: z.uuid(),
});

export const enableRepoSchema = z.object({
  connectionId: z.uuid(),
  externalId: z.string().min(1),
});

export const updateRepoSchema = z.object({
  enabled: z.boolean(),
});

export const repoIdParamSchema = z.object({ id: z.uuid() });
