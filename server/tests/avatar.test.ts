import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../src/app.ts";
import { prisma } from "../src/lib/prisma.ts";
import { createUser } from "./helpers/users.ts";

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32, 1)]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32, 2)]);
const WEBP = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP"), Buffer.alloc(16, 3)]);

let me: Awaited<ReturnType<typeof createUser>>;

beforeEach(async () => {
  await prisma.workspace.deleteMany();
  await prisma.user.deleteMany();
  me = await createUser();
});

afterAll(async () => {
  await prisma.$disconnect();
});

const upload = (body: Buffer, type: string) =>
  request(app).put("/api/settings/avatar").set("Cookie", me.cookie).set("Content-Type", type).send(body);

describe("profile pictures", () => {
  it.each([
    ["image/png", PNG],
    ["image/jpeg", JPEG],
    ["image/webp", WEBP],
  ])("stores a %s and serves the same bytes with long-lived private caching", async (type, body) => {
    const res = await upload(body, type);
    expect(res.status).toBe(200);
    expect(res.body.user.avatarUpdatedAt).toEqual(expect.any(String));

    const other = await createUser("other@example.com");
    const served = await request(app)
      .get(`/api/users/${me.user.id}/avatar`)
      .set("Cookie", other.cookie)
      .buffer(true)
      .parse((r, done) => {
        const chunks: Buffer[] = [];
        r.on("data", (c: Buffer) => chunks.push(c));
        r.on("end", () => done(null, Buffer.concat(chunks)));
      });
    expect(served.status).toBe(200);
    expect(served.headers["content-type"]).toBe(type);
    expect(served.headers["cache-control"]).toBe("private, max-age=31536000, immutable");
    expect(served.headers["x-content-type-options"]).toBe("nosniff");
    expect(Buffer.compare(served.body as Buffer, body)).toBe(0);
  });

  it("exposes when the picture changed on the signed-in user", async () => {
    expect((await request(app).get("/api/auth/me").set("Cookie", me.cookie)).body.user.avatarUpdatedAt).toBeNull();
    await upload(PNG, "image/png");
    expect((await request(app).get("/api/auth/me").set("Cookie", me.cookie)).body.user.avatarUpdatedAt).not.toBeNull();
  });

  it("refuses bytes that do not match the declared type", async () => {
    expect((await upload(PNG, "image/jpeg")).status).toBe(400);
  });

  it.each([
    ["image/svg+xml", Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')],
    ["text/plain", Buffer.from("hello")],
  ])("refuses %s", async (type, body) => {
    expect((await upload(body, type)).status).toBe(400);
    expect(await prisma.userAvatar.count()).toBe(0);
  });

  it("refuses an image over 512 KB", async () => {
    const big = Buffer.concat([PNG, Buffer.alloc(512 * 1024)]);
    const res = await upload(big, "image/png");

    expect(res.status).toBe(413);
    expect(await prisma.userAvatar.count()).toBe(0);
  });

  it("removes the picture", async () => {
    await upload(PNG, "image/png");

    const res = await request(app).delete("/api/settings/avatar").set("Cookie", me.cookie);

    expect(res.body.user.avatarUpdatedAt).toBeNull();
    expect((await request(app).get(`/api/users/${me.user.id}/avatar`).set("Cookie", me.cookie)).status).toBe(404);
  });

  it("requires a signed-in user to view pictures", async () => {
    await upload(PNG, "image/png");
    expect((await request(app).get(`/api/users/${me.user.id}/avatar`)).status).toBe(401);
  });

  it("answers 404 for a malformed user id", async () => {
    expect((await request(app).get("/api/users/nope/avatar").set("Cookie", me.cookie)).status).toBe(404);
  });

  it("deletes the picture with the account", async () => {
    await upload(PNG, "image/png");
    await prisma.user.delete({ where: { id: me.user.id } });

    expect(await prisma.userAvatar.count()).toBe(0);
  });
});
