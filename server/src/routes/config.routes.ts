import { Router } from "express";
import { getConfigSchema, getGlobalConfig, previewConfig, updateGlobalConfig } from "../controllers/config.controller.ts";
import { requireAuth } from "../middleware/requireAuth.ts";
import { userLimiter } from "../middleware/apiLimiter.ts";

export const configRouter = Router();

configRouter.get("/schema", requireAuth, userLimiter, getConfigSchema);
configRouter.get("/global", requireAuth, userLimiter, getGlobalConfig);
configRouter.put("/global", requireAuth, userLimiter, updateGlobalConfig);
configRouter.post("/preview", requireAuth, userLimiter, previewConfig);
