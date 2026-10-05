import { Router } from "express";
import { deleteRepo, enableRepo, getRepoConfig, listAvailableRepos, listRepoChanges, listRepos, updateRepo } from "../controllers/repos.controller.ts";
import { requireAuth } from "../middleware/requireAuth.ts";
import { userLimiter } from "../middleware/apiLimiter.ts";

export const reposRouter = Router();

reposRouter.use(userLimiter, requireAuth);
reposRouter.get("/", listRepos);
reposRouter.get("/available", listAvailableRepos);
reposRouter.post("/", enableRepo);
reposRouter.patch("/:id", updateRepo);
reposRouter.delete("/:id", deleteRepo);
reposRouter.get("/:id/config", getRepoConfig);
reposRouter.get("/:id/changes", listRepoChanges);
