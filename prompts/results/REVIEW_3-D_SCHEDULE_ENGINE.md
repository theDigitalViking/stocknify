# Codex Review: Cycle 3-D — Schedule Engine

**Date:** 2026-05-08
**Reviewer:** OpenAI Codex (stop-time review)
**Cycle prompt:** `PROMPT_3-D_SCHEDULE_ENGINE.md`
**Branch diff:** Cycle 3-D feature commit + memory-bank commit on `develop`

---

## Findings Summary

| # | Finding | Severity | Classification | Action |
|---|---------|----------|---------------|--------|
| 1 | PATCH schedule update bypasses credential/template validation | high | ACTIONABLE | Fixed in this session |
| 2 | Worker creates Incident + bumps consecutiveFailures on every BullMQ retry attempt | high | ACTIONABLE | Fixed in this session |

Verdict from Codex: `needs-attention`.

---

## ACTIONABLE — Fixes Applied

### Finding 1: PATCH schedule update bypasses credential/template validation

**Original finding (Codex):** The new `PATCH /v1/integrations/:id/schedules/:scheduleId` accepts `credentialId` and `csvMappingTemplateId` from the body and writes them to the row without validation. POST runs the full gate set (404 not-found, 409 `CREDENTIAL_INTEGRATION_MISMATCH`, 409 `CREDENTIAL_INACTIVE`, 400 `INVALID_TEMPLATE`); PATCH skipped all of it. An admin could swap in:
- a credential bound to a different integration (cross-attribution: schedule fires against integration A's connector with B's credentials),
- a soft-deleted or inactive credential (worker would skip silently or fail at decrypt time, but the row was successfully PATCHed and would re-fire on every cron tick),
- a credential belonging to another tenant if its UUID was obtained out-of-band (existence enumeration via the 404 vs 409 split), or
- a `csvMappingTemplate` with `direction: 'export'` or `resourceType: 'products'` (the worker would either run with garbage column mappings or hit the in-worker template-validity guard that finalises the run as `'failed'` — wasted cron slot, churned rows).

**Root cause:** The PATCH handler was written as a partial-update over the existing row's fields and treated the foreign-key fields as plain values. The validation logic lived inline in POST and wasn't extracted, so the symmetry between create and update was easy to miss.

**Fix:** Two new helpers in `apps/api/src/routes/integrations/schedules.ts`:

```ts
async function validateCredentialForSchedule(
  request: FastifyRequest,
  credentialId: string,
  integrationId: string,
): Promise<ValidationFailure | null> { /* findFirst + 3 gates */ }

async function validateMappingTemplateForSchedule(
  request: FastifyRequest,
  templateId: string,
): Promise<ValidationFailure | null> { /* findFirst + direction/resourceType gate */ }
```

Both POST and PATCH now route through them. PATCH only runs validation when the body explicitly carries a non-null value for the relevant field — `csvMappingTemplateId: null` (the explicit "clear the template" payload) skips template validation, `credentialId` undefined skips credential validation, and the rest of the PATCH proceeds as before.

```ts
if (body.data.credentialId !== undefined) {
  const credErr = await validateCredentialForSchedule(
    request, body.data.credentialId, params.data.id,
  )
  if (credErr) return reply.code(credErr.status).send(...)
}
if (
  body.data.csvMappingTemplateId !== undefined &&
  body.data.csvMappingTemplateId !== null
) {
  const tplErr = await validateMappingTemplateForSchedule(
    request, body.data.csvMappingTemplateId,
  )
  if (tplErr) return reply.code(tplErr.status).send(...)
}
```

**Test pinning** in `apps/api/src/routes/integrations/__tests__/schedules.test.ts` — five new cases under `describe('PATCH /schedules/:scheduleId — credential/template re-validation')`:

1. PATCH with a credential bound to a different integration in the same tenant → 409 `CREDENTIAL_INTEGRATION_MISMATCH`; DB row's `credentialId` is unchanged.
2. PATCH with an inactive credential → 409 `CREDENTIAL_INACTIVE`.
3. PATCH with a credential from another tenant → 404 `CREDENTIAL_NOT_FOUND` (no existence enumeration).
4. PATCH with a mapping template that has `direction: 'export'` → 400 `INVALID_TEMPLATE`.
5. PATCH with `csvMappingTemplateId: null` (clear-template path) → 200; row's `csvMappingTemplateId` becomes null.

### Finding 2: Worker creates Incident + bumps consecutiveFailures on every retry attempt

**Original finding (Codex):** The BullMQ queue is configured with `attempts: 3` + exponential backoff. Each failed attempt re-enters `processSftpImportJob`, which calls `markScheduleAndHealth(... 'failed' ...)`, which unconditionally increments `consecutiveFailures`, escalates `healthStatus` per `escalateHealth(after.consecutiveFailures)`, and creates an `Incident` row. Net effect for a single transient connection failure: three Incident rows in the operator's dashboard within ~3.5 minutes, `consecutiveFailures` snapping from 0 to 3 in one cron tick, and `healthStatus` flipping straight to `'failing'` on the very first failure (because 3 ≥ 3 trips the escalation threshold internally, regardless of whether subsequent cron ticks succeed).

This contradicts the design intent in DECISIONS 2026-05-07 ("After 3 failures, the job pauses until the next scheduled run. A notification is triggered so the operator knows it failed") — the *cron tick* is the unit of consecutive failure, not the *retry attempt within a tick*.

**Root cause:** `markScheduleAndHealth` had no awareness of which BullMQ attempt it was running under. The queue handler in `queue.ts` called `processSftpImportJob(job.data)` and threw away the rest of the `job` object, including `job.attemptsMade` and `job.opts.attempts`.

**Fix:**

1. `queue.ts` worker handler now derives `isFinalAttempt` from BullMQ semantics and threads it into the job invocation:

```ts
const handler: Processor = async (job) => {
  // attemptsMade is the count of attempts already failed; on the first
  // attempt it's 0, and BullMQ retries until attemptsMade >= attempts.
  const attempts = job.opts.attempts ?? 1
  const isFinalAttempt = job.attemptsMade + 1 >= attempts
  return processSftpImportJob(job.data, { isFinalAttempt })
}
```

2. `processSftpImportJob` accepts `isFinalAttempt` (default `true` so direct callers — tests, scripts — get the full bookkeeping) and threads it into every `markScheduleAndHealth(... 'failed' ...)` call site.

3. `markScheduleAndHealth` now branches on `isFinalAttempt` for the failure path:

```ts
// status === 'failed'
if (!isFinalAttempt) {
  // Record lastError on the integration so observability has the trail,
  // but DO NOT bump consecutiveFailures, escalate healthStatus, or
  // create an Incident — those signals belong to the cron tick, not the
  // retry attempt.
  await db.integration.update({ where: { id: integrationId }, data: {
    lastErrorAt: new Date(),
    lastError: errorMessage,
  }})
  return
}
// final attempt: bump + escalate + create Incident
```

The schedule's `lastRun*` fields and the `ImportRun` row continue to be finalised on every attempt — those are an audit trail of what the worker actually did, not a per-tick signal. An operator inspecting the per-attempt trail still sees three failed `ImportRun` rows for a fully-exhausted retry cycle, but the operator-visible state (`integration.consecutiveFailures`, `integration.healthStatus`, the `Incident` table) reflects one cron tick.

**Test pinning** in a new `apps/api/src/jobs/__tests__/sftp-import.worker.test.ts` — three cases under `describe('processSftpImportJob — final-attempt gating')`:

1. **Non-final attempt** with `isFinalAttempt: false`: connector throws, `processSftpImportJob` throws, but no incident row is created, `consecutiveFailures` stays at 0, and `healthStatus` stays at the seeded `'unknown'`. `lastError`/`lastErrorAt` *are* set so observability still has the signal.
2. **Final attempt** with `isFinalAttempt: true`: incident created (`code: 'SFTP_IMPORT_FAILED'`, `severity: 'error'`, `isUserVisible: true`), `consecutiveFailures` becomes 1, `healthStatus` becomes `'degraded'`.
3. **Three-attempt simulation** (false, false, true): exactly one incident row, `consecutiveFailures` bumped exactly once. This is the regression check that pins the production scenario.

The non-final-attempt case asserts the negative path (no incident, no escalation), which is the actual security/correctness contract Codex flagged.

---

## Files changed in this review pass

**Modified:**
- `apps/api/src/jobs/queue.ts` — handler now derives `isFinalAttempt` from `job.attemptsMade + 1 >= job.opts.attempts` and passes it to the worker.
- `apps/api/src/jobs/sftp-import.worker.ts` — `ProcessJobOptions.isFinalAttempt`; threaded through every `markScheduleAndHealth` call site; `markScheduleAndHealth` gates Incident creation + consecutiveFailures bump + healthStatus escalation on the flag.
- `apps/api/src/routes/integrations/schedules.ts` — extracted `validateCredentialForSchedule` + `validateMappingTemplateForSchedule` helpers; POST now uses them; PATCH now invokes them when `body.data.credentialId !== undefined` or `body.data.csvMappingTemplateId` is a non-null string.
- `apps/api/src/routes/integrations/__tests__/schedules.test.ts` — 5 new PATCH-revalidation cases (24 tests total in this file).

**New:**
- `apps/api/src/jobs/__tests__/sftp-import.worker.test.ts` — 3 final-attempt-gating cases. The first pinned worker test in the codebase.

## Tests

- Backend suite: 61 → 69 green (8 new across two test files).
- `pnpm -C apps/api typecheck` ✅.
- `pnpm -C apps/api lint` ✅ (0 errors; warnings unchanged from prior baseline).
- `pnpm -C apps/api build` ✅.

## Boundary verification

- **Direct callers of `processSftpImportJob`** (tests, future ad-hoc scripts) get `isFinalAttempt: true` by default — they receive the full bookkeeping. The flag's "non-final" semantics are an opt-in for the BullMQ retry path only.
- **Schedule's `lastRun*` and the `ImportRun` row** still update on every attempt. Audit trail completeness was never the issue; per-attempt operator-visible signals were.
- **`status: 'partial'` and `status: 'success'`** paths are unchanged. The flag is only consulted on `status: 'failed'`.
- **`lastError`/`lastErrorAt`** still update on non-final attempts so an observability dashboard or `/integrations` health view sees fresh failure metadata. Only the `consecutiveFailures` counter and the `Incident` table escape per-attempt churn.
