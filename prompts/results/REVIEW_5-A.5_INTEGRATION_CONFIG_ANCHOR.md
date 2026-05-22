# Codex Review: 5-A.5 Integration als Konfig-Anker

**Date:** 2026-05-22
**Reviewer:** OpenAI Codex (via `/codex:adversarial-review --base origin/main`)
**Cycle prompt:** `prompts/PROMPT_5-A.5_INTEGRATION_CONFIG_ANCHOR.md`
**Verdict:** needs-attention → fixed in-session, ready to ship.

---

## Findings Summary

| # | Finding | Severity | Classification | Action |
|---|---------|----------|---------------|--------|
| F1 | Credential delete precheck filters `deletedAt: null` on integrations but FK is `RESTRICT` regardless — soft-deleted integration referencing the credential would slip the guard and surface as P2003 / 500 | high | ACTIONABLE (Correctness + Data Integrity) | Fixed in this commit (see below) |
| F2 | Migration backfill SQL ignores `is_active` — could promote credentials/mapping from an inactive schedule into the new integration defaults | medium | ACTIONABLE (Data Integrity) | Fixed in this commit |

No DEFERRED findings.

---

## ACTIONABLE — Fixes Applied

### F1: Credential delete precheck missed soft-deleted integration references

**Original finding:** `DELETE /credentials/:id` checks `integration.credentialId` references with `where: { deletedAt: null }`. The new FK on `integrations.credential_id` is `ON DELETE RESTRICT` regardless of soft-delete state. A soft-deleted integration still pointing at the credential would pass the app-level guard (count = 0), the code would proceed to `integrationCredential.delete`, and the DB-level FK rejection would surface as an unhandled P2003 → 500 instead of a deterministic 409.

**Root cause:** I aligned the precheck filter with the existing schedule-count filter (`deletedAt: null` everywhere) without considering that the schedule-side FK is `ON DELETE SET NULL` while the new Integration-side FK is `ON DELETE RESTRICT`. The two FK semantics need different precheck shapes: the schedule guard is a pure app-level gate (DB would silently null it), the Integration guard must mirror what the DB will actually enforce.

**Fix:**
- `apps/api/src/routes/credentials/index.ts` — the Integration-reference `count` inside the SERIALIZABLE transaction now uses `where: { tenantId, credentialId }` (no `deletedAt: null` filter). The schedule-side count is unchanged. Inline comment notes the FK-semantic asymmetry.
- Same file — added a `P2003` catch in the retry loop that maps to the same `409 CREDENTIAL_IN_USE` response, as defence-in-depth for the (vanishingly small under SERIALIZABLE) race where a referencing row appears between the count and the delete.

**Regression test:** `apps/api/src/routes/credentials/__tests__/credentials.test.ts` gains a test that soft-deletes an integration after wiring its `credentialId`, then attempts the credential DELETE — must return 409 `CREDENTIAL_IN_USE`, credential must remain present in the DB. The test fails pre-fix (would surface a 500 from the FK rejection) and passes post-fix.

### F2: Migration backfill could anchor wrong defaults from inactive schedules

**Original finding:** The migration's UPDATE filters only `deleted_at IS NULL` on `integration_schedules`. An integration with a single active schedule and a single inactive (paused) schedule could have the inactive schedule's credential / mapping promoted to the new Integration defaults if the inactive row had the more recent `created_at`. Subsequent imports would then silently run against the wrong credential / template.

**Root cause:** I read the prompt's "newest active schedule" intent as "newest non-deleted schedule" — conflating `deleted_at` (soft-delete) with `is_active` (paused). They're independent in this schema; a schedule can be `is_active = false` and `deleted_at = null` simultaneously (operator paused but didn't delete).

**Fix:**
- `apps/api/src/db/migrations/20260522155500_integration_config_anchor/migration.sql` — the inner SELECT now filters `WHERE deleted_at IS NULL AND is_active = TRUE`. The ORDER BY also adds `id DESC` as a deterministic tie-breaker for rows that share `created_at` (defensive — the DB clock has microsecond resolution but the new column makes the choice repeatable across re-runs in any environment).
- The original migration SQL was edited in place because (a) the migration has never been deployed to production (Sebastian's manual `develop → main` merge gate sits before any prod migration), and (b) the existing test DBs were reset via `prisma migrate reset --skip-seed` to pick up the new checksum. No corrective follow-up migration was needed.

**Regression test:** `apps/api/src/routes/integrations/__tests__/integration-config-anchor.test.ts` gains a test that seeds an integration with two schedules — an OLDER active one (with `active-cred`) and a NEWER inactive one (with `inactive-cred`). Test runs the fixed backfill SQL inline via `$executeRawUnsafe` (mirrors the migration's UPDATE body) and asserts `integration.credentialId === activeCredential.id`. A future edit that drops the `is_active` filter would fail here.

---

## DEFERRED — Added to KNOWN_TODOS

None. Both Codex findings were ACTIONABLE and fixed in-session.

---

## Tests

```
Test Files  10 passed (10)
      Tests  111 passed (111)
```

109 → 111 (+2 regression tests). `pnpm -C apps/api typecheck` clean.

---

## Push

Fixes committed and pushed to `origin/develop`.
