import request from "supertest";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../src/app.ts";
import { encrypt } from "../src/lib/crypto.ts";
import { prisma } from "../src/lib/prisma.ts";
import { fetchStub } from "./helpers/fetchStub.ts";
import { createUser } from "./helpers/users.ts";

let cookie: string;
let connectionId: string;

const project = (id: number, path: string) => ({
  id,
  path_with_namespace: path,
  default_branch: "main",
  visibility: "private",
  web_url: `https://gitlab.com/${path}`,
});

beforeEach(async () => {
  await prisma.user.deleteMany();
  const created = await createUser();
  cookie = created.cookie;
  const connection = await prisma.forgeConnection.create({
    data: {
      userId: created.user.id,
      provider: "gitlab",
      host: "gitlab.com",
      kind: "token",
      accountLogin: "dev",
      encryptedToken: encrypt("glpat"),
    },
  });
  connectionId = connection.id;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("GET /api/repos", () => {
  it("merges the forge's list with what is enabled", async () => {
    await prisma.repository.create({
      data: {
        connectionId,
        provider: "gitlab",
        host: "gitlab.com",
        fullPath: "team/api",
        externalId: "2",
        defaultBranch: "main",
        enabled: true,
      },
    });
    vi.stubGlobal(
      "fetch",
      fetchStub([{ url: /\/api\/v4\/projects\?membership=true/, body: [project(1, "team/web"), project(2, "team/api")] }])
        .fetch,
    );

    const res = await request(app).get(`/api/repos?connectionId=${connectionId}`).set("Cookie", cookie);

    expect(res.status).toBe(200);
    expect(res.body.repos.map((r: { fullPath: string; enabled: boolean }) => [r.fullPath, r.enabled])).toEqual([
      ["team/web", false],
      ["team/api", true],
    ]);
  });

  it("reports revoked credentials as a broken connection", async () => {
    vi.stubGlobal("fetch", fetchStub([{ url: /\/projects\?/, status: 401, body: { message: "401" } }]).fetch);

    const res = await request(app).get(`/api/repos?connectionId=${connectionId}`).set("Cookie", cookie);

    expect(res.status).toBe(502);
    expect(res.body.message).toMatch(/reconnect/);
  });

  it("404s for another user's connection", async () => {
    const other = await createUser("other@example.com");
    const res = await request(app).get(`/api/repos?connectionId=${connectionId}`).set("Cookie", other.cookie);
    expect(res.status).toBe(404);
  });
});

describe("POST /api/repos and PATCH /api/repos/:id", () => {
  it("enables a repository from the forge, then toggles it", async () => {
    vi.stubGlobal("fetch", fetchStub([{ url: /\/api\/v4\/projects\/1$/, body: project(1, "team/web") }]).fetch);

    const created = await request(app)
      .post("/api/repos")
      .set("Cookie", cookie)
      .send({ connectionId, externalId: "1" });

    expect(created.status).toBe(201);
    expect(created.body.repo).toMatchObject({ fullPath: "team/web", enabled: true, provider: "gitlab" });

    const again = await request(app).post("/api/repos").set("Cookie", cookie).send({ connectionId, externalId: "1" });
    expect(again.body.repo.id).toBe(created.body.repo.id);

    const patched = await request(app)
      .patch(`/api/repos/${created.body.repo.id}`)
      .set("Cookie", cookie)
      .send({ enabled: false });
    expect(patched.status).toBe(200);
    expect(patched.body.repo.enabled).toBe(false);
  });

  it("404s when the forge does not know the repository", async () => {
    vi.stubGlobal("fetch", fetchStub([{ url: /\/projects\/404$/, status: 404, body: {} }]).fetch);

    const res = await request(app).post("/api/repos").set("Cookie", cookie).send({ connectionId, externalId: "404" });

    expect(res.status).toBe(404);
  });

  it("will not let another user toggle the repository", async () => {
    const repo = await prisma.repository.create({
      data: {
        connectionId,
        provider: "gitlab",
        host: "gitlab.com",
        fullPath: "team/web",
        externalId: "1",
        defaultBranch: "main",
      },
    });
    const other = await createUser("other@example.com");

    const res = await request(app).patch(`/api/repos/${repo.id}`).set("Cookie", other.cookie).send({ enabled: true });

    expect(res.status).toBe(404);
  });
});
