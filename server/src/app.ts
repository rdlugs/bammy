import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import { env } from "./config/env.ts";
import { authRouter } from "./routes/auth.routes.ts";
import { configRouter } from "./routes/config.routes.ts";
import { connectionsRouter } from "./routes/connections.routes.ts";
import { findingsRouter } from "./routes/findings.routes.ts";
import { reposRouter } from "./routes/repos.routes.ts";
import { reviewsRouter } from "./routes/reviews.routes.ts";
import { settingsRouter } from "./routes/settings.routes.ts";
import { webhooksRouter } from "./routes/webhooks.routes.ts";
import { errorHandler } from "./middleware/errorHandler.ts";

export const app = express();

app.use(helmet());
app.use(cors({ origin: env.CLIENT_ORIGIN, credentials: true }));
// Before the JSON parser: webhook signatures need the raw body.
app.use("/api/webhooks", webhooksRouter);
app.use(express.json({ limit: "100kb" }));
app.use(cookieParser());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/auth", authRouter);
app.use("/api/connections", connectionsRouter);
app.use("/api/repos", reposRouter);
app.use("/api/config", configRouter);
app.use("/api/reviews", reviewsRouter);
app.use("/api/findings", findingsRouter);
app.use("/api/settings", settingsRouter);

app.use((_req, res) => {
  res.status(404).json({ message: "Not found" });
});

app.use(errorHandler);
