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

The initial command builds the client and server dependency images. For subsequent
starts, use `docker compose up`. Source changes are bind-mounted into the containers
and picked up by the development watchers without rebuilding. Rebuild the images
when either `package.json` or `package-lock.json` changes.

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
| PATCH  | `/api/repos/:id`     | `{ enabled?, settings?, followGlobal? }`; `settings` replaces the saved review overrides, `followGlobal` makes the repository ignore them and use only the global config |
| GET    | `/api/repos/:id/config` | The effective review config for the default branch, where each value came from, and any repository-file warnings |
| POST   | `/api/reviews`       | `{ url }` of a pull or merge request on an enabled repository; queues a review of its current head |
| GET    | `/api/reviews?repoId=&status=&page=&limit=` | The caller's reviews, newest first, with a summary but not the full result; returns `{ reviews, total, page, limit }` (`limit` 1-100, default 20) |
| GET    | `/api/reviews/:id`   | One review with its full result |
| GET    | `/api/reviews/:id/markdown` | The review as the markdown document that is posted to the forge |
| POST   | `/api/reviews/:id/rerun` | Queues a fresh review of the PR's latest head |
| POST   | `/api/webhooks/github` | GitHub App webhook (signed with `GITHUB_WEBHOOK_SECRET`) |
| POST   | `/api/webhooks/gitlab/:repoId` | GitLab project hook Bammy registers per repository (token checked per repository) |
| GET    | `/api/config/schema` | Defaults, profiles, severities and categories for the settings UI |
| GET    | `/api/config/global` | The caller's global review config, and what it resolves to with each value's source |
| PUT    | `/api/config/global` | `{ settings }`, replaces the global review config; `{}` resets it |

Register and login are rate limited (20 requests per 15 minutes per IP).

## Forge connections

**GitLab**: connect with a personal, project or group access token with the `api` scope and at least Developer access. Self-hosted instances work by entering their host.

**GitHub**: create a GitHub App (Settings, Developer settings, GitHub Apps) and put its details in `.env`:

- Setup URL: `http://localhost:5173/api/connections/github/callback`, with **Request user authorization (OAuth) during installation** checked. Bammy uses that OAuth code to confirm the installing user can actually access the installation.
- Repository permissions: Pull requests (read and write), Contents (read), Commit statuses (read and write), Issues (read), Metadata (read). Issues is used for linked and related issues in the walkthrough; without it those parts are skipped with a warning.
- Copy the App ID, slug, client ID, a client secret and a generated private key into the `GITHUB_APP_*` variables.
- Webhook: URL `<API_PUBLIC_URL>/api/webhooks/github`, a secret in `GITHUB_WEBHOOK_SECRET`, and the events **Pull request**, **Issue comment** and **Installation**.

GitLab automatic reviews need a project webhook, which Bammy registers when a repository is enabled at `API_PUBLIC_URL`. That takes **Maintainer** access; with only Developer access the repository is enabled for manual reviews and the dashboard says why automatic ones are off. GitLab must be able to reach `API_PUBLIC_URL`; for local development use a tunnel.

In production, self-hosted forge hosts must use https and resolve to public addresses.

## Publishing to the forge

When a review starts, Bammy posts a "reviewing" summary comment and sets a pending `bammy/review` commit status. When it finishes it publishes, each step independently:

- **Inline comments** for actionable findings only (GitHub: one review posted as `COMMENT`, never approve or request changes; GitLab: one discussion per finding). Suggestions use each forge's suggestion syntax. Each comment carries a hidden fingerprint, so a later run never posts the same finding twice, even if Bammy's own records are lost.
- **The summary comment**, edited in place: the markdown served by `GET /api/reviews/:id/markdown`. One comment carries both what the change does (the walkthrough, when `output.walkthrough` is on) and what the review found. It ends with a line naming the commit, models and coverage, which `output.review_stats` turns off. With `output.post_summary` off, the walkthrough is posted as a comment of its own. `output.summary_location` is accepted but ignored, and a walkthrough block an earlier version wrote into the description is removed on the next review.
- **The walkthrough's optional parts**, each with its own switch: the review effort estimate (`output.estimate_effort`), a Mermaid sequence diagram of the main flow (`output.sequence_diagrams`), an assessment of how well the change addresses the issues it closes (`output.assess_linked_issues`; "fixes #12" style references on GitHub, GitLab's own closing issues on GitLab) and possibly related issues found by searching the tracker for the title's keywords (`output.related_issues`). Only issues the forge returned are ever shown.
- **The high-level summary** (`output.high_level_summary`): release notes by default, or whatever `output.high_level_summary_instructions` asks for. `output.high_level_summary_placement` puts it in the PR/MR description (the default, between hidden markers at the end, replaced on each run and never read back as the author's text) or in the walkthrough.
- **Labels**, when `output.blast_radius_label` or `output.effort_label` is on: the walkthrough's estimates as native labels such as `Large blast radius` or `10-20 Minutes`. A later run swaps a changed estimate's label. GitHub and GitLab only; on GitHub both labels and the cleanup of old description blocks use the Pull requests (write) permission.
- **The commit status**: `success` (pass), `failure` (blocked) or `error` (incomplete; GitLab shows it as `failed`), linking to the review in the dashboard. Branch protection can require it.

Turn the first three off with `output.post_inline`, `output.post_summary` and `output.post_check`, and the walkthrough with `output.walkthrough`. If publishing fails, the review is kept and the job is marked partial with the reason.

## Automatic reviews

- A PR/MR is reviewed when it opens, reopens, leaves draft or receives new commits. A commit that was already queued or reviewed is never reviewed again, so redelivered webhooks are harmless, and a newer push supersedes a review still waiting in the queue.
- Comment `/bammy review` on a PR/MR to ask for a review of its current head. Only people who can push (GitHub owners, members and collaborators; GitLab Developer or above) can.
- `triggers.review` picks what is reviewed automatically when it opens, reopens or leaves draft: `manual` (nothing), `published` (the default, drafts skipped) or `all`. `triggers.review_on_push` decides whether new commits are reviewed again, and `triggers.command` turns `/bammy review` off.
- `triggers.summary` limits the walkthrough in automatic reviews: `published` (the default) or `manual`, which leaves it to requested reviews.
- Automatic reviews are skipped when the title contains a phrase in `triggers.ignore_titles` (ignoring case), the author or whoever pushed is in `triggers.skip_authors`, the change carries a label in `triggers.skip_labels` (exact and case-sensitive), or the source or target branch name contains an entry of `triggers.skip_source_branches` / `triggers.skip_target_branches`. A manual review or `/bammy review` is never skipped by these lists.
- All of this is checked by the worker with the full configuration, so a skipped review shows in the dashboard with the reason.
- Older settings keep their meaning: `triggers.on_push: false` reads as `review: manual` and `triggers.drafts: true` as `review: all`, unless the same layer sets `review`.
- Each user has at most `WORKER_USER_CONCURRENCY` reviews running at once, and a repository holds at most 10 queued.
- With `triggers.abort_on_close` (the default), closing or merging a PR/MR cancels its queued reviews, and a running review stops: the worker checks the change before it starts, every 15 seconds while it runs (aborting model calls in flight) and before publishing. A cancelled review publishes nothing and closes its pending commit status as `error`. The webhook decides on queued reviews from the dashboard settings; the worker uses the full configuration, repository file included.

The worker keeps a small in-memory cache of what a commit fixes: the repository config file at the base revision and the change's diff for a given base and head. Reruns of the same head skip those forge calls; titles, descriptions, labels and state are always read fresh. `review.disable_cache` turns it off. Set in the dashboard it covers every read; set in `.bammy.yaml` the diff is fetched again once the file has been read.

## Review configuration

Settings resolve in this order, highest first:

1. Overrides from whatever triggered the review
2. `.bammy.yaml` (or `.bammy.yml`; the first found wins, they are not merged) in the repository, read from the PR's **base** revision so a change cannot loosen its own review
3. Repository settings saved in the dashboard (ignored while the repository follows the global config, which is the default for new repositories)
4. The global config saved on the Configuration page, shared by all of a user's repositories
5. The selected profile: `balanced` (default), `fast`, `strict`, `security`
6. Built-in defaults

A field set explicitly in any layer beats the profile. An invalid repository file is ignored as a whole and reported as a warning; the review still runs. The file cannot hold API keys, tokens or endpoints.

### LLM connections and custom endpoints

Add and verify provider credentials in Settings > API keys, then select one in Configuration > LLM. Global configuration requires a connection; a repository can inherit it or select another saved connection. The selection is a live reference, so replacing its key or changing its custom host in Settings updates every configuration that uses it.

A connection with a custom host sends every model call to that compatible proxy. The model's provider prefix still picks the request format (`openai/` uses chat completions), and the rest of the id is passed through as is, slashes and parentheses included. Without a custom host, every configured model must use the selected connection's provider.

For 9router, save its key and host under OpenAI in Settings > API keys, select the OpenAI connection in Configuration > LLM, and use a model such as `openai/cx/gpt-5.6-sol(medium)`.

The worker runs in a container, where `localhost` is the container itself; `host.docker.internal` reaches a proxy running on the host.

### Ollama

Add Ollama under Settings > API keys and enter its OpenAI-compatible base URL. For Ollama running on the Docker host, use `http://host.docker.internal:11434/v1`. The API key is optional. Select the Ollama connection in Configuration > LLM and use the `ollama/<model>` form, for example `ollama/qwen3`.

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
  disable_cache: false      # fetch the diff and config file fresh on every run
output:
  walkthrough: true
  post_inline: true
  post_summary: true
  post_check: true
  review_stats: true        # the commit/models/coverage line under the summary
  agent_prompts: true       # a prompt for AI agents in each actionable inline comment
  agent_prompt_all: true    # one prompt for every finding in the summary comment
  blast_radius_label: false # e.g. "Large blast radius"
  effort_label: false       # e.g. "10-20 Minutes"
  estimate_effort: true     # review effort in the walkthrough
  sequence_diagrams: true   # Mermaid sequence diagram in the walkthrough
  assess_linked_issues: true
  related_issues: true
  high_level_summary: true
  high_level_summary_placement: description   # description | walkthrough
  high_level_summary_instructions: ""         # empty: release notes
triggers:
  review: published         # manual | published | all (drafts too)
  review_on_push: true      # review new commits pushed to an open PR/MR
  summary: published        # manual | published: walkthrough in automatic reviews
  command: true             # allow "/bammy review" in a comment
  abort_on_close: true      # stop a review when its PR/MR is closed or merged
  ignore_titles: ["WIP"]    # title contains, ignoring case
  skip_authors: ["dependabot[bot]"]
  skip_labels: ["no-review"]          # exact, case-sensitive
  skip_source_branches: ["release/"]  # branch name contains
  skip_target_branches: []
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
