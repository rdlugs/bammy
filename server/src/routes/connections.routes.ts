import { Router } from "express";
import {
  connectGitlab,
  deleteConnection,
  githubCallback,
  githubInstall,
  listConnections,
} from "../controllers/connections.controller.ts";
import { requireAuth } from "../middleware/requireAuth.ts";

export const connectionsRouter = Router();

connectionsRouter.use(requireAuth);
connectionsRouter.get("/", listConnections);
connectionsRouter.post("/gitlab", connectGitlab);
connectionsRouter.get("/github/install", githubInstall);
connectionsRouter.get("/github/callback", githubCallback);
connectionsRouter.delete("/:id", deleteConnection);
