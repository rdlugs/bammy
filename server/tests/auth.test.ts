import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../src/app.ts";
import { prisma } from "../src/lib/prisma.ts";
import { AUTH_COOKIE } from "../src/lib/jwt.ts";

const validUser = {
  name: "Ada Lovelace",
  email: "ada@example.com",
  password: "supersecret123",
  confirmPassword: "supersecret123",
};

function authCookie(res: request.Response) {
  const cookies = ([] as string[]).concat(res.headers["set-cookie"] ?? []);
  return cookies.find((c) => c.startsWith(`${AUTH_COOKIE}=`));
}

beforeEach(async () => {
  await prisma.user.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("POST /api/auth/register", () => {
  it("creates a user, sets an httpOnly cookie and never returns the hash", async () => {
    const res = await request(app).post("/api/auth/register").send(validUser);

    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ name: validUser.name, email: validUser.email });
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(authCookie(res)).toMatch(/HttpOnly/i);

    const stored = await prisma.user.findUniqueOrThrow({ where: { email: validUser.email } });
    expect(stored.passwordHash).not.toBe(validUser.password);
  });

  it("rejects a duplicate email case-insensitively", async () => {
    await request(app).post("/api/auth/register").send(validUser);
    const res = await request(app)
      .post("/api/auth/register")
      .send({ ...validUser, email: "ADA@example.com" });

    expect(res.status).toBe(409);
  });

  it("returns field errors for invalid input", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ name: "", email: "nope", password: "short", confirmPassword: "different" });

    expect(res.status).toBe(400);
    expect(Object.keys(res.body.errors)).toEqual(
      expect.arrayContaining(["name", "email", "password"]),
    );
  });
});

describe("POST /api/auth/login", () => {
  beforeEach(async () => {
    await request(app).post("/api/auth/register").send(validUser);
  });

  it("logs in with correct credentials", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: validUser.email, password: validUser.password });

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(validUser.email);
    expect(authCookie(res)).toBeDefined();
  });

  it("rejects a wrong password with a generic message", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: validUser.email, password: "wrongpassword" });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Invalid email or password");
  });

  it("rejects an unknown email with the same generic message", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "nobody@example.com", password: "whatever123" });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Invalid email or password");
  });
});

describe("GET /api/auth/me and POST /api/auth/logout", () => {
  it("returns 401 without a cookie", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });

  it("returns the current user with a valid cookie, and logout clears it", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/register").send(validUser);

    const meRes = await agent.get("/api/auth/me");
    expect(meRes.status).toBe(200);
    expect(meRes.body.user.email).toBe(validUser.email);

    const logoutRes = await agent.post("/api/auth/logout");
    expect(logoutRes.status).toBe(204);

    const afterLogout = await agent.get("/api/auth/me");
    expect(afterLogout.status).toBe(401);
  });

  it("rejects a tampered token", async () => {
    const res = await request(app)
      .get("/api/auth/me")
      .set("Cookie", `${AUTH_COOKIE}=not.a.valid.token`);
    expect(res.status).toBe(401);
  });
});
