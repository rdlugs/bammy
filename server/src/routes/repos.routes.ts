import { Router } from "express";
import { enableRepo, getRepoConfig, listRepos, updateRepo } from "../controllers/repos.controller.ts";
import { requireAuth } from "../middleware/requireAuth.ts";

export const reposRouter = Router();

reposRouter.use(requireAuth);
reposRouter.get("/", listRepos);
reposRouter.post("/", enableRepo);
reposRouter.patch("/:id", updateRepo);
reposRouter.get("/:id/config", getRepoConfig);
