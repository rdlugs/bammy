import request from "supertest";
import jwt from "jsonwebtoken";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../src/app.ts";
import { env } from "../src/config/env.ts";
import { decrypt } from "../src/lib/crypto.ts";
import { prisma } from "../src/lib/prisma.ts";
import { fetchStub } from "./helpers/fetchStub.ts";
import { createUser } from "./helpers/users.ts";

let cookie: string;
let userId: string;

beforeEach(async () => {
  await prisma.user.deleteMany();
  ({ cookie, user: { id: userId } } = await createUser());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("POST /api/connections/gitlab", () => {
  it("validates the token, stores it encrypted and never returns it", async () => {
    const { fetch, calls } = fetchStub([{ url: /gitlab\.acme\.com\/api\/v4\/user$/, body: { username: "dev" } }]);
    vi.stubGlobal("fetch", fetch);

    const res = await request(app)
      .post("/api/connections/gitlab")
      .set("Cookie", cookie)
      .send({ host: "https://gitlab.acme.com/", token: "glpat-secret" });

    expect(res.status).toBe(201);
    expect(res.body.connection).toMatchObject({ provider: "gitlab", host: "gitlab.acme.com", accountLogin: "dev" });
    expect(JSON.stringify(res.body)).not.toContain("glpat-secret");
    expect(calls[0]!.headers["private-token"]).toBe("glpat-secret");

    const stored = await prisma.forgeConnection.findFirstOrThrow({ where: { userId } });
    expect(stored.encryptedToken).not.toContain("glpat-secret");
    expect(decrypt(stored.encryptedToken!)).toBe("glpat-secret");
  });

  it("updates the token when the same account reconnects", async () => {
    vi.stubGlobal("fetch", fetchStub([{ url: /\/user$/, body: { username: "dev" } }]).fetch);

    await request(app).post("/api/connections/gitlab").set("Cookie", cookie).send({ token: "one" });
    const res = await request(app).post("/api/connections/gitlab").set("Cookie", cookie).send({ token: "two" });

    expect(res.status).toBe(200);
    const stored = await prisma.forgeConnection.findMany({ where: { userId } });
    expect(stored).toHaveLength(1);
    expect(stored[0]!.host).toBe("gitlab.com");
    expect(decrypt(stored[0]!.encryptedToken!)).toBe("two");
  });

  it("rejects a token GitLab refuses", async () => {
    vi.stubGlobal("fetch", fetchStub([{ url: /\/user$/, status: 401, body: { message: "401 Unauthorized" } }]).fetch);

    const res = await request(app).post("/api/connections/gitlab").set("Cookie", cookie).send({ token: "bad" });

    expect(res.status).toBe(400);
    expect(await prisma.forgeConnection.count()).toBe(0);
  });

  it("returns field errors for a bad host and missing token", async () => {
    const res = await request(app)
      .post("/api/connections/gitlab")
      .set("Cookie", cookie)
      .send({ host: "gitlab.com/group" });

    expect(res.status).toBe(400);
    expect(Object.keys(res.body.errors)).toEqual(expect.arrayContaining(["host", "token"]));
  });

  it("requires authentication", async () => {
    const res = await request(app).post("/api/connections/gitlab").send({ token: "x" });
    expect(res.status).toBe(401);
  });
});

describe("POST /api/connections/github", () => {
  it("validates an Enterprise Server token against /api/v3 and stores it encrypted", async () => {
    const { fetch, calls } = fetchStub([{ url: /ghe\.acme\.com\/api\/v3\/user$/, body: { login: "dev" } }]);
    vi.stubGlobal("fetch", fetch);

    const res = await request(app)
      .post("/api/connections/github")
      .set("Cookie", cookie)
      .send({ host: "https://ghe.acme.com/", token: "ghp-secret" });

    expect(res.status).toBe(201);
    expect(res.body.connection).toMatchObject({ provider: "github", kind: "token", host: "ghe.acme.com", accountLogin: "dev" });
    expect(JSON.stringify(res.body)).not.toContain("ghp-secret");
    expect(calls[0]!.headers.authorization).toBe("Bearer ghp-secret");

    const stored = await prisma.forgeConnection.findFirstOrThrow({ where: { userId } });
    expect(decrypt(stored.encryptedToken!)).toBe("ghp-secret");
  });

  it("updates the token when the same account reconnects", async () => {
    vi.stubGlobal("fetch", fetchStub([{ url: /\/user$/, body: { login: "dev" } }]).fetch);

    const send = (token: string) =>
      request(app).post("/api/connections/github").set("Cookie", cookie).send({ host: "ghe.acme.com", token });
    await send("one");
    const res = await send("two");

    expect(res.status).toBe(200);
    const stored = await prisma.forgeConnection.findMany({ where: { userId } });
    expect(stored).toHaveLength(1);
    expect(decrypt(stored[0]!.encryptedToken!)).toBe("two");
  });

  it("rejects a token GitHub refuses", async () => {
    vi.stubGlobal("fetch", fetchStub([{ url: /\/user$/, status: 401, body: { message: "Bad credentials" } }]).fetch);

    const res = await request(app)
      .post("/api/connections/github")
      .set("Cookie", cookie)
      .send({ host: "ghe.acme.com", token: "bad" });

    expect(res.status).toBe(400);
    expect(await prisma.forgeConnection.count()).toBe(0);
  });

  it("sends github.com to the GitHub App and requires a host", async () => {
    const dotcom = await request(app)
      .post("/api/connections/github")
      .set("Cookie", cookie)
      .send({ host: "github.com", token: "x" });
    const missing = await request(app).post("/api/connections/github").set("Cookie", cookie).send({ token: "x" });

    expect(dotcom.status).toBe(400);
    expect(Object.keys(dotcom.body.errors)).toEqual(["host"]);
    expect(missing.status).toBe(400);
    expect(Object.keys(missing.body.errors)).toContain("host");
  });
});

describe("POST /api/connections/:provider", () => {
  it("404s for a provider Bammy does not know", async () => {
    const res = await request(app).post("/api/connections/bitbucket").set("Cookie", cookie).send({ token: "x" });
    expect(res.status).toBe(404);
  });
});

describe("GET /api/connections", () => {
  it("lists only the caller's connections without secrets", async () => {
    const other = await createUser("other@example.com");
    await prisma.forgeConnection.createMany({
      data: [
        { userId, provider: "gitlab", host: "gitlab.com", kind: "token", accountLogin: "me", encryptedToken: "v1.x" },
        { userId: other.user.id, provider: "gitlab", host: "gitlab.com", kind: "token", accountLogin: "them" },
      ],
    });

    const res = await request(app).get("/api/connections").set("Cookie", cookie);

    expect(res.status).toBe(200);
    expect(res.body.availableApps).toEqual(["github"]);
    expect(res.body.connections).toHaveLength(1);
    expect(res.body.connections[0]).toMatchObject({ accountLogin: "me" });
    expect(res.body.connections[0].encryptedToken).toBeUndefined();
  });
});

describe("DELETE /api/connections/:id", () => {
  it("deletes the caller's connection and 404s on someone else's", async () => {
    const other = await createUser("other@example.com");
    const mine = await prisma.forgeConnection.create({
      data: { userId, provider: "gitlab", host: "gitlab.com", kind: "token", accountLogin: "me" },
    });
    const theirs = await prisma.forgeConnection.create({
      data: { userId: other.user.id, provider: "gitlab", host: "gitlab.com", kind: "token", accountLogin: "them" },
    });

    expect((await request(app).delete(`/api/connections/${theirs.id}`).set("Cookie", cookie)).status).toBe(404);
    expect((await request(app).delete(`/api/connections/${mine.id}`).set("Cookie", cookie)).status).toBe(204);
    expect(await prisma.forgeConnection.count()).toBe(1);
  });
});

describe("GitHub App installation", () => {
  const state = (sub: string, purpose = "github-install") =>
    jwt.sign({ sub, purpose }, env.JWT_SECRET, { expiresIn: "10m" });

  const githubRoutes = (installationIds: number[]) => [
    { method: "POST", url: /github\.com\/login\/oauth\/access_token$/, body: { access_token: "user-tok" } },
    { url: /api\.github\.com\/user\/installations/, body: { installations: installationIds.map((id) => ({ id })) } },
    { url: /api\.github\.com\/app\/installations\/55$/, body: { id: 55, account: { login: "acme" } } },
  ];

  it("redirects to the app's install page with a signed state", async () => {
    const res = await request(app).get("/api/connections/github/install").set("Cookie", cookie);

    expect(res.status).toBe(302);
    const location = new URL(res.headers.location!);
    expect(location.origin + location.pathname).toBe("https://github.com/apps/bammy-test/installations/new");
    expect(jwt.verify(location.searchParams.get("state")!, env.JWT_SECRET)).toMatchObject({ sub: userId });
  });

  it("saves the installation when the OAuth user can access it", async () => {
    vi.stubGlobal("fetch", fetchStub(githubRoutes([55])).fetch);

    const res = await request(app)
      .get(`/api/connections/github/callback?installation_id=55&setup_action=install&code=c&state=${state(userId)}`)
      .set("Cookie", cookie);

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`${env.CLIENT_ORIGIN}/connections?connected=github`);
    expect(await prisma.forgeConnection.findFirst({ where: { userId } })).toMatchObject({
      provider: "github",
      kind: "github_app",
      installationId: "55",
      accountLogin: "acme",
    });
  });

  it("refuses an installation the OAuth user cannot see", async () => {
    vi.stubGlobal("fetch", fetchStub(githubRoutes([1, 2])).fetch);

    const res = await request(app)
      .get(`/api/connections/github/callback?installation_id=55&code=c&state=${state(userId)}`)
      .set("Cookie", cookie);

    expect(res.headers.location).toContain("error=github_install_forbidden");
    expect(await prisma.forgeConnection.count()).toBe(0);
  });

  it("refuses a state issued to another user", async () => {
    const other = await createUser("other@example.com");
    vi.stubGlobal("fetch", fetchStub(githubRoutes([55])).fetch);

    const res = await request(app)
      .get(`/api/connections/github/callback?installation_id=55&code=c&state=${state(other.user.id)}`)
      .set("Cookie", cookie);

    expect(res.headers.location).toContain("error=github_install_failed");
    expect(await prisma.forgeConnection.count()).toBe(0);
  });

  it("reports an installation awaiting org approval", async () => {
    const res = await request(app)
      .get(`/api/connections/github/callback?setup_action=request&state=${state(userId)}`)
      .set("Cookie", cookie);

    expect(res.headers.location).toContain("error=github_pending_approval");
  });
});
