import type { Request, Response } from "express";
import { CATEGORIES, SEVERITIES } from "../review/core/severity.ts";
import { PROFILES } from "../review/config/profiles.ts";
import { DEFAULT_CONFIG, PROFILE_NAMES } from "../review/config/schema.ts";

// What the settings UI needs to render choices and show inherited values.
export function getConfigSchema(_req: Request, res: Response) {
  res.json({
    defaults: DEFAULT_CONFIG,
    profiles: Object.fromEntries(PROFILE_NAMES.map((name) => [name, PROFILES[name]])),
    severities: SEVERITIES,
    categories: CATEGORIES,
  });
}
