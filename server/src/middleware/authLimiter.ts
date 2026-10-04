import rateLimit from "express-rate-limit";
import { env } from "../config/env.ts";

// For every endpoint that checks a password.
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skip: () => env.NODE_ENV === "test",
  message: { message: "Too many attempts, please try again later" },
});
