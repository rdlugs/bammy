import { Router } from "express";
import { login, logout, me, register } from "../controllers/auth.controller.ts";
import { authLimiter } from "../middleware/authLimiter.ts";
import { requireAuth } from "../middleware/requireAuth.ts";
import { userLimiter } from "../middleware/apiLimiter.ts";

export const authRouter = Router();

authRouter.post("/register", authLimiter, register);
authRouter.post("/login", authLimiter, login);
authRouter.post("/logout", userLimiter, logout);
authRouter.get("/me", userLimiter, requireAuth, me);
