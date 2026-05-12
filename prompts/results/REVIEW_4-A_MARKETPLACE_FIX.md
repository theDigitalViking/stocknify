# Codex Review: Cycle 4-A — Marketplace-Fix: Katalog vs. Instanzen, Multi-Install, SFTP-Separation

**Date:** 2026-05-12
**Reviewer:** OpenAI Codex (via `/codex:adversarial-review --base origin/main`)
**Cycle prompt:** `PROMPT_4-A_MARKETPLACE_FIX.md`
**Codex verdict:** needs-attention — 2× high, 1× medium

---

## Findings Summary

| # | Finding | Severity | Classification | Action |
|---|---------|----------|----------------|--------|
| F1 | Install path can duplicate locked templates under concurrent first installs | high | ACTIONABLE (Data Integrity) | Fixed in `6709223+` (`apps/api/src/routes/integrations/index.ts` + new partial unique index `csv_mapping_templates_locked_unique`) |
| F2 | Per-instance delete has a race that can leave active installs without required locked templates | high | ACTIONABLE (Data Integrity) | Fixed in same fix commit (DELETE handler now runs under `SERIALIZABLE` with bounded retry on `P2034`) |
| F3 | Deprecated key-scoped uninstall now performs bulk destructive delete across all instances | medium | ACTIONABLE (Correctness) | Fixed in same fix commit (endpoint returns `410 ENDPOINT_REMOVED`; the multi-install footgun is closed) |

All three findings are ACTIONABLE per DECISIONS 2026-04-16 (Security / Data Integrity / Correctness). None deferred.

---

## ACTIONABLE — Fixes Applied

### F1 — Install path can duplicate locked templates under concurrent first installs

**Original finding:** `existingLocked` was read outside the transaction, then the decision to create templates was made from that stale read. Two concurrent first installs of the same `(tenantId, marketplaceKey)` could both observe "no locked templates" and both create the catalog's fixed templates, duplicating the operator's locked-template list. The original partial unique index on `integrations` (one active install per key) was removed in this cycle, so nothing else stopped it.

**Root cause:** The "skip template creation when already present" logic was check-then-act outside a serializable boundary. The catalog entries shipped to Stocknify today (`shopify`, `woocommerce`, `xentral`, `hive`, `byrd`, `zenfulfillment`) carry no `fixedTemplates`, so the race had zero blast radius in practice — but the moment a future entry adds locked templates, the fix is load-bearing.

**Fix (two layers — handler + DB):**
1. **Application:** The install handler now runs the integration create + locked-template check/create inside one `request.db.$transaction(fn, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })`. Bounded retry on `P2034` (matches the credential-delete pattern in `apps/api/src/routes/credentials/index.ts:404-455`). On retry exhaustion the route returns `503 SERIALIZATION_FAILED`. `P2002` is also retried once as a belt-and-suspenders for a directly-observed unique-index conflict (e.g. if isolation is downgraded in a future refactor).
2. **Database:** New partial unique index `csv_mapping_templates_locked_unique` on `(tenant_id, marketplace_key, name) WHERE is_locked = true AND deleted_at IS NULL` lives in `apps/api/src/db/sql/unique-locked-mapping-templates.sql`. Registered in the manual-migration sweep (`apps/api/src/db/run-manual-migrations.ts`) immediately after the v6b drop. Idempotent (`CREATE UNIQUE INDEX IF NOT EXISTS`).

**Regression tests** (`apps/api/src/routes/integrations/__tests__/marketplace.test.ts`):
- Asserts a direct DB insert of a duplicate locked template `(tenant, marketplace_key, name)` rejects with `P2002`.
- Asserts two locked templates with the same key but different names DO succeed (the constraint is name-scoped, not key-scoped).
- Asserts a non-locked template with an identical name succeeds (the partial predicate filters out the index).

**Commit:** see `git log develop` for the review-fix commit on top of `6709223`.

### F2 — Per-instance delete has a race that can leave active installs without required locked templates

**Original finding:** Sibling counting happened outside the transaction that performed the delete and template teardown. A delete racing with a concurrent install could see `siblings === 0` (stale read), schedule template teardown, while the concurrent install skipped template creation because templates were still present at its read point. Final state: active integration row with no locked templates the worker expects.

**Root cause:** The previous handler did the `findFirst` → sibling count → `$transaction([update, updateMany])` as three separate Prisma calls without an isolation boundary covering the read-then-write.

**Fix:** The DELETE handler now puts the full read+write into one `Prisma.TransactionIsolationLevel.Serializable` transaction with bounded retry on `P2034`. The flow inside the transaction: `findFirst` the integration (404 if missing) → `update` with `deletedAt = now` → count siblings → conditionally `updateMany` to tear down locked templates. PostgreSQL's predicate locks under SERIALIZABLE detect a conflicting concurrent install (which both wrote to `integrations` AND read `csv_mapping_templates`) and abort one transaction with `P2034`. The retry loop covers the legitimate retry case; exhaustion surfaces as `503 SERIALIZATION_FAILED` so the caller can re-try with fresh state.

**Regression test** (`marketplace.test.ts`): a `Promise.all` race between `DELETE /v1/integrations/:id` (against an existing install) and a fresh `POST /v1/integrations/marketplace/shopify/install` for the same key. Asserts:
- The DELETE response is `204` or `503` (never 500).
- The install response is `201` or `503` (never 500).
- The DB end state matches the observed responses — the surviving rows are exactly the operations whose responses were 2xx.

**Note on test reliability:** This is a concurrency test, so the exact ordering and which operation (if any) lands a 503 depends on the planner. The assertion is shape-based ("end state consistent with response codes") rather than timing-based ("delete must win") to keep it deterministic. On the test environment used during development both operations consistently land 2xx, but the assertion accepts 503 to remain green if the planner ever decides the conflict differently.

**Commit:** same review-fix commit as F1.

### F3 — Deprecated key-scoped uninstall now performs bulk destructive delete across all instances

**Original finding:** `DELETE /integrations/marketplace/:key/uninstall` was kept for backwards compatibility, but in a multi-install world it soft-deletes EVERY active install of that key in a single call. Any legacy caller (a script, a stale frontend build) would now unexpectedly remove all instances — user-visible configuration loss that is hard to recover. KNOWN_TODOS already flagged the endpoint as "deprecated, no web caller", but leaving it on the wire is a footgun.

**Root cause:** The KNOWN_TODOS note acknowledged the issue but kept the bulk semantics live. Codex is correct that this is an unacceptable transition state for shipping multi-install.

**Fix:** Replaced the handler body with `reply.code(410).send({ error: { code: 'ENDPOINT_REMOVED', message: '…use DELETE /v1/integrations/:id…' } })`. No DB writes happen. The route is still registered (so a legacy caller gets a clear 410 with a migration message, not a routing 404 that hides the existence of the change).

**Regression test** (`marketplace.test.ts`): seeds an active Shopify install, calls the legacy endpoint, asserts `410` + `ENDPOINT_REMOVED` code + the original install row remains active (no DB side effect).

**Commit:** same review-fix commit as F1.

---

## DEFERRED — Added to KNOWN_TODOS

None this round — all three findings classified ACTIONABLE.

---

## Verification

- `pnpm -C apps/api typecheck` — clean.
- `pnpm -C apps/api build` — clean.
- `pnpm -C apps/api test` — 9 files, **88 tests passed** (was 83 after the cycle's first pass; +5 from review-fix regression tests).
- Manual migration sweep validated against the test DB (`pnpm test:setup`); new `unique-locked-mapping-templates.sql` lands cleanly after the v6b drop.

## Next steps

The review's "next steps" list is satisfied:
1. ✅ Concurrency tests added for delete/install races (`marketplace.test.ts` — F2 regression case).
2. ✅ DB constraint for locked-template uniqueness added (`csv_mapping_templates_locked_unique`); manual migration sweep updated.
3. ✅ Legacy key-scoped uninstall hard-failed before shipping multi-install (`410 ENDPOINT_REMOVED`).
