# Codex Review: Cycle 3-E SFTP/FTP Integration UI

**Date:** 2026-05-08
**Reviewer:** OpenAI Codex (via `/codex:adversarial-review --base origin/main`)
**Cycle prompt:** `PROMPT_3-E_INTEGRATION_UI.md`

---

## Findings Summary

| # | Finding | Severity | Classification | Action |
|---|---------|----------|---------------|--------|
| 1 | Schedule activation can succeed even when no BullMQ scheduler exists (queue/DB silent desync on POST/PATCH/DELETE/TOGGLE) | high | ACTIONABLE | Fixed in this review |
| 2 | Timezone is accepted from clients but not persisted; PATCH/TOGGLE silently fall back to default | high | ACTIONABLE | Fixed in this review |
| 3 | `import_runs` lacks foreign keys for `schedule_id` and `credential_id` | medium | ACTIONABLE | Fixed in this review |

All three findings shipped fixes in the same in-session push. Backend test suite went 69 → 77 (+8 regression cases).

---

## ACTIONABLE — Fixes Applied

### Finding 1: Schedule activation can succeed even when no BullMQ scheduler exists

**Original finding:** `POST /integrations/:id/schedules` persisted an active schedule row, then attempted BullMQ `upsertJobScheduler` in a best-effort `try/catch` that only logged on failure. Same pattern on PATCH/DELETE/TOGGLE. The route returned 201 with `isActive: true` even when Redis was unreachable, so the operator saw a "successful" schedule that would never fire. Postgres and the queue could silently drift.

**Root cause:** Cycle 3-D's choice to log-and-continue on queue-side failures, with the rationale that "schedules persist in Postgres and re-register on the next worker startup." But there's no startup reconciler today — that's a separate KNOWN_TODOS item — so the desync persists indefinitely until the next manual toggle. For the operator a green schedule that never fires is worse than a red schedule that surfaces the problem.

**Fix:** All four mutating routes in `apps/api/src/routes/integrations/schedules.ts` now sync the BullMQ scheduler **before** writing the DB and return `503 SCHEDULER_UNAVAILABLE` on failure:

- **POST**: Generates the schedule UUID upfront with `randomUUID()`, calls `registerScheduler(id, cron, tz)` first, and only inserts the DB row on success. If the DB insert subsequently fails, best-effort `removeScheduler(id)` tears down the orphaned scheduler so a phantom job can't fire against a missing row.
- **PATCH**: Computes the post-update active state, calls `registerScheduler` (active) or `removeScheduler` (inactive) **before** the `update()`, and returns 503 on queue failure with the row unchanged.
- **DELETE**: Calls `removeScheduler` first; only soft-deletes on success. Refuses with 503 otherwise — the operator can retry rather than being told the schedule is gone while it keeps firing.
- **TOGGLE**: Same — registers/removes first, flips `isActive` only after the queue side commits.

This also means the persisted `timezone` (Finding 2) is the source of truth for re-registration, not a route-level fallback.

**Tests added (3 in `schedules.test.ts`):**
- POST with mocked `upsertJobScheduler` rejection → 503, no DB row created.
- DELETE with mocked `removeJobScheduler` rejection → 503, row stays active.
- TOGGLE with mocked `removeJobScheduler` rejection → 503, `isActive` unchanged.

### Finding 2: Schedule timezone is not persisted

**Original finding:** Create accepted `timezone` and used it for `nextRunAt` + BullMQ registration, but the value wasn't stored on `integration_schedules`. Later PATCH/TOGGLE re-registration fell back to the route-level `'Europe/Berlin'` default — a schedule created in `'America/New_York'` would silently shift to Berlin time after the next mutation.

**Root cause:** Cycle 3-D explicitly deferred the `timezone` column with a TODO. The route accepted the body field for forward compatibility but had nowhere to put it.

**Fix:** Three changes:

1. **Schema:** New `timezone String @default("Europe/Berlin")` column on `IntegrationSchedule` (`apps/api/src/db/schema.prisma`). Existing rows backfill to the prior implicit default.
2. **Migration:** `apps/api/src/db/migrations/20260508130000_review_3e_fixes/migration.sql` adds the column with the default.
3. **Routes:**
   - POST validates the body's `timezone` against `Intl.DateTimeFormat` (rejects bad IANA names with 400) and writes it to the column.
   - PATCH treats the persisted column as the source of truth, only overriding when the body explicitly carries a new value (re-validates if so), and writes the resolved value back to the row.
   - TOGGLE reads `existing.timezone` for re-registration — no fallback to the route default.
   - `shapeSchedule()` no longer takes a separate `timezone` argument; it pulls from the row.

**Tests added (2 in `schedules.test.ts`):**
- POST with `timezone: 'America/New_York'` persists the value; toggle off → toggle on re-registers with `tz: 'America/New_York'` (not Berlin).
- POST with `timezone: 'Mars/Olympus_Mons'` → 400 `VALIDATION_ERROR`.

### Finding 3: `import_runs` lacks FKs for `schedule_id` and `credential_id`

**Original finding:** The `import_runs` migration added `schedule_id` and `credential_id` columns and the application writes both, but only `tenant_id`/`integration_id` got FK constraints. Orphaned references were possible.

**Root cause:** Cycle 3-C scoped the table itself but wired only the load-bearing FKs (the worker writes `schedule_id` from the schedule row, but the schema didn't enforce it).

**Fix:** Two changes:

1. **Schema:** Added Prisma relations `schedule IntegrationSchedule? @relation(...)` and `credential IntegrationCredential? @relation(...)` on `ImportRun`, both `onDelete: SetNull`. Inverse `importRuns ImportRun[]` arrays added on `IntegrationSchedule` and `IntegrationCredential` for completeness.
2. **Migration:** Same `20260508130000_review_3e_fixes/migration.sql` adds the two FK constraints with `ON DELETE SET NULL`. `SET NULL` over `RESTRICT` keeps the audit trail alive when an operator hard-deletes a credential or soft-deletes a schedule — failed-run rows survive the parent removal so incident-response can still correlate the failure. Orphan-cleanup was a no-op (the table is brand-new from `20260508120000_add_import_runs`).

**Tests added (3 in `schedules.test.ts`):**
- Raw INSERT with non-existent `schedule_id` → Postgres FK violation.
- Raw INSERT with non-existent `credential_id` → Postgres FK violation.
- SET NULL semantics: deleting a credential clears `credential_id` on its `import_runs` (instead of cascading or rejecting).

---

## DEFERRED — Added to KNOWN_TODOS

None. All three findings were ACTIONABLE per DECISIONS 2026-04-16 (Finding 1 = Correctness; Findings 2 + 3 = Data Integrity).

The two pre-existing KNOWN_TODOS entries that this review's fixes resolved have been removed from the file:
- "**`IntegrationSchedule.timezone` column is missing (Cycle 3-D fallout)**" — resolved by Finding 2.
- The "wizard schedule-create inline-fetch refactor" stays in KNOWN_TODOS (it's a frontend ergonomics issue, not a Codex finding).

---

## Tests

`pnpm -C apps/api test` — 69 → 77 green (+8 new regression cases across `schedules.test.ts`):
- 3 queue/DB atomicity (POST/DELETE/TOGGLE 503-on-queue-failure)
- 2 timezone (persistence + IANA validation)
- 3 import_runs FK enforcement (schedule_id rejection, credential_id rejection, SET NULL on delete)

`pnpm -C apps/api typecheck` ✅
`pnpm -C apps/api build` ✅
`pnpm -C apps/web typecheck` ✅ (frontend type for schedule already carries `timezone: string`)
