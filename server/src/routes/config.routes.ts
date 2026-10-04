import { Router } from "express";
import { getConfigSchema, getGlobalConfig, updateGlobalConfig } from "../controllers/config.controller.ts";
import { requireAuth } from "../middleware/requireAuth.ts";

export const configRouter = Router();

configRouter.get("/schema", requireAuth, getConfigSchema);
configRouter.get("/global", requireAuth, getGlobalConfig);
configRouter.put("/global", requireAuth, updateGlobalConfig);
