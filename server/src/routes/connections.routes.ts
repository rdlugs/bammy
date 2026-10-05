import { Router } from "express";
import {
  connectionStatus,
  connectWithToken,
  deleteConnection,
  getConnection,
  githubCallback,
  githubInstall,
  listConnections,
} from "../controllers/connections.controller.ts";
import { requireAuth } from "../middleware/requireAuth.ts";
import { userLimiter } from "../middleware/apiLimiter.ts";

export const connectionsRouter = Router();

connectionsRouter.use(userLimiter, requireAuth);
connectionsRouter.get("/", listConnections);
connectionsRouter.get("/github/install", githubInstall);
connectionsRouter.get("/github/callback", githubCallback);
connectionsRouter.get("/:id/status", connectionStatus);
connectionsRouter.get("/:id", getConnection);
connectionsRouter.post("/:provider", connectWithToken);
connectionsRouter.delete("/:id", deleteConnection);
