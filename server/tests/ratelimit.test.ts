import express from "express";
import rateLimit from "express-rate-limit";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { userLimitOptions } from "../src/middleware/apiLimiter.ts";

// A bare app stands in for requireAuth with an x-user header, so the limiter
// is tested on its own instead of through the database.
function limitedApp(limit: number) {
  const app = express();
  app.use((req, _res, next) => {
    req.userId = req.header("x-user") ?? undefined;
    next();
  });
  app.get("/", rateLimit({ ...userLimitOptions, limit }), (_req, res) => {
    res.json({ ok: true });
  });
  return app;
}

describe("userLimiter", () => {
  it("answers 429 with a JSON message once a user is over the limit", async () => {
    const app = limitedApp(2);
    await request(app).get("/").set("x-user", "u1").expect(200);
    await request(app).get("/").set("x-user", "u1").expect(200);
    const res = await request(app).get("/").set("x-user", "u1").expect(429);
    expect(res.body).toEqual({ message: "Too many requests, please slow down" });
  });

  it("keeps a separate bucket per user behind one address", async () => {
    const app = limitedApp(1);
    await request(app).get("/").set("x-user", "u1").expect(200);
    await request(app).get("/").set("x-user", "u2").expect(200);
    await request(app).get("/").set("x-user", "u1").expect(429);
  });

  it("limits requests without a user by address", async () => {
    const app = limitedApp(1);
    await request(app).get("/").expect(200);
    await request(app).get("/").expect(429);
    await request(app).get("/").set("x-user", "u1").expect(200);
  });
});
