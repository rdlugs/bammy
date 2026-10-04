# Bammy

React + shadcn/ui single-page app with user registration, login and a protected (empty) dashboard, backed by an Express + Prisma API on PostgreSQL.

## Stack

| Layer    | Tech |
| -------- | ---- |
| Client   | Vite, React 19, TypeScript, Tailwind CSS v4, shadcn/ui, React Router, TanStack Query, react-hook-form + zod |
| API      | Express 5, TypeScript (run with tsx), Prisma 7 (`@prisma/adapter-pg`), zod, argon2id, JWT in an httpOnly cookie |
| Database | PostgreSQL 17 |

### Why PostgreSQL over MySQL

- Real `UUID`, `TIMESTAMPTZ` and `CITEXT` types (emails are case-insensitive at the database level).
- `JSONB`, arrays, full-text search and row-level security for future cloud features.
- Transactional DDL, so a failed migration rolls back cleanly.

## Getting started

Requires Docker with Compose.

```sh
cp .env.example .env
# set JWT_SECRET and ENCRYPTION_KEY, each with: openssl rand -hex 32
docker compose up --build
```

- Web client: http://localhost:5173 (`CLIENT_HOST_PORT`)
- API: http://localhost:4000/api (`API_HOST_PORT`); the client proxies `/api` to it
- Postgres: localhost:5433 (`DB_HOST_PORT`)

If you change `CLIENT_HOST_PORT`, update `CLIENT_ORIGIN` to match.

Migrations are applied automatically when the `server` container starts.

The `worker` container runs review jobs. It polls the `review_jobs` table (claimed with `FOR UPDATE SKIP LOCKED`, so several workers can run side by side); tune it with `WORKER_POLL_INTERVAL_MS`, `WORKER_CONCURRENCY`, `WORKER_LOCK_TIMEOUT_MS` and `WORKER_MAX_ATTEMPTS`.

## API

| Method | Path                 | Description |
| ------ | -------------------- | ----------- |
| POST   | `/api/auth/register` | `{ name, email, password, confirmPassword }`, sets the auth cookie |
| POST   | `/api/auth/login`    | `{ email, password }`, sets the auth cookie |
| POST   | `/api/auth/logout`   | Clears the auth cookie |
| GET    | `/api/auth/me`       | Current user, or 401 |
| GET    | `/api/connections`   | The caller's forge connections, and whether GitHub is configured |
| POST   | `/api/connections/gitlab` | `{ host?, token }`, validates the token against GitLab and stores it encrypted |
| GET    | `/api/connections/github/install` | Redirects to the GitHub App's install page |
| GET    | `/api/connections/github/callback` | GitHub's return URL after installing the app |
| DELETE | `/api/connections/:id` | Removes a connection and its repositories |
| GET    | `/api/repos?connectionId=` | Repositories the connection can see, with their enabled flag |
| POST   | `/api/repos`         | `{ connectionId, externalId }`, enables a repository for review |
| PATCH  | `/api/repos/:id`     | `{ enabled }` |

Register and login are rate limited (20 requests per 15 minutes per IP).

## Forge connections

**GitLab**: connect with a personal, project or group access token with the `api` scope and at least Developer access. Self-hosted instances work by entering their host.

**GitHub**: create a GitHub App (Settings, Developer settings, GitHub Apps) and put its details in `.env`:

- Setup URL: `http://localhost:5173/api/connections/github/callback`, with **Request user authorization (OAuth) during installation** checked. Bammy uses that OAuth code to confirm the installing user can actually access the installation.
- Repository permissions: Pull requests (read and write), Contents (read), Commit statuses (read and write), Metadata (read).
- Copy the App ID, slug, client ID, a client secret and a generated private key into the `GITHUB_APP_*` variables.

In production, self-hosted forge hosts must use https and resolve to public addresses.

## Tests

```sh
docker compose exec server npm test   # API tests against the bammy_test database
docker compose exec client npm test   # React component and routing tests
```

## Database changes

```sh
# edit server/prisma/schema.prisma, then:
docker compose exec server npx prisma migrate dev --name <change>
```

## Project layout

```
client/   React SPA (shadcn components live in src/components/ui)
server/   Express API (src/routes, src/controllers, prisma/schema.prisma) and the review worker (src/worker)
docker/   Postgres init script (creates the test database)
```
