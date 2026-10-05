import { Router } from "express";
import {
  createReview,
  getReview,
  getReviewMarkdown,
  getReviewStats,
  listReviews,
  rerunReview,
} from "../controllers/reviews.controller.ts";
import { requireAuth } from "../middleware/requireAuth.ts";
import { userLimiter } from "../middleware/apiLimiter.ts";

export const reviewsRouter = Router();

reviewsRouter.use(userLimiter, requireAuth);
reviewsRouter.get("/", listReviews);
reviewsRouter.post("/", createReview);
// Before "/:id", which would reject "stats" as a malformed id.
reviewsRouter.get("/stats", getReviewStats);
reviewsRouter.get("/:id", getReview);
reviewsRouter.get("/:id/markdown", getReviewMarkdown);
reviewsRouter.post("/:id/rerun", rerunReview);
