import { Router } from "express";
import {
  connectWithToken,
  deleteConnection,
  githubCallback,
  githubInstall,
  listConnections,
} from "../controllers/connections.controller.ts";
import { requireAuth } from "../middleware/requireAuth.ts";

export const connectionsRouter = Router();

connectionsRouter.use(requireAuth);
connectionsRouter.get("/", listConnections);
connectionsRouter.get("/github/install", githubInstall);
connectionsRouter.get("/github/callback", githubCallback);
connectionsRouter.post("/:provider", connectWithToken);
connectionsRouter.delete("/:id", deleteConnection);
