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
# set JWT_SECRET, e.g. with: openssl rand -hex 32
docker compose up --build
```

- Web client: http://localhost:5173 (`CLIENT_HOST_PORT`)
- API: http://localhost:4000/api (`API_HOST_PORT`); the client proxies `/api` to it
- Postgres: localhost:5433 (`DB_HOST_PORT`)

If you change `CLIENT_HOST_PORT`, update `CLIENT_ORIGIN` to match.

Migrations are applied automatically when the `server` container starts.

## API

| Method | Path                 | Description |
| ------ | -------------------- | ----------- |
| POST   | `/api/auth/register` | `{ name, email, password, confirmPassword }`, sets the auth cookie |
| POST   | `/api/auth/login`    | `{ email, password }`, sets the auth cookie |
| POST   | `/api/auth/logout`   | Clears the auth cookie |
| GET    | `/api/auth/me`       | Current user, or 401 |

Register and login are rate limited (20 requests per 15 minutes per IP).

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
server/   Express API (src/routes, src/controllers, prisma/schema.prisma)
docker/   Postgres init script (creates the test database)
```
