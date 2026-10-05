import cookieParser from "cookie-parser";
import express from "express";
import rateLimit from "express-rate-limit";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { AUTH_COOKIE, signToken } from "../src/lib/jwt.ts";
import { userLimitOptions } from "../src/middleware/apiLimiter.ts";

// A bare app with only the limiter, so it is tested on its own instead of
// through the database. Users are told apart by a real signed auth cookie.
function limitedApp(limit: number) {
  const app = express();
  app.use(cookieParser());
  app.get("/", rateLimit({ ...userLimitOptions, limit }), (_req, res) => {
    res.json({ ok: true });
  });
  return app;
}

const as = (userId: string) => `${AUTH_COOKIE}=${signToken(userId)}`;

describe("userLimiter", () => {
  it("answers 429 with a JSON message once a user is over the limit", async () => {
    const app = limitedApp(2);
    await request(app).get("/").set("Cookie", as("u1")).expect(200);
    await request(app).get("/").set("Cookie", as("u1")).expect(200);
    const res = await request(app).get("/").set("Cookie", as("u1")).expect(429);
    expect(res.body).toEqual({ message: "Too many requests, please slow down" });
  });

  it("keeps a separate bucket per user behind one address", async () => {
    const app = limitedApp(1);
    await request(app).get("/").set("Cookie", as("u1")).expect(200);
    await request(app).get("/").set("Cookie", as("u2")).expect(200);
    await request(app).get("/").set("Cookie", as("u1")).expect(429);
  });

  it("limits requests without a valid session by address", async () => {
    const app = limitedApp(1);
    await request(app).get("/").expect(200);
    await request(app).get("/").set("Cookie", `${AUTH_COOKIE}=forged`).expect(429);
    await request(app).get("/").set("Cookie", as("u1")).expect(200);
  });
});
