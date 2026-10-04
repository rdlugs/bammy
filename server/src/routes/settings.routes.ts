import { Router } from "express";
import {
  apiKeyModels,
  apiKeyStatus,
  changePassword,
  deleteAccount,
  deleteApiKey,
  listApiKeys,
  saveApiKey,
  updateProfile,
} from "../controllers/settings.controller.ts";
import { authLimiter } from "../middleware/authLimiter.ts";
import { requireAuth } from "../middleware/requireAuth.ts";

export const settingsRouter = Router();

settingsRouter.use(requireAuth);
settingsRouter.patch("/profile", updateProfile);
settingsRouter.put("/password", authLimiter, changePassword);
settingsRouter.get("/api-keys", listApiKeys);
settingsRouter.get("/api-keys/:provider/status", apiKeyStatus);
settingsRouter.get("/api-keys/:provider/models", apiKeyModels);
settingsRouter.put("/api-keys/:provider", saveApiKey);
settingsRouter.delete("/api-keys/:provider", deleteApiKey);
settingsRouter.delete("/account", authLimiter, deleteAccount);
