# Codex Review: 5-C File-Handling

**Date:** 2026-05-22
**Reviewer:** OpenAI Codex (via /codex:adversarial-review --base origin/main)
**Cycle prompt:** PROMPT_5-C_FILE_HANDLING.md
**Verdict:** needs-attention (1 [high] finding, no-ship)

---

## Findings Summary

| # | Finding | Severity | Classification | Action |
|---|---------|----------|---------------|--------|
| 1 | Failed cleanup counter counts per BullMQ retry attempt, not per cron tick → cleanup fires earlier than configured (data-loss risk) | high | ACTIONABLE | Fixed in this session (see below) |

---

## ACTIONABLE — Fixes Applied

### Finding 1: Failed cleanup counter sees BullMQ retry-burst rows
**Original finding:** *"The scheduled-failure cleanup logic claims to wait for repeated cron-tick failures, but the implementation increments the failed-run counter on every retry attempt. In the worker catch path, each non-final retry still finalizes an ImportRun as `failed` before rethrowing. Later, `applyPostImportAction` counts `importRun` rows with `status='failed'` for that filename and compares to `maxImportRetries`. Because BullMQ retries (e.g. 3 attempts) produce multiple failed rows in a single cron tick, the threshold is reached much sooner than configured, causing early `failedAction` (delete/archive) of source files. This is an irreversible data-loss risk under transient connector failures."*

**Root cause:** The prompt picked option (c) (gate `applyPostImportAction` on `isFinalAttempt` for the failed path) under the belief that "the counter query then sees one failed run per cron tick (the final attempt)". That reasoning is wrong: the gate only suppresses the cleanup CALL on non-final attempts, but the worker's `finalizeFailedRun` still writes ALL retry-burst rows to `ImportRun` for audit-trail completeness. When the gate finally releases on the final attempt, the `failedCount` query sees every attempt's row for the same filename — 3 rows per tick under the default queue config (`attempts: 3`).

Concrete impact: with default `maxImportRetries=3`, one transient cron tick produces 3 failed rows; counter reads `3 > 3` is false (no cleanup yet), but a second consecutive failing tick produces 3 more rows for a total of 6, and `6 > 3` triggers cleanup after only 2 cron ticks instead of the configured 4. Pre-fix `maxImportRetries=2` would trip on the very first tick.

**Fix:** Implemented prompt's option (a) — add `was_final_attempt` column to `ImportRun` and filter the counter query.

- `apps/api/src/db/schema.prisma` — `ImportRun` gains `wasFinalAttempt Boolean @default(true) @map("was_final_attempt")`. Default true so manual / success-path / legacy audit rows all count normally; only non-final scheduled retry rows opt out.
- `apps/api/src/db/migrations/20260522210000_import_run_was_final_attempt/migration.sql` — `ALTER TABLE import_runs ADD COLUMN was_final_attempt BOOLEAN NOT NULL DEFAULT TRUE` — backfills existing rows as "final" (semantically correct: pre-fix worker didn't distinguish, so all rows represent the outcome of their cron tick from the audit-trail's perspective).
- `apps/api/src/jobs/sftp-import.worker.ts` — `importRun.create` now passes `wasFinalAttempt: isFinalAttempt`. The success path is always called with `isFinalAttempt=true` from BullMQ (no retries for successful library invocations), so its rows are correctly marked.
- `apps/api/src/services/integrations/post-import-action.ts` — counter query gains `wasFinalAttempt: true` to the `where` clause alongside `status: 'failed'`.

**Regression tests added (+3):**
- `services/integrations/__tests__/post-import-action.test.ts` — new test "BullMQ retry-burst: 3 non-final + 1 final attempts in one tick count as ONE failure". Seeds 3 `wasFinalAttempt=false` + 1 `wasFinalAttempt=true` failed rows for the same filename, asserts cleanup does NOT fire (effective counter=1 vs. maxRetries+1=4).
- `jobs/__tests__/sftp-import.worker.test.ts` — new test "non-final BullMQ retry writes ImportRun with wasFinalAttempt=false". Asserts the worker's `importRun.create` honours the passed `isFinalAttempt` flag.
- `jobs/__tests__/sftp-import.worker.test.ts` — new test "final BullMQ retry writes ImportRun with wasFinalAttempt=true". Symmetric assertion.

**Suite:** 149 → 152 tests, all green. `pnpm -C apps/api typecheck` + `build` clean.

**Why option (a) over (c):** option (c) is what the prompt picked, and it's the wrong shape — the gate only blocks the CALL, not the persistence. Option (a) (small schema add) is the only one that makes the counter query itself correct. Schema cost is minimal: one BOOLEAN column with a safe default. Future hardening (e.g. retention policy on `import_runs`) doesn't need to special-case the new column.

---

## DEFERRED — Added to KNOWN_TODOS

None. The single finding was ACTIONABLE and fixed in-session.

---

## Notes

- The fix preserves the audit-trail value of writing every retry attempt's `ImportRun` row (operators can still inspect retry history, the new `wasFinalAttempt` column distinguishes attempts from outcomes).
- The migration was added separately (`20260522210000_…`) rather than amending `20260522190000_…` because the prior migration already touched production-ready schema territory — keeping them separate makes the review-fix audit-trail explicit in `prisma migrate` history.
- No existing test assertions needed adjustment: `seedImportRun` in the service test file gained a new optional `wasFinalAttempt` parameter that defaults to `true`, so the previously-seeded "exactly at threshold" / "above threshold" / "counter resets after success" cases all keep their original semantics.
