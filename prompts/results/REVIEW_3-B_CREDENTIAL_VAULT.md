# Codex Review: 3-B Credential Vault Backend

**Date:** 2026-05-07
**Reviewer:** OpenAI Codex (via /codex:adversarial-review --base origin/main)
**Cycle prompt:** PROMPT_3-B_CREDENTIAL_VAULT.md

Codex returned `verdict: needs-attention` with two `[high]` findings. Both classified ACTIONABLE per DECISIONS 2026-04-16 (Security + Data Integrity). Both fixed in-session.

---

## Findings Summary

| # | Finding | Severity | Classification | Action |
|---|---------|----------|---------------|--------|
| 1 | Credential routes missing role-based authorization (auth middleware fallback role is `viewer`, exposing mutation + connection-test endpoints to non-admins) | high | ACTIONABLE — Security | Fixed in this session — added `requireRole('admin')` global preHandler + 7 negative tests |
| 2 | DELETE non-atomic: `count()` then `update()` is a check-then-act race; concurrent schedule INSERT can land between the two statements | high | ACTIONABLE — Data Integrity | Fixed in this session — wrapped check + update in a SERIALIZABLE transaction with P2034 retry + 503 fallback + 3 new tests |

---

## ACTIONABLE — Fixes Applied

### Finding 1: Credential routes lack role-based authorization

**Original finding (Codex):** `credentialsRoutes` only installs `authMiddleware` and `tenantMiddleware`. Since `authMiddleware` falls back to `'viewer'` for users without an explicit role claim, low-privilege users can create/update/delete credentials and trigger SFTP/FTP connection tests to arbitrary hosts. Trust-boundary break: secret material and outbound network capability exposed to non-admin principals.

**Root cause:** I followed the route-skeleton pattern from `productsRoutes` (auth + tenant only) without recognising that credentials carry a different threat profile. Other admin-only routes in the repo (`tenant/users/invite`, `tenant/users/:id`, etc.) attach `requireRole('admin')` per route, but I never called the existing `apps/api/src/middleware/require-role.ts` helper for the credential vault.

**Fix:** Added a third global `preHandler` hook to `credentialsRoutes` so every route inherits the admin guard:

```ts
app.addHook('preHandler', authMiddleware)
app.addHook('preHandler', tenantMiddleware)
app.addHook('preHandler', requireRole('admin'))
```

Applied to ALL six credential routes (GET list, POST create, POST unsaved-test, PATCH update, DELETE soft-delete, POST saved-test). Listing was admin-only-on-purpose: credential-vault metadata (host, integration-binding, last-verified) is sensitive ops info even when secrets are masked, and the route surface should match the rest of the credential management story.

**Test coverage added:**
- `credentials routes — admin-only authorization (Codex review fix)`:
  - `it.each([...])`: every route × method × role-`viewer` JWT returns `403 FORBIDDEN`. Six routes × one role = 6 cases; uses `it.each` to keep the assertion table dense.
  - One additional case for role `'manager'` verifying the allow-list is admin-only (i.e. neither viewer nor manager passes).

**Files changed:** `apps/api/src/routes/credentials/index.ts` (+6 lines).

### Finding 2: DELETE is non-atomic — concurrent schedule INSERT can bypass the in-use check

**Original finding (Codex):** `DELETE /credentials/:id` does a separate `count()` of active schedules, then `integrationCredential.update()`. Without a transaction or locking strategy, a concurrent request can create a schedule between the count and the update, leaving a soft-deleted credential referenced by an active schedule and breaking later schedule execution.

**Root cause:** Two-statement compound operation outside a transaction. Postgres' default READ COMMITTED isolation does not detect the read-write/write-read interleaving that this race produces. The original code is a textbook check-then-act bug.

**Fix:** Wrapped the in-use check + soft-delete update in a single Prisma transaction with `isolationLevel: Prisma.TransactionIsolationLevel.Serializable`. SERIALIZABLE in Postgres detects the conflicting read-set/write-set across concurrent transactions and aborts one with `serialization_failure` (Prisma error code `P2034`). The route retries once on `P2034`; if the retry also fails, it returns `503 SERIALIZATION_FAILED` so the client can retry.

```ts
const runDelete = async (): Promise<DeleteOutcome> =>
  request.db.$transaction(
    async (tx) => {
      const activeSchedules = await tx.integrationSchedule.count({ ... })
      if (activeSchedules > 0) return { kind: 'inUse', count: activeSchedules }
      await tx.integrationCredential.update({ ... })
      return { kind: 'deleted' }
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  )

for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
  try { outcome = await runDelete(); break }
  catch (err) {
    if (P2034 && attempt < MAX_RETRIES) continue
    if (P2034) return reply.code(503).send({ ...SERIALIZATION_FAILED })
    throw err
  }
}
```

**Test coverage added:**
- `credentials DELETE — atomic in-use check (Codex review fix)`:
  - **`retries the delete transaction once when Prisma raises P2034`** — `vi.spyOn(appPrisma, '$transaction').mockImplementationOnce` makes the first call throw a real `Prisma.PrismaClientKnownRequestError({ code: 'P2034' })`; second call uses the original implementation. Asserts `200 OK`, two `$transaction` invocations, and the soft-delete actually committed in the DB.
  - **`returns 503 SERIALIZATION_FAILED when P2034 persists past the retry budget`** — both calls throw P2034. Asserts `503` + `SERIALIZATION_FAILED` code + the credential row is NOT soft-deleted (every transaction rolled back).
  - **Regression assertion** that the existing 409-on-active-schedule path still fires from inside the SERIALIZABLE transaction's count branch (the parent describe block already had this case but the refactor moved the count + update inside `$transaction(...)`, so an explicit pin here is cheap insurance against a regression).

**Limitation acknowledged in test commentary:** the unit tests verify the route's retry/fallback logic but do not exercise an actual Postgres SERIALIZABLE conflict (that requires multiple open transactions on different connections, which the current test harness doesn't expose). The SERIALIZABLE protection itself is provided by Postgres and is well-trusted; what we're testing is that we'd handle the conflict correctly when it surfaces.

**Files changed:** `apps/api/src/routes/credentials/index.ts` (~80 lines reworked around the DELETE handler).

---

## DEFERRED — Added to KNOWN_TODOS

None — both findings were ACTIONABLE under the Security / Data Integrity / Correctness policy.

---

## Tests

`pnpm -C apps/api test` — 5 files, **29 tests** (was 19 after the original cycle, now +10 from the review fix), all green. `pnpm -C apps/api typecheck` + `build` + `lint` (0 errors) green.

## Follow-ups (not Codex findings — surfaced during the fix)

- **Schedule-create handler must guard against soft-deleted credentials.** The atomicity story is symmetric: when Cycle 3-D builds `POST /v1/integrations/:id/schedules`, that handler must validate (atomically with the schedule INSERT) that the referenced credential is not soft-deleted. Without it, an admin scheduling a job *after* another admin deletes the credential would land an orphan schedule. Adding to KNOWN_TODOS for Cycle 3-D to pick up.
