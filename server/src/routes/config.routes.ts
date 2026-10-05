import { Router } from "express";
import { getConfigSchema, getGlobalConfig, previewConfig, updateGlobalConfig } from "../controllers/config.controller.ts";
import { requireAuth } from "../middleware/requireAuth.ts";
import { userLimiter } from "../middleware/apiLimiter.ts";

export const configRouter = Router();

configRouter.get("/schema", userLimiter, requireAuth, getConfigSchema);
configRouter.get("/global", userLimiter, requireAuth, getGlobalConfig);
configRouter.put("/global", userLimiter, requireAuth, updateGlobalConfig);
configRouter.post("/preview", userLimiter, requireAuth, previewConfig);
