import { Router } from "express";
import {
  createReview,
  getReview,
  getReviewMarkdown,
  listReviews,
  rerunReview,
} from "../controllers/reviews.controller.ts";
import { requireAuth } from "../middleware/requireAuth.ts";

export const reviewsRouter = Router();

reviewsRouter.use(requireAuth);
reviewsRouter.get("/", listReviews);
reviewsRouter.post("/", createReview);
reviewsRouter.get("/:id", getReview);
reviewsRouter.get("/:id/markdown", getReviewMarkdown);
reviewsRouter.post("/:id/rerun", rerunReview);
