# RESULT: Test-Harness Foundation

**Prompt:** `prompts/PROMPT_TEST_HARNESS_FOUNDATION.md`
**Notion:** https://www.notion.so/35424fe1d88a8166b93fd3f5a42d6032
**Branch:** develop
**Last commit:** `54e3c25` — feat(api): add Vitest test harness against Postgres-in-Docker
**Date:** 2026-05-02

---

## Summary

Backend now ships with a Vitest harness that runs against a real Postgres 16 container (locally via `docker-compose.test.yml`, in CI via a `services:` block on port 5433). Two smoke tests prove the wiring end-to-end: `GET /v1/health` (no auth, 200) and `GET /v1/products` for a fresh tenant (signed HS256 JWT through the production verifier, 200 + empty array). Test JWTs are real tokens — no `NODE_ENV === 'test'` bypass exists anywhere in production code.

## Files changed

**New:**
- `apps/api/docker-compose.test.yml` — Postgres 16 service on 5433, named volume `stocknify-test-db-data`, `pg_isready` healthcheck.
- `apps/api/.env.test` — committed throwaway env (every var `config.ts` requires; `CREDENTIALS_ENCRYPTION_KEY` is a 64-hex zero string, `SUPABASE_WEBHOOK_SECRET` added beyond the prompt list).
- `apps/api/src/test/global-setup.ts` — runs `prisma migrate deploy` + the manual-migration runner; aborts if `DATABASE_URL` doesn't point at `localhost`/`127.0.0.1:5433` (parses via `new URL()`).
- `apps/api/src/test/setup.ts` — `beforeEach` truncates 25 tenant-scoped tables; `afterAll` disconnects the shared Prisma client.
- `apps/api/src/test/build-app.ts` — `buildTestApp()` wraps `buildApp()` + `app.ready()`.
- `apps/api/src/test/auth.ts` — `signTestJwt()` produces HS256 tokens signed with `SUPABASE_JWT_SECRET`; payload mirrors what `apps/api/src/middleware/auth.ts` reads (`sub`, `app_metadata.tenant_id`, `app_metadata.role`, `aud`, `iat`, `exp`).
- `apps/api/src/test/db.ts` — `truncateAllTenantTables`, `createTestTenant`, shared `testDb` Prisma client.
- `apps/api/src/test/smoke.test.ts` — proof-of-life suite (2 tests).

**Modified:**
- `apps/api/vitest.config.ts` — sequential (`pool: 'forks'`, `singleFork: true`), `globalSetup`, `setupFiles`, dotenv loads `.env.test`, `globals: false`, no coverage block (per scope).
- `apps/api/package.json` — `test`, `test:watch`, `test:up`, `test:down`, `test:setup`; drops `--passWithNoTests`; adds `jsonwebtoken`, `@types/jsonwebtoken`, `dotenv`, `dotenv-cli` devDeps.
- `pnpm-lock.yaml` — devDep additions.
- `.github/workflows/ci.yml` — `services.postgres` (16-alpine on 5433 with healthcheck), env vars on the Test step, `continue-on-error: true`.

## Pre-flight findings

1. **`apps/api/vitest.config.ts`:** existed (default-minimal — `globals: true`, v8 coverage). Overwritten cleanly per the spec (now `globals: false`, no coverage block, harness fields wired).
2. **`apps/api/src/test/`:** did NOT exist. Greenfield.
3. **`apps/api/.env.test`:** did NOT exist.
4. **`docker-compose.test.yml`:** did NOT exist (root or `apps/api/`).
5. **Prior harness commits:** `git log --oneline -30` shows none (only `014bf26 chore: add test data directory to gitignore`); no abandoned attempts.

Classification: **Not done** — proceeded with full implementation.

## Key decisions made during execution

- **`.env.test` schema deviated from the prompt's exact contents** (the prompt explicitly authorised this). Two changes:
  - `CREDENTIALS_ENCRYPTION_KEY` lengthened from 32 to 64 hex chars to satisfy `config.ts` regex `/^[0-9a-fA-F]{64}$/`.
  - `SUPABASE_WEBHOOK_SECRET=test-webhook-secret` added — required by `config.ts`, missing from the prompt list.
- **Truncate list expanded** from the prompt's 19 tables to 25 (verified against `schema.prisma`): added `product_bundles`, `variant_location_config`, `integration_attribute_definitions`, `integration_attribute_values`, `incidents`, `partner_users`. System tables (`stock_type_definitions`, `notification_templates`, `partners`, `_prisma_migrations`) intentionally excluded.
- **Truncate-list test for completeness:** kept `partners` out of the truncate list (no `tenant_id`, treated as global). Cross-tenant tests will need a separate strategy if they ever touch it.
- **`docker compose` (v2 cli)** instead of `docker-compose` (v1) in package.json scripts — matches the local Docker Desktop 28.x and the GitHub Actions `services:` model.
- **`testDb` is a single shared Prisma client** owning the connection across all tests; `setup.ts`'s `afterAll` disconnects it. App instances built via `buildTestApp()` get the prod `prisma` from `middleware/tenant.ts`; tests close them in `try/finally` per case to avoid leaks even when assertions throw.
- **Smoke test 2 uses `try { ... } finally { app.close() }`** instead of the trivial `await app.close()` from the prompt snippet — same intent, leak-safe under failed assertions.
- **No production-code edits.** `apps/api/src/{routes,services,plugins,middleware,lib,db}/**` were all read but not written. The auth helper signs HS256 with the same `SUPABASE_JWT_SECRET` env var the prod verifier reads — no test branch in `plugins/index.ts`, `middleware/auth.ts`, or anywhere else.

## Skipped or deferred

- **Worker-schema isolation** — explicitly deferred per DECISIONS 2026-05-02. Single-DB sequential is the chosen default at current and projected test volume (<50 tests). Tracked in KNOWN_TODOS.
- **RLS-isolation tests** — Prisma in tests connects as the `test` Postgres user, which is the table owner and bypasses RLS by default (RLS is `ENABLE`d, not `FORCE`d). Smoke test does not assert cross-tenant blocking. Documented under KNOWN_TODOS § Testing strategy.
- **Frontend test infra** — out of scope per prompt. Tracked in NEXT.md backlog (post-3-cycles-of-backend-discipline).
- **Coverage thresholds, `--ui` mode, E2E** — explicit non-goals.

## Tests

Local run from `apps/api/` (after `pnpm test:up`):

```
✓ src/test/smoke.test.ts (2 tests) 229ms
  ✓ test harness — smoke > responds 200 to GET /v1/health without auth
  ✓ test harness — smoke > responds 200 with empty data for a fresh tenant on GET /v1/products

Test Files  1 passed (1)
     Tests  2 passed (2)
  Start at  11:49:03
  Duration  1.39s (transform 100ms, setup 46ms, collect 328ms, tests 229ms, environment 0ms, prepare 22ms)
```

`pnpm -C apps/api typecheck` → clean. `pnpm -C apps/api lint` → 0 errors, 11 pre-existing warnings (import-order in unrelated files; harness files clean).

## Codex review

Pending — to be run before push per the prompt requirement. Focus areas: auth-helper prod-leakage, DB safety guard URL parsing, TRUNCATE list completeness, CI service-container connectivity, dotenv ordering vs config.ts import.

## Memory Bank updates

- [x] `DECISIONS.md` — 2026-05-02 test-DB strategy entry added at the top.
- [x] `STATE.md` — harness bullet added under "What's deployed and working", critical-paths table extended, "Last updated" + "What's uncommitted" refreshed.
- [x] `KNOWN_TODOS.md` — testing-strategy section gained a "Harness status (2026-05-02)" block listing the deferred extensions (worker-schema isolation, frontend infra, CI flip, Vitest UI, RLS-isolation tests).
- [x] `NEXT.md` — Cycle TH removed from Active; "Nothing — next chat opens Cycle B" placeholder. Cycle B remains next.
- [ ] Notion → ✅ Ausgeführt (Claude Code does not have direct Notion write here — Claude Chat will flip status).
- [x] This result file written.
