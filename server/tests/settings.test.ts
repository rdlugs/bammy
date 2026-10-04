import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../src/app.ts";
import { decrypt } from "../src/lib/crypto.ts";
import { hashPassword } from "../src/lib/password.ts";
import { prisma } from "../src/lib/prisma.ts";
import { apiKeysFor } from "../src/services/llm.ts";
import { createUser } from "./helpers/users.ts";

const PASSWORD = "correct-horse";

let cookie: string;
let userId: string;

beforeEach(async () => {
  await prisma.user.deleteMany();
  ({ cookie, user: { id: userId } } = await createUser());
  await prisma.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(PASSWORD) } });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("authentication", () => {
  it.each([
    ["patch", "/api/settings/profile"],
    ["put", "/api/settings/password"],
    ["get", "/api/settings/api-keys"],
    ["put", "/api/settings/api-keys/anthropic"],
    ["delete", "/api/settings/api-keys/anthropic"],
    ["delete", "/api/settings/account"],
  ] as const)("%s %s requires a session", async (method, path) => {
    const res = await request(app)[method](path).send({});
    expect(res.status).toBe(401);
  });
});

describe("PATCH /api/settings/profile", () => {
  it("updates the name and email", async () => {
    const res = await request(app)
      .patch("/api/settings/profile")
      .set("Cookie", cookie)
      .send({ name: "Ada", email: " Ada@Example.com " });

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ id: userId, name: "Ada", email: "ada@example.com" });
    expect(res.body.user.passwordHash).toBeUndefined();

    const me = await request(app).get("/api/auth/me").set("Cookie", cookie);
    expect(me.body.user).toMatchObject({ name: "Ada", email: "ada@example.com" });
  });

  it("keeps the current email when it is sent unchanged", async () => {
    const res = await request(app)
      .patch("/api/settings/profile")
      .set("Cookie", cookie)
      .send({ name: "Dev", email: "dev@example.com" });
    expect(res.status).toBe(200);
  });

  it("refuses an email another account uses", async () => {
    await createUser("taken@example.com");
    const res = await request(app)
      .patch("/api/settings/profile")
      .set("Cookie", cookie)
      .send({ email: "taken@example.com" });

    expect(res.status).toBe(409);
    expect(res.body.errors.email).toBeDefined();
  });

  it("validates the input", async () => {
    const res = await request(app).patch("/api/settings/profile").set("Cookie", cookie).send({ email: "nope" });
    expect(res.status).toBe(400);
    expect(res.body.errors.email).toBeDefined();
  });
});

describe("PUT /api/settings/password", () => {
  it("rejects a wrong current password", async () => {
    const res = await request(app)
      .put("/api/settings/password")
      .set("Cookie", cookie)
      .send({ currentPassword: "wrong", newPassword: "new-password", confirmPassword: "new-password" });

    expect(res.status).toBe(400);
    expect(res.body.errors.currentPassword).toEqual(["Password is incorrect"]);
  });

  it("requires the confirmation to match", async () => {
    const res = await request(app)
      .put("/api/settings/password")
      .set("Cookie", cookie)
      .send({ currentPassword: PASSWORD, newPassword: "new-password", confirmPassword: "other" });

    expect(res.status).toBe(400);
    expect(res.body.errors.confirmPassword).toBeDefined();
  });

  it("changes the password used to log in", async () => {
    const res = await request(app)
      .put("/api/settings/password")
      .set("Cookie", cookie)
      .send({ currentPassword: PASSWORD, newPassword: "new-password", confirmPassword: "new-password" });
    expect(res.status).toBe(204);

    const oldLogin = await request(app).post("/api/auth/login").send({ email: "dev@example.com", password: PASSWORD });
    expect(oldLogin.status).toBe(401);
    const newLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: "dev@example.com", password: "new-password" });
    expect(newLogin.status).toBe(200);
  });
});

describe("/api/settings/api-keys", () => {
  it("lists every provider, stored or not", async () => {
    const res = await request(app).get("/api/settings/api-keys").set("Cookie", cookie);

    expect(res.status).toBe(200);
    expect(res.body.keys.map((key: { provider: string }) => key.provider)).toEqual(["anthropic", "openai", "google"]);
    expect(res.body.keys[0]).toMatchObject({ stored: false, last4: null });
  });

  it("stores a key encrypted and only returns its last four characters", async () => {
    const res = await request(app)
      .put("/api/settings/api-keys/anthropic")
      .set("Cookie", cookie)
      .send({ apiKey: "sk-ant-secret-1234" });

    expect(res.status).toBe(200);
    expect(res.body.key).toMatchObject({ provider: "anthropic", stored: true, last4: "1234" });
    expect(JSON.stringify(res.body)).not.toContain("secret");

    const stored = await prisma.llmCredential.findFirstOrThrow({ where: { userId } });
    expect(stored.encryptedKey).not.toContain("secret");
    expect(decrypt(stored.encryptedKey)).toBe("sk-ant-secret-1234");
    expect((await apiKeysFor(userId)).anthropic).toBe("sk-ant-secret-1234");

    const list = await request(app).get("/api/settings/api-keys").set("Cookie", cookie);
    expect(JSON.stringify(list.body)).not.toContain("secret");
    expect(list.body.keys[0]).toMatchObject({ stored: true, last4: "1234" });
  });

  it("replaces an existing key", async () => {
    await request(app).put("/api/settings/api-keys/openai").set("Cookie", cookie).send({ apiKey: "sk-first-0001" });
    await request(app).put("/api/settings/api-keys/openai").set("Cookie", cookie).send({ apiKey: "sk-second-0002" });

    const stored = await prisma.llmCredential.findMany({ where: { userId } });
    expect(stored).toHaveLength(1);
    expect(decrypt(stored[0]!.encryptedKey)).toBe("sk-second-0002");
  });

  it("rejects an unknown provider", async () => {
    const res = await request(app)
      .put("/api/settings/api-keys/mistral")
      .set("Cookie", cookie)
      .send({ apiKey: "sk-whatever-123" });
    expect(res.status).toBe(400);
  });

  it("removes a key", async () => {
    await request(app).put("/api/settings/api-keys/google").set("Cookie", cookie).send({ apiKey: "AIza-key-9999" });

    const res = await request(app).delete("/api/settings/api-keys/google").set("Cookie", cookie);
    expect(res.status).toBe(204);
    expect(await prisma.llmCredential.count({ where: { userId } })).toBe(0);

    const again = await request(app).delete("/api/settings/api-keys/google").set("Cookie", cookie);
    expect(again.status).toBe(404);
  });

  it("never touches another user's keys", async () => {
    const other = await createUser("other@example.com");
    await request(app)
      .put("/api/settings/api-keys/anthropic")
      .set("Cookie", other.cookie)
      .send({ apiKey: "sk-other-5555" });

    const res = await request(app).delete("/api/settings/api-keys/anthropic").set("Cookie", cookie);
    expect(res.status).toBe(404);
    expect(await prisma.llmCredential.count({ where: { userId: other.user.id } })).toBe(1);
  });
});

describe("DELETE /api/settings/account", () => {
  it("requires the password", async () => {
    const res = await request(app).delete("/api/settings/account").set("Cookie", cookie).send({ password: "wrong" });

    expect(res.status).toBe(400);
    expect(res.body.errors.password).toBeDefined();
    expect(await prisma.user.count({ where: { id: userId } })).toBe(1);
  });

  it("deletes the user with everything they own and signs them out", async () => {
    await prisma.llmCredential.create({ data: { userId, provider: "anthropic", encryptedKey: "x" } });
    await prisma.forgeConnection.create({
      data: { userId, provider: "gitlab", host: "gitlab.com", kind: "token", accountLogin: "dev" },
    });

    const res = await request(app).delete("/api/settings/account").set("Cookie", cookie).send({ password: PASSWORD });

    expect(res.status).toBe(204);
    expect(res.headers["set-cookie"]?.[0]).toMatch(/bammy_token=;/);
    expect(await prisma.user.count({ where: { id: userId } })).toBe(0);
    expect(await prisma.llmCredential.count({ where: { userId } })).toBe(0);
    expect(await prisma.forgeConnection.count({ where: { userId } })).toBe(0);

    const me = await request(app).get("/api/auth/me").set("Cookie", cookie);
    expect(me.status).toBe(401);
  });
});
