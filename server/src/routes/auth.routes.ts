import { Router } from "express";
import rateLimit from "express-rate-limit";
import { login, logout, me, register } from "../controllers/auth.controller.ts";
import { requireAuth } from "../middleware/requireAuth.ts";
import { env } from "../config/env.ts";

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skip: () => env.NODE_ENV === "test",
  message: { message: "Too many attempts, please try again later" },
});

export const authRouter = Router();

authRouter.post("/register", authLimiter, register);
authRouter.post("/login", authLimiter, login);
authRouter.post("/logout", logout);
authRouter.get("/me", requireAuth, me);
