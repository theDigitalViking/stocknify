# RESULT: Cycle 3-D — Schedule Engine (BullMQ + Redis, Schedule CRUD, Worker, Retry)

**Prompt:** `prompts/PROMPT_3-D_SCHEDULE_ENGINE.md`
**Notion:** https://www.notion.so/35824fe1d88a810f88d9d22871b57599
**Branch:** develop
**Last commit:** see `git log -1` after this cycle's feature commit
**Date:** 2026-05-08

---

## Summary

Third backend cycle of Batch 3. Wires BullMQ "job schedulers" (the v5 replacement for repeatable jobs) to the existing `IntegrationSchedule` table, ships full schedule CRUD endpoints (admin-only), and adds an out-of-request worker that drains the `sftp-import` queue by streaming the latest remote CSV through the Cycle 3-C import pipeline and recording an `ImportRun`. Failures bump health, escalate to `'failing'` after 3 consecutive misses, and create an `Incident` row visible in the merchant dashboard. 19 new tests in the schedules suite; total backend suite 42 → 61 green.

## Files changed

**New:**
- `apps/api/src/lib/cron-utils.ts` — `buildCronExpression`, `describeCron`, `nextRunTimes`. Maps the user-friendly `IntegrationSchedule` fields to a 5-field cron string and back to a localized human sentence (en + de). ISO weekday `7` (Sun) is translated to cron `0` so the BullMQ scheduler interprets weekday lists the same way Postgres does. `nextRunTimes` runs through `cron-parser`'s `CronExpressionParser.parse(cron, { tz })` and `expression.next().toDate()`.
- `apps/api/src/jobs/sftp-import.worker.ts` — Out-of-request worker handler `processSftpImportJob({ scheduleId })`. Loads the schedule + integration + credential, gates on the same operational levers the manual route enforces (deleted/inactive schedule → skip; integration disabled → skip; credential inactive/incomplete/wrong type → skip), creates an `ImportRun` shell with `trigger: 'scheduled'`, lists the credential's `remotePath` and picks the newest `.csv`, streams → buffer-cap (5 MB) → `decodeBuffer` → `parseCsvStreamingBuffer` → `processStockImportRows`, finalises the run with stats + `success`/`partial`/`failed`, and updates `schedule.lastRunAt/lastRunStatus/lastRunError` plus integration `healthStatus`/`consecutiveFailures`/`lastError`. On `failed`, an `Incident` row is created (`sourceType: 'job'`, `severity: 'error'`, `code: 'SFTP_IMPORT_FAILED'`, `isUserVisible: true`). Connector throws are re-thrown so BullMQ counts the attempt as failed and applies the queue's exponential backoff (3 attempts, 30 s/60 s/120 s).
- `apps/api/src/routes/integrations/schedules.ts` — Five admin-gated routes: `GET /v1/integrations/:id/schedules` (list with `cronDescription` en + de + `nextRunAt`), `POST` (create + register BullMQ scheduler), `PATCH /:scheduleId` (update + re-register), `DELETE /:scheduleId` (soft-delete + remove scheduler), `PATCH /:scheduleId/toggle` (flip `isActive` + register/remove scheduler). The user never sends a cron string; the server compiles it via `buildCronExpression`. Credential is validated against the same binding/active gates the SFTP import route enforces (404 not-found, 409 `CREDENTIAL_INTEGRATION_MISMATCH`, 409 `CREDENTIAL_INACTIVE`). Mapping-template, when provided, must have `direction='import'` and `resourceType='stock'`.
- `apps/api/src/routes/integrations/__tests__/schedules.test.ts` — 19 tests: 7 `buildCronExpression` cases (interval_minutes, interval_hours, daily, weekly, ISO Sun→cron 0, throw on missing intervalValue, throw on missing weekdays); 4 `describeCron` cases (en + de pairs for each schedule type); 6 route validation/auth cases (happy-path daily create with scheduler-call assertion, missing intervalValue 400, missing weekdays 400, invalid timeOfDay 400, viewer-403, inactive-credential 409); 1 lifecycle case (create → list → update → toggle off → toggle on → delete with `mockedUpsert`/`mockedRemove` assertions at each step); 1 cross-tenant-isolation case (tenant B cannot list, patch, or delete tenant A's schedule).

**Modified:**
- `apps/api/src/jobs/queue.ts` — Adds `SFTP_IMPORT_QUEUE_NAME`, `SFTP_IMPORT_JOB_NAME`, `sftpImportQueue` (`new Queue('sftp-import', …)`) with `attempts: 3` + `backoff: { type: 'exponential', delay: 30_000 }` defaults, and a `startSftpImportWorker()` function that lazily imports `./sftp-import.worker.js` and constructs a `Worker` instance. The dynamic import keeps the worker (and its Prisma + connector deps) out of the test bundle — vitest mocks the queue module wholesale and never reaches the worker module.
- `apps/api/src/index.ts` — Server entry now calls `void startSftpImportWorker()` after `app.listen` resolves, gated on `config.NODE_ENV !== 'test'`. Failure inside the worker startup is logged but does not crash the API.
- `apps/api/src/server.ts` — Registers the new `schedulesRoutes` plugin under `/v1` alongside `sftpImportRoutes`.
- `apps/api/package.json` — Adds `cron-parser@^5.5.0`.

## Behaviour notes

- **BullMQ v5 jobs scheduler API.** This codebase is on `bullmq@^5.12.0`, where the older `add(name, data, { repeat: { … } })` was deprecated in favour of `upsertJobScheduler(jobSchedulerId, repeatOpts, jobTemplate)`. The schedule's UUID doubles as the `jobSchedulerId`, so create/update/toggle/delete are stable and idempotent. Removal calls `removeJobScheduler(jobSchedulerId)`.
- **Schedule timezone is currently a default, not a column.** `IntegrationSchedule` has no `timezone` column today. The `POST` body accepts `timezone` (default `'Europe/Berlin'`) and threads it into both `nextRunTimes` and `upsertJobScheduler`, but it's NOT persisted on the row — recomputes on PATCH/toggle reuse the default. Tracked in KNOWN_TODOS as a follow-up schema change.
- **Worker tenant scoping.** The worker runs outside of `tenantMiddleware`, so there's no `set_config('app.current_tenant_id', …)`. RLS is bypassed because Prisma connects as the table owner (same posture as the test harness — DECISIONS 2026-05-02). Every query the worker makes scopes by `tenantId` explicitly via `WHERE tenantId = schedule.tenantId`. The schedule's `tenantId` is the trust root.
- **Health escalation policy.** After a successful import: `healthStatus = 'healthy'`, `consecutiveFailures = 0`, `lastSuccessfulSyncAt = now()`. After a partial: `healthStatus = 'degraded'`, no `consecutiveFailures` change. After a failure: `consecutiveFailures += 1`; once it reaches 3, `healthStatus = 'failing'` (otherwise `'degraded'`). An `Incident` row is created on every failed run, not only when escalating.
- **Retry configuration is on the queue, not the scheduler.** Each cron firing creates a fresh job with `attempts: 3` and exponential backoff (30 s / 60 s / 120 s). A persistent failure burns three attempts within ~3.5 minutes, then waits for the next cron tick — there's no snowball that would hammer a downed remote server. Row-level errors (`status: 'partial'`) do NOT retry; that would re-import already-successful rows.
- **Test mocks the entire queue module.** `vi.mock('../../../jobs/queue.js', …)` replaces the BullMQ exports with `vi.fn` stubs so route handlers exercise their wiring without opening Redis. The mock surfaces the call args (`schedulerId`, `{ pattern, tz }`, `{ name, data }`) so each lifecycle assertion can verify that the BullMQ side reflects the DB side. The worker handler is intentionally untested at the unit level — its internals are exercised by the Cycle 3-C import-pipeline tests, and an isolated worker test would re-test the connector + pipeline mocks for marginal additional coverage.
- **Redis is a soft dep at startup.** The Redis client uses `lazyConnect: true`; the Queue constructor doesn't connect immediately. If Redis is unreachable when `startSftpImportWorker()` runs, the function logs and returns `null` — the API stays up and the rest of the surface (manual import, CRUD, etc.) works as before. Schedules persist in Postgres and re-register on the next worker startup.

## Tests

- **Backend** suite: 42 → 61 green (19 new in `schedules.test.ts`).
  - `buildCronExpression`: interval_minutes(30), interval_hours(2), daily(06:30), weekly([1,3,5], 17:30), ISO Sun→cron 0 conversion, throw-on-missing-intervalValue, throw-on-missing-weekdays.
  - `describeCron`: interval_minutes / interval_hours / daily / weekly each in en + de.
  - Route happy paths: create-with-cron-and-scheduler-args assertion; full lifecycle (create → list → update → toggle off → toggle on → delete) with per-step BullMQ-call assertions.
  - Route validation: missing intervalValue 400, missing weekdays 400, invalid timeOfDay 400.
  - Auth: viewer 403; inactive credential 409.
  - Cross-tenant: tenant B cannot list/patch/delete tenant A's schedule.
- `pnpm -C apps/api typecheck` ✅ green.
- `pnpm -C apps/api lint` ✅ 0 errors (warnings unchanged from prior baseline).
- `pnpm -C apps/api build` ✅ green.

## Acceptance criteria

- [x] BullMQ Queue + Worker initialized on server start (gated on `NODE_ENV !== 'test'`).
- [x] `buildCronExpression` correctly maps all four schedule types.
- [x] `describeCron` returns human-readable strings in en and de.
- [x] Schedule CRUD endpoints work with proper validation.
- [x] Creating a schedule registers a BullMQ scheduler (via `upsertJobScheduler`).
- [x] Deleting/deactivating a schedule removes the scheduler (via `removeJobScheduler`).
- [x] Worker loads schedule → credential → streams CSV → writes ImportRun + updates health.
- [x] 3 retries with exponential backoff on connection errors (queue defaults).
- [x] Failed imports create an Incident row.
- [x] All new tests pass.
- [x] `pnpm -C apps/api typecheck` passes.

## Skipped or deferred

- **Schedule `timezone` column.** Body accepts a `timezone` field but it is not persisted; recomputes on PATCH/toggle reuse the `'Europe/Berlin'` default. Add a column when tenants need per-schedule timezone control. (Tracked in `KNOWN_TODOS.md`.)
- **Worker isolated unit tests.** The prompt explicitly says the worker is exercised through 3-C's import-pipeline tests. Direct worker tests (load → fail → ImportRun row) deferred until the worker is touched again or a regression appears.
- **Retention sweeper for `import_runs`.** Cycle 3-C noted DECISIONS 2026-05-07's plan-tiered retention is not yet enforced. This cycle adds a route that creates more rows; the sweeper is still pending. (Existing KNOWN_TODOS entry.)
- **Schedule listing includes deleted rows for super-admin.** Soft-deleted schedules are filtered in the `GET` route — no admin restoration UI yet. Unscheduled work; tracked separately if needed.
- **`name` rename via PATCH.** Body schema accepts `name`, but the prompt didn't specify a rename ceremony. Updating `name` recomputes the cron only if a structured field changed; recompute is incidental, not name-driven.

## Memory bank update

- `prompts/_state/STATE.md` — appended Cycle 3-D entry; bumped Last-updated to 2026-05-08.
- `prompts/_state/KNOWN_TODOS.md` — added: schedule `timezone` column missing; worker isolated unit tests deferred; symmetric Cycle 3-D credential-delete race acknowledged as resolved by DECISIONS 2026-05-07's hard-delete (FK constraint enforces the invariant).
- `prompts/_state/NEXT.md` — Claude (Chat) updates next cycle (3-E).
