# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Bammy is an AI code reviewer for GitHub PRs and GitLab MRs: a React SPA (`client/`), an Express 5 + Prisma 7 API (`server/`), a review worker (same `server/` codebase, `src/worker`), and PostgreSQL 17. README.md documents the API endpoints, forge setup, publishing behaviour and the `.bammy.yaml` format.

## Commands

Everything runs in Docker Compose (`cp .env.example .env`, set `JWT_SECRET` and `ENCRYPTION_KEY`, then `docker compose up --build`). Run tests and tooling inside the containers:

```sh
docker compose exec server npm test                      # migrates bammy_test, then vitest run
docker compose exec server npm test -- tests/repos.test.ts   # single file
docker compose exec server npm test -- -t "name of test"     # single test by name
docker compose exec server npm run typecheck

docker compose exec client npm test                      # vitest + jsdom
docker compose exec client npx vitest run src/pages/reviews/reviews.test.tsx
docker compose exec client npm run typecheck
docker compose exec client npm run lint                  # oxlint

# schema change: edit server/prisma/schema.prisma, then
docker compose exec server npx prisma migrate dev --name <change>
```

- Server tests hit a real Postgres database (`bammy_test`, created by `docker/postgres/init-test-db.sh`) and run with `fileParallelism: false`. `server/vitest.config.ts` injects a throwaway GitHub App config.
- The `server` container applies migrations and regenerates the Prisma client on start; the client is generated into `server/src/generated/prisma` (an anonymous volume, so regenerate inside the container, not on the host).
- The server runs TypeScript directly with `tsx` (no build step). Imports use explicit `.ts` extensions.

## Architecture

### Request path (API)

`server/src/app.ts` mounts `routes/*.routes.ts` -> `controllers/*.controller.ts`. Controllers parse input with zod schemas from `schemas/`, throw `HttpError` (`lib/httpError.ts`) for expected failures, and rely on `middleware/errorHandler.ts` to turn `ZodError` into `400 { message, errors: fieldErrors }`. The client's `ApiError.fieldErrors` (`client/src/lib/api.ts`) maps those back onto react-hook-form fields. Auth is a JWT in an httpOnly cookie; `requireAuth` sets `req.userId`, and data access is always scoped by owner (e.g. `loadOwnedConnection`).

The webhook router is mounted **before** `express.json()` because signature checks need the raw body.

### Review jobs

Reviews are rows in `review_jobs`, queued by the API (manual URL, rerun, webhook, or `/bammy review` comment) and executed by the worker:

- `worker/index.ts`: poll loop; `worker/queue.ts` claims jobs with `FOR UPDATE SKIP LOCKED`, enforces per-user concurrency, recovers stale locks.
- `worker/runJob.ts`: loads repo + connection, fetches the change from the forge, resolves config, decides skip reasons (trigger settings are checked here, not in the webhook handler), runs the review, publishes, stores the result. Dependencies are injectable (`RunJobDeps`) for tests.
- `review/pipeline.ts` (`runReview`): pure apart from model calls. Classifies/ignores files, plans chunks within a token budget, runs passes concurrently plus an optional walkthrough, validates findings, computes status (`completed`/`partial`/`failed`) and verdict. Failures inside a review are recorded in the result, not thrown.

### `server/src/review/` (the engine, no DB or HTTP framework)

- `config/`: layered config resolution (trigger overrides > `.bammy.yaml` from the PR's **base** revision > dashboard repo settings > profile > defaults), with per-field source tracking.
- `diff/`, `context/`: diff parsing, language detection, ignore globs, token budgeting and chunking.
- `llm/`: prompts, zod output schemas, and `providers.ts`, which wraps the Vercel AI SDK behind a `Generate` function. Models are named `provider/model` (`anthropic`, `openai`, `google`). Keys come from env or the user's stored keys (`services/llm.ts`).
- `validate/`, `core/`: finding validation (drop/demote), severity, verdict, fingerprints (dedupe across runs via hidden markers in forge comments).
- `render/`: markdown/JSON output; the summary comment is exactly `GET /api/reviews/:id/markdown`.
- `publish/`: inline comments, summary comment, `bammy/review` commit status, each step independent.
- `forge/`: per-forge adapters (fetch change, publish, hooks) and `providers.ts` (`FORGE_INFO`: URL parsing, suggestion syntax).

### Two forge layers

Forges are split between `review/forge/` (pipeline-facing, no app concerns) and `services/providers/` (connecting accounts, GitHub App install flow, webhooks, encrypted credentials). Both are `Record<ForgeProvider, ...>` so adding a forge is compiler-guided; the step list is in the comment at the top of `server/src/review/forge/providers.ts` (Prisma enum + migration, adapter, both registries, and `client/src/features/forge/providers.tsx`).

### Client

Vite + React 19 + React Router + TanStack Query, shadcn/ui in `src/components/ui` (generated, edit sparingly). Pages in `src/pages/<area>`, feature modules (API hooks, forms, components) in `src/features/<area>`. `/api` is proxied to the server by Vite. Tests use `src/test/renderWithProviders.tsx` and stub the API via `src/test/apiRoutes.ts` / `fixtures.ts`.

### Testing conventions (server)

- `tests/helpers/fetchStub.ts` replaces `fetch` with a route table; unmatched requests throw, so tests never reach real forges.
- `tests/helpers/model.ts` fakes the `Generate` function instead of calling an LLM.
- `tests/helpers/users.ts` creates a user and returns an auth cookie for supertest.
- `tests/__snapshots__/review.md` is the rendered-markdown snapshot.

## Style

- Server: semicolons, double quotes. Client: no semicolons, double quotes in app code, `@/` alias for `src/`.
- Comments explain *why* (constraints, ordering, security decisions), matching the existing tone; keep that density.
