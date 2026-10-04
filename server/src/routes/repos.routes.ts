import { Router } from "express";
import { deleteRepo, enableRepo, getRepoConfig, listAvailableRepos, listRepos, updateRepo } from "../controllers/repos.controller.ts";
import { requireAuth } from "../middleware/requireAuth.ts";

export const reposRouter = Router();

reposRouter.use(requireAuth);
reposRouter.get("/", listRepos);
reposRouter.get("/available", listAvailableRepos);
reposRouter.post("/", enableRepo);
reposRouter.patch("/:id", updateRepo);
reposRouter.delete("/:id", deleteRepo);
reposRouter.get("/:id/config", getRepoConfig);
