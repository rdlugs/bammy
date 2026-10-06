import { Router } from "express";
import { showAvatar } from "../controllers/avatar.controller.ts";
import { requireAuth } from "../middleware/requireAuth.ts";
import { userLimiter } from "../middleware/apiLimiter.ts";

export const usersRouter = Router();

usersRouter.get("/:id/avatar", userLimiter, requireAuth, showAvatar);
