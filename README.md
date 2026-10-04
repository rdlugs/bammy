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

The `worker` container runs review jobs: it fetches the PR/MR, resolves the review configuration, sends the diff to the configured model in one or more passes (plus an optional walkthrough), validates the findings and stores the result on the job. Model keys come from `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` or `GOOGLE_GENERATIVE_AI_API_KEY`, unless the repository owner has stored their own. The worker polls the `review_jobs` table (claimed with `FOR UPDATE SKIP LOCKED`, so several workers can run side by side); tune it with `WORKER_POLL_INTERVAL_MS`, `WORKER_CONCURRENCY`, `WORKER_LOCK_TIMEOUT_MS` and `WORKER_MAX_ATTEMPTS`.

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
| PATCH  | `/api/repos/:id`     | `{ enabled?, settings? }`; `settings` replaces the saved review overrides |
| GET    | `/api/repos/:id/config` | The effective review config for the default branch, where each value came from, and any repository-file warnings |
| GET    | `/api/config/schema` | Defaults, profiles, severities and categories for the settings UI |

Register and login are rate limited (20 requests per 15 minutes per IP).

## Forge connections

**GitLab**: connect with a personal, project or group access token with the `api` scope and at least Developer access. Self-hosted instances work by entering their host.

**GitHub**: create a GitHub App (Settings, Developer settings, GitHub Apps) and put its details in `.env`:

- Setup URL: `http://localhost:5173/api/connections/github/callback`, with **Request user authorization (OAuth) during installation** checked. Bammy uses that OAuth code to confirm the installing user can actually access the installation.
- Repository permissions: Pull requests (read and write), Contents (read), Commit statuses (read and write), Metadata (read).
- Copy the App ID, slug, client ID, a client secret and a generated private key into the `GITHUB_APP_*` variables.

In production, self-hosted forge hosts must use https and resolve to public addresses.

## Review configuration

Settings resolve in this order, highest first:

1. Overrides from whatever triggered the review
2. `.bammy.yaml` (or `.bammy.yml`; the first found wins, they are not merged) in the repository, read from the PR's **base** revision so a change cannot loosen its own review
3. Repository settings saved in the dashboard
4. The selected profile: `balanced` (default), `fast`, `strict`, `security`
5. Built-in defaults

A field set explicitly in any layer beats the profile. An invalid repository file is ignored as a whole and reported as a warning; the review still runs. The file cannot hold API keys, tokens or endpoints.

```yaml
# .bammy.yaml - every key is optional
profile: balanced
llm:
  model: anthropic/claude-sonnet-5-5   # provider/model: anthropic, openai or google
  fallback_models: []
  temperature: 0.2
  max_tokens: 8000
review:
  categories: [security, bug, performance, logic, reliability]
  severity_floor: minor     # what is reported
  block_on: critical        # what fails the verdict and the commit status
  max_findings: 25
  max_chunks: 12
  min_confidence: 0.5
  require_evidence: true    # unproven critical/major findings are demoted
  full_file: false          # allow findings on lines the change did not touch
  committable_suggestions: true
output:
  walkthrough: true
  post_inline: true
  post_summary: true
  post_check: true
ignore_paths: ["**/*.lock", "**/dist/**"]   # replaces the default list
instructions: "Controllers stay thin; business logic lives in services."
language_instructions:
  typescript: "Strict mode; no any."
```

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
