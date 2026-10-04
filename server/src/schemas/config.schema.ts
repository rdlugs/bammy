import { z } from "zod";
import { dashboardOverrideSchema } from "../review/config/schema.ts";

// Replaces the global config as a whole; an empty object resets it to the
// profile and the defaults.
export const updateGlobalConfigSchema = z.object({
  settings: dashboardOverrideSchema,
});
