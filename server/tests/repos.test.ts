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
    expect(res.body.repos[0].settings).toEqual({});
  });

  it("reports revoked credentials as a broken connection", async () => {
    vi.stubGlobal("fetch", fetchStub([{ url: /\/projects\?/, status: 401, body: { message: "401" } }]).fetch);

    const res = await request(app).get(`/api/repos?connectionId=${connectionId}`).set("Cookie", cookie);

    expect(res.status).toBe(502);
    expect(res.body.message).toBe("GitLab rejected the stored credentials; reconnect the account");
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

  it("saves validated settings and resets them with an empty object", async () => {
    const repo = await prisma.repository.create({
      data: { connectionId, provider: "gitlab", host: "gitlab.com", fullPath: "team/web", externalId: "1", defaultBranch: "main" },
    });

    const saved = await request(app)
      .patch(`/api/repos/${repo.id}`)
      .set("Cookie", cookie)
      .send({ settings: { profile: "strict", review: { maxFindings: 10 } } });
    expect(saved.status).toBe(200);
    expect(saved.body.repo.settings).toEqual({ profile: "strict", review: { maxFindings: 10 } });
    expect(saved.body.repo.enabled).toBe(false);

    const reset = await request(app).patch(`/api/repos/${repo.id}`).set("Cookie", cookie).send({ settings: {} });
    expect(reset.body.repo.settings).toEqual({});
  });

  it("rejects invalid settings and an empty body", async () => {
    const repo = await prisma.repository.create({
      data: { connectionId, provider: "gitlab", host: "gitlab.com", fullPath: "team/web", externalId: "1", defaultBranch: "main" },
    });

    const bad = await request(app)
      .patch(`/api/repos/${repo.id}`)
      .set("Cookie", cookie)
      .send({ settings: { review: { blockOn: "blocker" }, llm: { apiBase: "https://evil" } } });
    expect(bad.status).toBe(400);
    expect(bad.body.errors.settings).toBeDefined();

    const empty = await request(app).patch(`/api/repos/${repo.id}`).set("Cookie", cookie).send({});
    expect(empty.status).toBe(400);
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

describe("GET /api/repos/:id/config", () => {
  it("resolves saved settings with the repository file from the default branch", async () => {
    const repo = await prisma.repository.create({
      data: {
        connectionId,
        provider: "gitlab",
        host: "gitlab.com",
        fullPath: "team/web",
        externalId: "1",
        defaultBranch: "trunk",
        settings: { review: { maxFindings: 10 } },
      },
    });
    const { fetch, calls } = fetchStub([
      { url: /\/repository\/files\/\.bammy\.yaml\/raw\?ref=trunk$/, body: "profile: security\noutput:\n  post_check: false\n" },
    ]);
    vi.stubGlobal("fetch", fetch);

    const res = await request(app).get(`/api/repos/${repo.id}/config`).set("Cookie", cookie);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ref: "trunk", repoFile: ".bammy.yaml", warnings: [] });
    expect(res.body.config.profile).toBe("security");
    expect(res.body.config.review.maxFindings).toBe(10);
    expect(res.body.config.output.postCheck).toBe(false);
    expect(res.body.sources).toMatchObject({
      profile: "repoFile",
      "review.maxFindings": "repoSettings",
      "review.blockOn": "profile",
    });
    expect(calls).toHaveLength(1);
  });

  it("404s for another user's repository", async () => {
    const repo = await prisma.repository.create({
      data: { connectionId, provider: "gitlab", host: "gitlab.com", fullPath: "team/web", externalId: "1", defaultBranch: "main" },
    });
    const other = await createUser("other@example.com");

    const res = await request(app).get(`/api/repos/${repo.id}/config`).set("Cookie", other.cookie);

    expect(res.status).toBe(404);
  });
});

describe("GET /api/config/schema", () => {
  it("returns defaults, profiles and enum choices", async () => {
    const res = await request(app).get("/api/config/schema").set("Cookie", cookie);

    expect(res.status).toBe(200);
    expect(res.body.defaults.review.blockOn).toBe("critical");
    expect(Object.keys(res.body.profiles)).toEqual(["balanced", "fast", "strict", "security"]);
    expect(res.body.severities).toEqual(["critical", "major", "minor", "info"]);
  });
});
