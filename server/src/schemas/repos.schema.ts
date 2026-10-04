import { z } from "zod";
import { configOverrideSchema } from "../review/config/schema.ts";

export const listReposQuerySchema = z.object({
  connectionId: z.uuid(),
});

export const enableRepoSchema = z.object({
  connectionId: z.uuid(),
  externalId: z.string().min(1),
});

// `settings` replaces the saved overrides as a whole; an empty object resets
// the repository to its profile and the defaults.
export const updateRepoSchema = z
  .object({
    enabled: z.boolean().optional(),
    settings: configOverrideSchema.optional(),
  })
  .refine((body) => body.enabled !== undefined || body.settings !== undefined, {
    message: "Provide enabled or settings",
    path: ["enabled"],
  });

export const repoIdParamSchema = z.object({ id: z.uuid() });
