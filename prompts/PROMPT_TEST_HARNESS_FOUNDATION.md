# PROMPT: Test-Harness Foundation

**Phase:** Übergreifend
**Area:** Infrastructure
**Type:** Feature
**Notion:** https://www.notion.so/35424fe1d88a8166b93fd3f5a42d6032

---

## Context

Stocknify has zero backend tests today. `apps/api/package.json` already declares `vitest@^2.0.0` and a `test` script that runs `vitest run --passWithNoTests`, but no test file exists. Cycles ship features faster than they verify them, and Codex review + Vercel Preview catch a lot but not runtime regressions.

This cycle stands up the minimum viable backend test harness so that every subsequent backend cycle can ship at least one test for the surface it touches. Cycle B is the first feature cycle that depends on this — it introduces a deliberate behaviour-change in `upsertStockLevel` (idempotent skip removed) that needs a regression test. Without this cycle, that test has nowhere to live.

The decision was settled in chat on 2026-05-02 (hybrid approach, Option D in NEXT.md). Test-DB strategy: **Postgres in Docker** (decided in chat, supersedes the three options listed in NEXT.md Cycle TH scope). Document this in `DECISIONS.md` as part of this cycle.

## Non-goals

The following are explicitly out of scope. Do not implement them, even if it feels natural to bundle:

- **Frontend test infra.** No React Testing Library, no `apps/web` test setup. Different concern, deferred to a future cycle.
- **Retroactive coverage for existing features.** No tests for current routes, services, or CSV pipeline. Cycle B is the first feature cycle that ships with a test; this cycle ships only the harness + a smoke test that proves the harness works.
- **Mock factories beyond the auth helper.** No generic Prisma mock, no fixture builders for products/locations/etc. Tests will run against a real test-DB with real RLS — that's the whole point. Build factories when a test actually needs them, not pre-emptively.
- **E2E / Playwright.** Out of scope until the onboarding flow has been stable for ≥30 days.
- **Worker-schema isolation.** Decided in chat on 2026-05-02: single test-DB with sequential execution (`pool: 'forks'`, `singleFork: true`) is sufficient for current and projected test volume. Worker-schema isolation is a future optimization tracked in KNOWN_TODOS — do not implement it here.
- **Coverage thresholds.** No `--coverage` config, no minimum-coverage gates. Coverage will not be measured at all in this cycle.
- **`NODE_ENV=test` bypasses in production code.** The auth stack stays unchanged. Tests use real HS256 JWTs signed with a test secret; they go through the same JWT verification as production. If you find yourself adding `if (process.env.NODE_ENV === 'test')` to production code, stop — the design says the test secret is just a different value of the production env var, not a different code path.

## Files involved

**New files (you will create these):**

- `apps/api/docker-compose.test.yml` — Postgres 16 service for local + CI runs.
- `apps/api/.env.test` — test-only env vars; committed to repo (no real secrets).
- `apps/api/vitest.config.ts` — Vitest configuration (or update if one already exists; pre-flight check applies).
- `apps/api/src/test/build-app.ts` — `buildTestApp()` factory wrapping `buildApp()`.
- `apps/api/src/test/auth.ts` — `signTestJwt()` + `authedHeaders()` helpers.
- `apps/api/src/test/db.ts` — DB lifecycle helpers (`truncateAllTenantTables`, `createTestTenant`).
- `apps/api/src/test/global-setup.ts` — Vitest globalSetup: migrate + seed test-DB.
- `apps/api/src/test/setup.ts` — Vitest per-file setup: truncate before each test.
- `apps/api/src/test/smoke.test.ts` — the proof-of-life test suite.

**Existing files you will modify:**

- `apps/api/package.json` — add `test:up`, `test:down`, `test:setup` scripts; possibly add devDependencies (`jsonwebtoken`, `@types/jsonwebtoken`, `dotenv-cli`); drop `--passWithNoTests` from `test`.
- `.github/workflows/ci.yml` — add Postgres `services:` block, set test env vars, add `continue-on-error: true` on the existing `Test` step.
- `prompts/_state/DECISIONS.md` — add the test-DB strategy decision entry.
- `prompts/_state/STATE.md` — reflect that the harness exists and the Backend now has a smoke test.
- `prompts/_state/KNOWN_TODOS.md` — add notes about deferred items (worker-schema isolation, frontend test infra, CI test-blocking flip).
- `prompts/_state/NEXT.md` — Cycle TH was added as active in a prior chat cleanup; after this cycle ships, leave the active section empty and Cycle B becomes next.

**Existing files you will read but not modify:**

- `apps/api/src/server.ts` — `buildApp()` is already test-ready (no `listen()`, returns `FastifyInstance`). Reuse it; do not duplicate.
- `apps/api/src/db/run-manual-migrations.ts` — idempotent seed runner. The test globalSetup must invoke this after `prisma migrate deploy` so seeds (stock-type-definitions, notification-templates) are present.
- `apps/api/src/plugins/index.ts` (and the JWT plugin specifically) — to understand how the `Authorization: Bearer <jwt>` header is verified, so the test JWT-signing helper produces tokens that pass.
- `apps/api/src/db/schema.prisma` — to identify which tables are tenant-scoped (need TRUNCATE between tests) vs. system tables (stock-type definitions, notification templates — keep, they're seeded once).

## Pre-flight check (mandatory — do this FIRST, before writing any code)

> **TRANSITIONAL** — this section stays in every prompt until the memory bank has stabilized (likely the first 5–10 cycles after Memory Bank initialization). Sebastian or Claude (Chat) will signal when it can be removed. See WORKFLOW.md § Pre-flight policy.

Before implementing anything, verify whether parts of this harness already exist in the repo. Two things to check carefully:

1. **`apps/api/vitest.config.ts`** — does it exist? If yes, read it. If it has any setup beyond an empty default config (custom `globalSetup`, `setupFiles`, env loading), respect what's there and merge — do not blindly overwrite.
2. **`apps/api/src/test/`** — does this directory exist? Does it contain test files, helpers, or a previous abandoned attempt at a harness? If yes, document what you find in the result file. Re-use anything sound; replace anything broken.
3. **`apps/api/.env.test`** — does it exist with values? If yes, verify it matches the schema this prompt specifies; otherwise overwrite cleanly.
4. **`docker-compose.test.yml`** at the repo root or in `apps/api/` — does it exist? Same logic.

Then skim the most recent ~20 entries in `prompts/results/` (sorted by mtime) and `git log --oneline -30` for any test-harness-adjacent commit. The Testing-strategy decision is fresh (2026-05-02), but a half-baked attempt could exist from earlier.

**Classify and act:**

- **Already done in full:** the harness is implemented, smoke tests pass, CI integration is wired. → Stop. Write `prompts/results/RESULT_TEST_HARNESS_FOUNDATION.md` noting "already implemented; no changes needed", set Notion to ✅ Ausgeführt with `Ergebnis: "Pre-flight: harness already present, no commit"`. Do not commit code; do still update STATE.md if the existing implementation isn't reflected there.
- **Partially done:** some pieces exist (e.g. an empty `vitest.config.ts` and an unused `test/` folder). → Implement only the missing pieces. In the result file, list which were already there (with file pointers) and which you added.
- **Not done:** proceed normally with Requirements below.

If uncertain whether something pre-existing is sound, default to flagging in the result file and proposing a path; do not silently overwrite.

## Requirements

### 1. Postgres in Docker

Create `apps/api/docker-compose.test.yml` with one service:

- Image: `postgres:16-alpine`
- Container name: `stocknify-test-db`
- Port mapping: `5433:5432` (5432 is reserved for any local prod-like setup)
- Environment: `POSTGRES_USER=test`, `POSTGRES_PASSWORD=test`, `POSTGRES_DB=stocknify_test`
- Volume: a named volume `stocknify-test-db-data` mounted at `/var/lib/postgresql/data` so data survives `docker-compose stop` but is wiped by `docker-compose down -v`.
- A healthcheck using `pg_isready` so `docker-compose up --wait` blocks until the DB accepts connections.

The test-DB is intentionally separate from any local dev DB. Local dev (Sebastian's `pnpm dev`) talks to remote Supabase, not local Postgres, so port 5433 is collision-free.

### 2. Test environment file

Create `apps/api/.env.test` with these values. This file IS committed to the repo — the values are throwaway test credentials, never real secrets. Add a comment header making this explicit so a future contributor doesn't gitignore it.

```
# Test-only env file — committed to the repo.
# Values are throwaway and used exclusively by the Vitest harness.
# Do NOT add real secrets here. Real secrets live in .env (gitignored).

NODE_ENV=test
DATABASE_URL=postgresql://test:test@localhost:5433/stocknify_test
DIRECT_URL=postgresql://test:test@localhost:5433/stocknify_test
SUPABASE_URL=https://test.supabase.co
SUPABASE_SERVICE_ROLE_KEY=test-service-role-key
SUPABASE_JWT_SECRET=test-jwt-secret-do-not-use-in-prod
REDIS_URL=redis://localhost:6379
CREDENTIALS_ENCRYPTION_KEY=00000000000000000000000000000000
STRIPE_SECRET_KEY=sk_test_dummy
STRIPE_WEBHOOK_SECRET=whsec_dummy
RESEND_API_KEY=re_dummy
FROM_EMAIL=test@stocknify.test
SENTRY_DSN=
```

Verify against `apps/api/src/config.ts` and any zod schema it has — every var the config requires must be present here or `buildApp()` will fail at import time. If the config requires more vars than listed above, add them with safe dummy values.

### 3. Vitest configuration

Create or update `apps/api/vitest.config.ts`:

- Load `.env.test` before tests run (use `dotenv` programmatically inside the config — the `loadEnv` from Vite does NOT load `.env.test` for backend vitest by default).
- `pool: 'forks'`, `poolOptions: { forks: { singleFork: true } }` — sequential execution. This is the deliberate choice; do not switch to threads.
- `globalSetup: ['./src/test/global-setup.ts']`
- `setupFiles: ['./src/test/setup.ts']`
- `testTimeout: 15000` — generous default; individual tests can override.
- `include: ['src/**/*.test.ts']` — co-located test files plus the `src/test/` directory.
- `globals: false` — keep imports explicit.

### 4. Global setup: migrate + seed

`apps/api/src/test/global-setup.ts` runs once before any test file. It must:

1. Spawn `prisma migrate deploy --schema src/db/schema.prisma` against `DATABASE_URL`. Use `child_process.execFile` (or similar); fail fast if the exit code is non-zero.
2. Run the manual-migrations runner (`tsx src/db/run-manual-migrations.ts`). Same failure semantics.
3. After both succeed, log `[test] DB ready` to stdout.

Do NOT use `prisma db push` — production uses `migrate deploy`, and the test-DB must mirror exactly what production will have.

If `DATABASE_URL` does not point at `localhost:5433` (or `127.0.0.1:5433`), abort with a clear error message ("Refusing to migrate against non-test DB"). This is a guard against accidentally running tests against the production Supabase URL if someone mis-sources their env file. Parse the URL with `new URL(...)` and check both `hostname` and `port` explicitly — string-matching `'localhost:5433'` is not enough because the URL might come in as `127.0.0.1:5433`.

### 5. Per-test setup: truncate

`apps/api/src/test/setup.ts` registers a `beforeEach` that calls a helper from `apps/api/src/test/db.ts`:

- `truncateAllTenantTables()` — issues a single `TRUNCATE table_a, table_b, ... RESTART IDENTITY CASCADE` SQL statement against the test-DB.
- The list of tables is the set of tenant-scoped tables: `tenants`, `users`, `products`, `product_variants`, `locations`, `storage_locations`, `stock_levels`, `stock_movements`, `batches`, `integrations`, `integration_credentials`, `integration_schedules`, `external_references`, `csv_mapping_templates`, `rules`, `rule_actions`, `notification_channels`, `alerts`, `notification_deliveries`. Verify this list against `apps/api/src/db/schema.prisma` and adjust if any are missing or named differently. Tables NOT in this list (system tables like `stock_type_definitions`, `notification_templates`, `_prisma_migrations`) are seeded once in globalSetup and stay between tests.
- The truncate runs as a raw query via `prisma.$executeRawUnsafe`. Wrap it so any error includes the failing statement for debugging.

The truncate must run inside RLS-bypass mode. Either run it as the Postgres superuser (the `test` role on the docker container is the table owner, which bypasses RLS by default), or explicitly `SET LOCAL row_security = off` for the truncate transaction. Verify which one applies in the docker-compose setup and pick whichever works without per-table policy gymnastics.

### 6. Test-app factory

`apps/api/src/test/build-app.ts` exports `buildTestApp(): Promise<FastifyInstance>`:

- Calls `buildApp()` from `src/server.ts`.
- Awaits `app.ready()` so all plugins are registered before tests interact with it.
- Returns the instance.
- Tests call `app.close()` in their `afterEach` or `afterAll` to free resources.

That's it. No special config injection — `.env.test` already provides the right env vars by the time `buildApp()` is called.

### 7. Auth helper

`apps/api/src/test/auth.ts` exports two helpers:

- `signTestJwt(payload: { tenantId: string; userId: string; role?: string; email?: string }): string` — produces an HS256 JWT signed with `process.env.SUPABASE_JWT_SECRET`. The payload shape must match what the production JWT verification middleware expects (read `apps/api/src/plugins/` and any auth-related middleware to confirm exact claim names — likely `sub`, `tenant_id`, `role`, `email`, `iat`, `exp`).
- `authedHeaders(payload): { authorization: string }` — convenience wrapper that returns `{ authorization: 'Bearer ' + signTestJwt(payload) }` for use with `app.inject({ headers: ... })`.

Implementation notes:

- Use the `jsonwebtoken` package directly. `@fastify/jwt` already pulls it in transitively, but add it as an explicit `devDependency` of `apps/api` for clarity (`jsonwebtoken@^9.0.0` and `@types/jsonwebtoken@^9.0.0`).
- The test JWT must include realistic `iat` and `exp` claims (e.g. `iat: now`, `exp: now + 3600`). If the production verifier rejects `exp`-less tokens, the tests will fail and you'll need to add it.
- No bypass logic. The test secret IS the secret as far as the JWT plugin is concerned. Production uses a different value of the same env var.

### 8. DB helpers

`apps/api/src/test/db.ts` exports:

- `truncateAllTenantTables(prisma: PrismaClient): Promise<void>` — see Requirement 5.
- `createTestTenant(prisma: PrismaClient, overrides?: Partial<Tenant>): Promise<{ tenant: Tenant, user: User }>` — inserts one tenant + one admin user, returns both. Defaults: `name: 'Test Tenant'`, `slug: 'test-tenant-' + randomSuffix`, `plan: 'trial'`, `plan_status: 'active'`. The user gets `role: 'admin'`. This helper is used by the smoke test and will be the foundation for future test fixtures.
- A shared Prisma client export (`testDb`) that can be reused across tests instead of each test creating its own client. Tests close the app's Fastify instance but the shared Prisma client is closed in a Vitest `afterAll` hook in `setup.ts`.

### 9. Smoke test

`apps/api/src/test/smoke.test.ts` is the proof of life. Two test cases, both must pass:

**Test 1: `GET /v1/health` returns 200.**

```typescript
it('responds 200 to GET /v1/health without auth', async () => {
  const app = await buildTestApp()
  const res = await app.inject({ method: 'GET', url: '/v1/health' })
  expect(res.statusCode).toBe(200)
  await app.close()
})
```

This proves: app boots, plugins register, routes mount, health route responds. No DB, no auth.

**Test 2: `GET /v1/products` with a valid test JWT returns 200 + empty data array.**

```typescript
it('responds 200 with empty data for a fresh tenant', async () => {
  const { tenant, user } = await createTestTenant(testDb)
  const app = await buildTestApp()
  const res = await app.inject({
    method: 'GET',
    url: '/v1/products',
    headers: authedHeaders({ tenantId: tenant.id, userId: user.id, role: 'admin' }),
  })
  expect(res.statusCode).toBe(200)
  const body = res.json()
  expect(body.data).toEqual([])
  await app.close()
})
```

This proves: DB connection works, migrations applied, JWT verification passes, tenant middleware sets `app.current_tenant_id`, RLS allows the read, products route returns the canonical envelope. The whole stack, end to end, in 6 lines.

If either test fails, the harness is broken and the cycle is not done.

### 10. Package scripts

Update `apps/api/package.json` scripts:

```json
"test": "vitest run",
"test:watch": "vitest",
"test:up": "docker-compose -f docker-compose.test.yml up -d --wait",
"test:down": "docker-compose -f docker-compose.test.yml down -v",
"test:setup": "dotenv -e .env.test -- prisma migrate deploy --schema src/db/schema.prisma && dotenv -e .env.test -- tsx src/db/run-manual-migrations.ts"
```

Notes:

- Drop `--passWithNoTests` — there is now a smoke test, and a green CI run with no tests collected would mask a misconfiguration.
- `test:setup` is a manual escape hatch (rarely needed since `globalSetup` does the same thing). Keep it for debugging.
- Add `dotenv-cli` to devDependencies if not already present, so `dotenv -e .env.test --` works in scripts.

### 11. CI integration

Update `.github/workflows/ci.yml`:

1. Add a `services:` block to the `ci` job:

```yaml
services:
  postgres:
    image: postgres:16-alpine
    env:
      POSTGRES_USER: test
      POSTGRES_PASSWORD: test
      POSTGRES_DB: stocknify_test
    ports:
      - 5433:5432
    options: >-
      --health-cmd "pg_isready -U test -d stocknify_test"
      --health-interval 10s
      --health-timeout 5s
      --health-retries 5
```

2. Set `DATABASE_URL`, `DIRECT_URL`, and `SUPABASE_JWT_SECRET` (and any other vars the API config requires) on the existing `Test` step. The simplest is to mirror `.env.test` values inline as `env:` on that step:

```yaml
- name: Test
  run: pnpm turbo test
  continue-on-error: true
  env:
    DATABASE_URL: postgresql://test:test@localhost:5433/stocknify_test
    DIRECT_URL: postgresql://test:test@localhost:5433/stocknify_test
    SUPABASE_JWT_SECRET: test-jwt-secret-do-not-use-in-prod
    # plus whatever else config.ts demands
```

3. `continue-on-error: true` is the explicit non-blocking flag. NEXT.md tracks the future tightening to make this blocking after 5 cycles — do not flip it now.

4. Top-level `env:` block in the workflow can stay as-is; per-step env vars override.

Verify locally (or via reasoning from the ci.yml) that the existing `Type check`, `Lint`, and `Build` steps don't need DATABASE_URL — only the `Test` step does. If they currently work without it, the per-step approach is correct.

### 12. DECISIONS entry

Append to `prompts/_state/DECISIONS.md` (new entry at the top, append-only-from-the-top format):

```
## 2026-05-02 — Test-DB strategy: Postgres in Docker, single DB, sequential

**Decision:** Backend tests run against a Postgres 16 container managed via `apps/api/docker-compose.test.yml` locally and via GitHub Actions service container in CI. Single test database (`stocknify_test`); Vitest runs sequentially (`pool: 'forks'`, `singleFork: true`) with `TRUNCATE … RESTART IDENTITY CASCADE` of all tenant-scoped tables in `beforeEach`. Worker-schema isolation is explicitly deferred.

**Rationale:** Stocknify has zero tests today and projected growth is <15 backend tests across the next ~3 months (Cycles B/D/E plus incremental coverage). At that volume, sequential execution against a single DB is faster end-to-end than worker-schema setup + per-worker migrate, and dramatically simpler. Schema isolation becomes worth its complexity around 50+ tests; until then, single-DB sequential is the right tradeoff.

**Alternatives considered:**
- Dedicated Supabase test-DB — rejected: network-bound CI runs are slower, vendor lock-in for test infra, prod/test infrastructure entanglement.
- Testcontainers — rejected: per-suite container startup overhead is real and not justified at current test volume.
- Worker-schema isolation on a single Postgres instance — deferred: correct future destination if test count grows past ~50, but premature now. Tracked in KNOWN_TODOS.
```

### 13. KNOWN_TODOS additions

Append to the relevant sections of `prompts/_state/KNOWN_TODOS.md`:

Under "Testing strategy" (existing section): add a sub-bullet noting the harness is now in place and listing the deferred extensions:

- Worker-schema isolation: defer until backend test count > 50 or sequential runs exceed 60s.
- Frontend test infrastructure (React Testing Library): unchanged from existing entry, still post-Cycle-TH.
- CI test-blocking flip: unchanged from existing entry, still after 5 cycles.
- Vitest UI / `--ui` mode: not configured; can be added if a future cycle benefits from it.

### 14. STATE.md update

Update `prompts/_state/STATE.md`:

- "Last updated" line: bump to 2026-05-02 with a brief description ("Test-Harness Foundation shipped — Backend now has a Vitest harness against Postgres-in-Docker, smoke test green").
- Under "What's deployed and working", add an entry summarising the harness (one paragraph, format consistent with existing entries).
- Under "Critical paths", add the new test files (`apps/api/docker-compose.test.yml`, `apps/api/src/test/build-app.ts`, `apps/api/src/test/auth.ts`, `apps/api/src/test/smoke.test.ts`).
- "What's in flight" stays "Nothing" once this cycle ships.

### 15. NEXT.md cleanup

Update `prompts/_state/NEXT.md`:

- The "🟢 Active cycle" entry currently lists Cycle TH (this cycle). After this cycle ships, leave the active section empty (write a one-line "Nothing — next chat opens Cycle B" placeholder).
- Cycle B becomes the next queued cycle; the rest of the queue (C/D/E) is unchanged.
- Update the "Last updated" date at the top to reflect this cycle's completion.

## Acceptance Criteria

- [ ] `apps/api/docker-compose.test.yml` exists; `docker-compose -f apps/api/docker-compose.test.yml up -d --wait` starts a healthy Postgres on port 5433.
- [ ] `apps/api/.env.test` exists with all required vars; committed to the repo.
- [ ] `apps/api/vitest.config.ts` configures sequential execution + globalSetup + setupFiles + .env.test loading.
- [ ] `apps/api/src/test/global-setup.ts` runs `prisma migrate deploy` + the manual-migration runner against the test-DB and aborts if `DATABASE_URL` doesn't point at `localhost:5433` or `127.0.0.1:5433`.
- [ ] `apps/api/src/test/setup.ts` truncates all tenant-scoped tables in `beforeEach`.
- [ ] `apps/api/src/test/build-app.ts` exports `buildTestApp()` that wraps `buildApp()` + `app.ready()`.
- [ ] `apps/api/src/test/auth.ts` exports `signTestJwt()` and `authedHeaders()`; tokens pass production JWT verification.
- [ ] `apps/api/src/test/db.ts` exports `truncateAllTenantTables`, `createTestTenant`, and a shared Prisma client.
- [ ] `apps/api/src/test/smoke.test.ts` has two passing tests as specified.
- [ ] `pnpm -C apps/api test` exits 0 with the smoke tests passing (assumes `pnpm -C apps/api test:up` ran first).
- [ ] No `NODE_ENV === 'test'` branches anywhere in production code (`apps/api/src/{routes,services,plugins,middleware,lib,db}/**`).
- [ ] No file other than `apps/api/.env.test`, `apps/api/docker-compose.test.yml`, `apps/api/src/test/**`, `apps/api/vitest.config.ts`, `apps/api/package.json`, and `.github/workflows/ci.yml` is touched in production-code directories. (Memory bank files and DECISIONS.md are expected; that's a separate change.)
- [ ] `.github/workflows/ci.yml` has the Postgres service block, env vars on the Test step, and `continue-on-error: true` on the Test step.
- [ ] `pnpm -C apps/api typecheck` passes.
- [ ] `pnpm -C apps/api lint` passes.
- [ ] `prompts/_state/DECISIONS.md` has the 2026-05-02 test-DB strategy entry at the top.
- [ ] `prompts/_state/STATE.md` reflects the new harness; "Last updated" bumped.
- [ ] `prompts/_state/KNOWN_TODOS.md` has the deferred-items notes added.
- [ ] `prompts/_state/NEXT.md` no longer lists Cycle TH as active; Cycle B is now next-up.

## Memory Bank update (mandatory — do this LAST, before pushing)

After all code commits, in the same commit or a follow-up commit, update the memory bank:

1. **`prompts/_state/STATE.md`** — see Requirement 14.
2. **`prompts/_state/KNOWN_TODOS.md`** — see Requirement 13.
3. **`prompts/_state/DECISIONS.md`** — see Requirement 12.
4. **`prompts/_state/NEXT.md`** — see Requirement 15.
5. **Result file:** `prompts/results/RESULT_TEST_HARNESS_FOUNDATION.md` following `prompts/_templates/RESULT_TEMPLATE.md`. Include in "Tests" section the actual `vitest run` output (pass count, duration). Include in "Codex review" section the review classification.
6. **Notion entry status** → ✅ Ausgeführt at https://www.notion.so/35424fe1d88a8166b93fd3f5a42d6032. Set `Ergebnis` to the result-file path and tick `Ausgeführt am` with today's date. If the Notion MCP isn't available, leave a note in the result file.

## Codex adversarial review (required for this cycle)

After all commits including the Memory Bank update are clean, run:

```
/codex:adversarial-review --base origin/develop test harness security and correctness
```

Focus areas Codex should hit:

- **Auth helper:** the test JWT must have no path to production. Verify there's no env-var-leaking into `.env` (production), no `NODE_ENV` bypass that ships, no test secret hardcoded into production source.
- **DB safety guard:** the `localhost:5433` / `127.0.0.1:5433` check in globalSetup must actually catch the production-DB case, including connection-string parsing edge cases (URL-encoded passwords, `?schema=...` query params).
- **TRUNCATE list correctness:** if any tenant-scoped table is missing from the truncate list, tests can leak state. Cross-check against `schema.prisma`.
- **CI service-container connectivity:** verify the `services.postgres.ports` mapping actually exposes the DB to the test step (GitHub Actions service-container networking is finicky).
- **Vitest env-loading order:** `dotenv` loaded inside `vitest.config.ts` must run before `import { config } from './src/config'` in any test file, or config validation fails at import time.

Classify findings per DECISIONS 2026-04-16:

- Security / Data Integrity / Correctness → fix in another commit, possibly another Codex round. Do not push until clean.
- Hypothetical / MVP-irrelevant / deployment ergonomics → append to `KNOWN_TODOS.md`, proceed.

## Push (mandatory final step on `develop`)

After Memory Bank update is committed and Codex review is clean:

```
git push origin develop
```

This pushes to `origin/develop` only. CI runs and a Vercel Preview Deployment is created; **no production deploy** is triggered. The newly-added Test step in CI runs against the freshly-spun Postgres service container — verify it goes green (or at least non-blocking-yellow with the 2 smoke tests passing) before considering the cycle done.

**Never push to `main`.** That is Sebastian's manual merge target.

## Reminders

- **Branch is `develop`.** Verify with `git rev-parse --abbrev-ref HEAD` before committing.
- **Carry-over commit may already be done.** The prior chat-session attempt landed `01ccafe` (a NEXT.md-only carry-over) before stopping because this prompt file was missing. If the prompt file is now uncommitted (it should be — Claude (Chat) wrote it after the carry-over commit), make a second carry-over commit picking up `prompts/PROMPT_TEST_HARNESS_FOUNDATION.md` with the same `chore(memory-bank): carry over updates from prior chat session` message before starting the cycle's actual work.
- **Do not push to `main`** under any circumstances. Hotfix flow is out-of-band, Sebastian-only.
- **No `NODE_ENV === 'test'` in production code.** If a test feels like it needs a bypass, the design is wrong. Surface the friction back to chat.
- **Single-DB sequential is intentional.** Do not "improve" the design by adding worker-schema isolation. That's a future cycle.
- **One cycle, one chat.** This prompt is the entirety of the work for this chat session.
