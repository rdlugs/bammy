# Alpha release handoff

## Verification completed on 2026-10-05

- Server: 435 tests pass; type check passes.
- Client: 166 tests pass; type check, lint, and production build pass.
- Lint has four existing warnings in generated UI components and the mobile hook.
  The lint command now targets source and Vite/Vitest configuration, avoiding
  installed dependencies inside Docker.
- The build reports existing large JavaScript chunk warnings.
- A disposable source copy with fresh Docker volumes successfully installs locked
  dependencies, initializes PostgreSQL and the test database, applies migrations,
  starts the API and worker, and passes the API health check.
- Compose defaults API and worker to development and resolves production when
  selected. Container checks confirm production secure cookies and forge-host
  restrictions, development behavior, and rejection of the invalid value `prod`.
- The hosted GitHub Actions run passes on the release pull request.
- Gitleaks scans all 37 local Git commits and tracked/publishable new files without
  finding leaks. Ignored environment files are excluded from the publishable-file
  scan. A separate scan of the disposable setup flagged its intentionally generated
  local encryption key, not a committed credential. Remote-only history is outside
  this scan.

Secret scanner image used:
`zricethezav/gitleaks@sha256:c00b6bd0aeb3071cbcb79009cb16a60dd9e0a7c60e2be9ab65d25e6bc8abbb7f`.
These checks reduce uncertainty but are not a comprehensive security audit.

## Dependency audit findings

Audits ran inside Docker using `npm audit --json`. Counts include affected parent
packages, not just distinct advisories. `npm audit fix --force` was not used: its
suggested fixes downgrade major Prisma/shadcn versions.

| Area | Initial report | Resolution |
| ---- | -------------- | ---------- |
| Server | 4 high-severity package entries: Prisma, its config, deepmerge-ts, and mysql2 | **Remediated.** `overrides` in `server/package.json` pin `mysql2@^3.24.5` and `deepmerge-ts@^8.0.2` inside the Prisma toolchain. `npm audit` reports 0 vulnerabilities, with and without dev dependencies. Server tests, type check, and `prisma validate` pass with the overrides. Drop them once Prisma ships the patched versions itself. |
| Client | 7 high-severity package entries through shadcn registry/tooling, ts-morph, fast-glob, micromatch, and braces | **Accepted for alpha.** No patched `braces` release exists (latest 3.0.3 is affected). `shadcn` moved to `devDependencies`: the app only imports its CSS at build time, so `npm audit --omit=dev` reports 0 vulnerabilities and nothing affected ships in the browser bundle. The remaining findings are a denial-of-service risk in local build tooling when given untrusted glob patterns. Revisit when braces or shadcn publish a fix. |

The underlying advisories reported by npm are
[deepmerge-ts recursion](https://github.com/advisories/GHSA-ggr8-5vv4-36mx),
[mysql2 credential exposure](https://github.com/advisories/GHSA-3f6p-5ww8-9rcr),
[mysql2 decompression](https://github.com/advisories/GHSA-rgwj-5xj2-c3m3), and
[braces recursion](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).

## Maintainer actions before publication

- [ ] Confirm permission to license original code and branding assets under MIT.
- [ ] Enable GitHub private vulnerability reporting and verify the private report
  link in SECURITY.md and CODE_OF_CONDUCT.md works for reporters.
- [x] Review and explicitly accept or remediate the dependency audit findings for
  the alpha release.
- [x] Obtain a passing hosted CI run after an authorized commit and push
  ([run 37313406503](https://github.com/rdlugs/bammy/actions/runs/37313406503)).
- [ ] Announce alpha status, AI review limitations, and development-only Docker
  infrastructure. `NODE_ENV=production` changes backend behavior, not deployment
  infrastructure.

No browser walkthrough, screenshots, live model review, or production deployment
was performed. Browser actions need explicit approval. Changes remain unstaged
until staging or committing is authorized.
