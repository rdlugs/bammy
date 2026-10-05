import express, { Router } from "express";
import { githubWebhook, repoWebhook } from "../controllers/webhooks.controller.ts";
import { webhookLimiter } from "../middleware/apiLimiter.ts";

export const webhooksRouter = Router();

webhooksRouter.use(webhookLimiter);
// Signatures are computed over the exact bytes sent, so these routes take the
// raw body; they are mounted before the app's JSON parser.
webhooksRouter.use(express.raw({ type: () => true, limit: "5mb" }));
webhooksRouter.post("/github", githubWebhook);
webhooksRouter.post("/:provider/:repoId", repoWebhook);
