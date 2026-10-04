import { Router } from "express";
import { getConfigSchema } from "../controllers/config.controller.ts";
import { requireAuth } from "../middleware/requireAuth.ts";

export const configRouter = Router();

configRouter.get("/schema", requireAuth, getConfigSchema);
