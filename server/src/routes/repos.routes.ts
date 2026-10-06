import { Router } from "express";
import { deleteRepo, enableRepo, getRepoConfig, listAvailableRepos, listRepoChanges, listRepos, updateRepo } from "../controllers/repos.controller.ts";
import { requireAuth } from "../middleware/requireAuth.ts";
import { requireWorkspace, requireWorkspaceRole } from "../middleware/requireWorkspace.ts";
import { userLimiter } from "../middleware/apiLimiter.ts";

export const reposRouter = Router();

reposRouter.use(userLimiter, requireAuth, requireWorkspace);
reposRouter.get("/", listRepos);
reposRouter.get("/available", listAvailableRepos);
reposRouter.post("/", requireWorkspaceRole("admin"), enableRepo);
reposRouter.patch("/:id", requireWorkspaceRole("admin"), updateRepo);
reposRouter.delete("/:id", requireWorkspaceRole("admin"), deleteRepo);
reposRouter.get("/:id/config", getRepoConfig);
reposRouter.get("/:id/changes", listRepoChanges);
