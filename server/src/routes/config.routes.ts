import { Router } from "express";
import { getConfigSchema, getGlobalConfig, previewConfig, updateGlobalConfig } from "../controllers/config.controller.ts";
import { requireAuth } from "../middleware/requireAuth.ts";

export const configRouter = Router();

configRouter.get("/schema", requireAuth, getConfigSchema);
configRouter.get("/global", requireAuth, getGlobalConfig);
configRouter.put("/global", requireAuth, updateGlobalConfig);
configRouter.post("/preview", requireAuth, previewConfig);
