import type { Request, Response } from "express";
import { HttpError } from "../lib/httpError.ts";
import { prisma } from "../lib/prisma.ts";
import { CATEGORIES, SEVERITIES } from "../review/core/severity.ts";
import { PROFILES } from "../review/config/profiles.ts";
import { resolveConfig } from "../review/config/resolve.ts";
import { DEFAULT_CONFIG, PROFILE_NAMES, dashboardOverrideSchema } from "../review/config/schema.ts";
import { previewPublication } from "../review/preview/preview.ts";
import { configPreviewSchema, updateGlobalConfigSchema } from "../schemas/config.schema.ts";
import { requireStoredLlmConnection } from "../services/llm.ts";

// What the settings UI needs to render choices and show inherited values.
export function getConfigSchema(_req: Request, res: Response) {
  res.json({
    defaults: DEFAULT_CONFIG,
    profiles: Object.fromEntries(PROFILE_NAMES.map((name) => [name, PROFILES[name]])),
    severities: SEVERITIES,
    categories: CATEGORIES,
  });
}

// The saved global config and what it resolves to on its own, before any
// repository settings or repository file.
function globalConfigBody(saved: unknown) {
  // Same tolerance as a review: settings saved under an older schema are
  // reported, not fatal.
  const parsed = dashboardOverrideSchema.safeParse(saved);
  const warnings = parsed.success ? [] : ["Saved global settings are no longer valid and were ignored"];
  const settings = parsed.success ? parsed.data : {};
  return { settings, warnings, ...resolveConfig({ global: settings }) };
}

export async function getGlobalConfig(req: Request, res: Response) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.userId! }, select: { reviewSettings: true } });
  res.json(globalConfigBody(user.reviewSettings));
}

export async function updateGlobalConfig(req: Request, res: Response) {
  const { settings } = updateGlobalConfigSchema.parse(req.body);
  if (!settings.llm?.connection) {
    throw new HttpError(400, "Validation failed", { connection: ["Select an LLM connection"] });
  }
  await requireStoredLlmConnection(req.userId!, settings.llm.connection);
  const user = await prisma.user.update({
    where: { id: req.userId! },
    data: { reviewSettings: settings },
    select: { reviewSettings: true },
  });
  res.json(globalConfigBody(user.reviewSettings));
}

// Renders what a review of a sample change would post with these settings. No
// model call and nothing stored: the sample's model answers are scripted.
export async function previewConfig(req: Request, res: Response) {
  const { provider, base, settings } = configPreviewSchema.parse(req.body);
  const { config } = resolveConfig({ global: base, repoSettings: settings });
  res.json(await previewPublication(config, provider));
}
