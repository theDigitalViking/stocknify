# Codex Review: Cycle 3-C — SFTP/FTP Connector + Import Pipeline

**Date:** 2026-05-08
**Reviewer:** OpenAI Codex (via `/codex:adversarial-review --base origin/main`)
**Cycle prompt:** `PROMPT_3-C_SFTP_CONNECTOR.md`
**Branch diff:** 32 files / +3894 / -59 against `origin/main` (Cycle 3-B Codex backlog + Cycle 3-C feature)

---

## Findings Summary

| # | Finding | Severity | Classification | Action |
|---|---------|----------|---------------|--------|
| 1 | Credential can be mixed with unrelated integration in import endpoints | high | ACTIONABLE | Fixed in this session |
| 2 | Import path runs with disabled integration / inactive credential | high | ACTIONABLE | Fixed in this session |
| 3 | Import failures returned as HTTP 200 (transport semantics) | medium | DEFERRED | Added to KNOWN_TODOS |

Verdict from Codex: `needs-attention`.

---

## ACTIONABLE — Fixes Applied

### Finding 1: Credential/integration binding not enforced

**Original finding (Codex):** `loadIntegrationAndCredential` validates the integration and credential independently by tenant, but never enforces that the credential belongs to the requested integration when `integration_credentials.integration_id` is set. This allows `POST /integrations/:id/import-now` and `GET /integrations/:id/files` to run network/file operations for integration A using credentials attached to integration B (same tenant). Wrong attribution on `import_runs.integration_id`, wrong source data into the wrong connector.

**Root cause:** The credential vault accepts both bound (`integrationId !== null`) and reusable (`integrationId === null`) credentials per DECISIONS 2026-05-07. The new SFTP import route's preamble loaded the credential by tenant + id only, without comparing `credential.integrationId` against the path's `:id`. A tenant operator could pass any credential id for any integration id and the route would proceed.

**Fix:** Added an explicit binding check in `apps/api/src/routes/integrations/sftp-import.ts` `loadIntegrationAndCredential`:
- If `credential.integrationId !== null` and `credential.integrationId !== integration.id` → 409 `CREDENTIAL_INTEGRATION_MISMATCH`.
- Reusable credentials (`integrationId === null`) explicitly remain accepted across integrations of the same tenant — that's the documented use case.

**Tests added:**
- `rejects with 409 CREDENTIAL_INTEGRATION_MISMATCH when the credential belongs to a different integration` — creates a second integration in the same tenant, attempts to use the first integration's bound credential, asserts 409 + connector never invoked + no `ImportRun` shell created.
- `reusable tenant-level credentials (integrationId=null) are accepted on any integration of the same tenant` — pins the reusability path so a future regression that over-tightens the gate would fail.

### Finding 2: Imports run against disabled integrations / inactive credentials

**Original finding (Codex):** The import preamble only checks `deletedAt` and required fields. It does not check `integration.isEnabled`, `integration.status`, or `credential.isActive`. Manual import can proceed even when an integration is disabled/paused or a credential is administratively deactivated — operators can believe a connector is off while imports still run and mutate stock.

**Root cause:** The route loaded the integration with `select: { id: true }` (`isEnabled` was never read) and the credential without checking `isActive`. The `isEnabled` toggle is the operator's "halt all syncs from this connector" lever; the cycle's preamble didn't respect it.

**Fix:** Two new gates in `loadIntegrationAndCredential`:
- `select` now includes `isEnabled`. If `integration.isEnabled === false` → 409 `INTEGRATION_DISABLED`.
- After the credential is loaded, if `credential.isActive === false` → 409 `CREDENTIAL_INACTIVE`.

The choice of 409 (over 423 Locked or 503) matches the existing `CREDENTIAL_IN_USE` 409 pattern on the credential vault — operational-state conflicts on this codebase are 409. Both gates fire before the `ImportRun` shell is created, so nothing about a blocked attempt lands in history.

I did not gate on `integration.status` (`pending` / `active` / `error` / `paused`). That field is the schema's sync-health indicator; gating imports on it would block fresh integrations (`pending` is the default) without operator intent. The two gates Codex called out (`isEnabled` + `isActive`) are the explicit operator-controlled levers.

**Tests added:**
- `rejects with 409 INTEGRATION_DISABLED when integration.isEnabled is false` — flips the flag, asserts both `import-now` and `files` return 409, no run row created.
- `rejects with 409 CREDENTIAL_INACTIVE when credential.isActive is false` — symmetric assertion for the credential gate.

**Verification:**
- `pnpm -C apps/api typecheck` green
- `pnpm -C apps/api test` — 42 tests across 6 files, all green (was 38)
- `pnpm -C apps/api lint` — 0 errors, 11 pre-existing import-order warnings in unrelated files

---

## DEFERRED — Added to KNOWN_TODOS

### Finding 3: Import failures returned as HTTP 200

**Original finding (Codex):** The route comment explicitly states it always returns 200 with a run record; both expected failure paths and the catch block use `reply.send` instead of non-2xx. Many callers, schedulers, and monitors key retry/alert behavior off HTTP status; this design makes hard failures look successful at transport level and increases missed retries / false-success telemetry.

**Reason deferred:** This is a deliberate transport-semantics design choice, not a defect. The route comment in `sftp-import.ts` says: *"The route always responds with the run record (200) — the operator checks `data.status` to learn whether the run succeeded."* Three reasons to keep it for now:

1. **No external automation hits this endpoint.** The Cycle 3-D worker (BullMQ) will be in-process — it calls into the same import core directly, not through HTTP. The Cycle 3-E UI consumes the `ImportRun` record and renders `data.status`; it doesn't have monitor/retry semantics. There's no external client today whose retry behavior the 200 misclassifies.
2. **Symmetric to existing CSV upload semantics.** The existing `POST /integrations/csv/import/stock` route returns 200 with `result.errors[]` in the body even when rows fail — failure is a body field, not an HTTP class. The new SFTP route mirrors that contract; flipping just one of them creates an inconsistency.
3. **Classified as ergonomics/MVP-irrelevant per DECISIONS 2026-04-16.** The findings policy gates fixes on Security / Data Integrity / Correctness. Codex's argument is about future automation patterns — hypothetical at MVP scale, with a simple migration path (just switch the failure paths to non-2xx and update the UI's fetch wrapper to read `data` from the rejected response) when the constraint becomes real.

**Tracked in `KNOWN_TODOS.md`** under the Backend section so a future cycle that wires external automation against the import endpoint flips the contract deliberately and updates all callers in the same change.

---

## Memory bank updates

- [x] `STATE.md` — Cycle 3-C bullet annotated with the review-fix note (binding + operational-state gates, 4 new tests)
- [x] `KNOWN_TODOS.md` — added the deferred 200-on-failure transport-semantics entry; the two ACTIONABLE fixes are not added since they're already in code
- [x] `prompts/results/REVIEW_3-C_SFTP_CONNECTOR.md` (this file) written
