# RESULT: Cycle B — Bestände-Tabelle Polish + Re-Upload Behavior

**Prompt:** `prompts/PROMPT_CYCLE_B_BESTAENDE_POLISH.md`
**Notion:** https://www.notion.so/35624fe1d88a8187bed5d34a5d59133f
**Branch:** `develop`
**Last commit:** `fc5036a feat(stock): Cycle B — bestände polish + identical-qty movement write`
**Date:** 2026-05-04

---

## Summary

Identical-quantity CSV uploads now produce a `stock_movements` row with `delta=0` instead of being silently dropped — the level row's `last_synced_at` is bumped and a movement is appended on every call, so uploads are visible in history and the Cycle E movement chart will have a gapless trail. `upsertStockLevel` was lifted out of `routes/csv/index.ts` into `services/stock/`, gained an `'unchanged'` outcome that rolls into the existing `updated` counter at the call site, and is now pinned by the first backend test under the TH harness. On the frontend, the combined "Charge (MHD)" stock-list column is split into two, the three-dot dropdown is replaced by a disabled `Activity` icon (placeholder for the Cycle E movement view), `ManualAdjustDialog` is gone, and the Quick-View stock table gained a `Bestandswert` placeholder column.

## Files changed

**Backend**
- `apps/api/src/services/stock/upsert-stock-level.ts` — NEW. Extracted `upsertStockLevel` here; new return type `'created' | 'updated' | 'unchanged'`; identical-quantity calls now bump `last_synced_at` + write a delta=0 movement.
- `apps/api/src/services/stock/__tests__/upsert-stock-level.test.ts` — NEW. Two cases: identical quantity → 2 movement rows; non-zero delta → outcome `'updated'`. First test under the TH harness.
- `apps/api/src/lib/db-errors.ts` — NEW. `isUniqueViolation` lifted from `routes/csv/index.ts` so both csv and stock paths can share it.
- `apps/api/src/routes/csv/index.ts` — Removed inline `upsertStockLevel` + `isUniqueViolation` (now imports them); call site rolls `'unchanged'` into `result.updated` so the public response shape stays `{created, updated, skipped, errors}`. `skipped` now reserved for the dry-run-missing-location case.

**Frontend**
- `apps/web/src/app/(dashboard)/stock/page.tsx` — Split combined "Charge (MHD)" column into separate `Charge` + `MHD` columns; three-dot `MoreHorizontal` dropdown replaced with a disabled `Activity` icon button next to the Quick-View `Eye` button; `ManualAdjustDialog` import + state + JSX removed; `aggregatedByKey` memo (only used by the removed dialog) removed.
- `apps/web/src/components/products/product-stock-table.tsx` — New `Bestandswert` / `Stock value` column rendering `—` (no cost field exists on the schema yet).
- `apps/web/src/components/stock/manual-adjust-dialog.tsx` — DELETED.
- `apps/web/src/lib/api/use-stock.ts` — Removed `useUpsertStock` hook + `UpsertStockInput` interface (only ManualAdjustDialog used them).
- `apps/web/messages/de.json`, `apps/web/messages/en.json` — Removed `stock.adjust` block + `stock.manualAdjust` key; added `stock.columns.expiryDate` (`MHD` / `Best-before`) + `products.detail.stockValue` (`Bestandswert` / `Stock value`).

**Memory bank**
- `prompts/_state/STATE.md` — Cycle B summary added under "What's deployed and working"; critical paths table updated (new service + lib + test files; product-stock-table description tightened; deduped earlier entry).
- `prompts/_state/DECISIONS.md` — New entry: 2026-05-04 — `upsertStockLevel` always writes a `stock_movements` row.
- `prompts/_state/KNOWN_TODOS.md` — Added: `PUT /stock` UI-orphaned (frontend gone, backend deferred per prompt); `stock_movements` row growth on identical-qty uploads (retention, not skip, is the right future fix); Bestandswert column has no cost data yet. Marked Cycle B test-coverage line as ✅ shipped.
- `prompts/_state/NEXT.md` — Cycle B moved to "abgeschlossen"; active section now says "next chat opens Cycle C."

## Key decisions made during execution

- **Extracted `upsertStockLevel` rather than testing through the multipart endpoint.** The prompt's "Files involved" section already pointed at `apps/api/src/services/stock/upsert-stock-level.ts` as the expected home, the `services/stock/` directory existed but was empty, and `POST /integrations/csv/import/stock` is multipart with mapping-template machinery — testing through it would have required significantly more fixture setup than the actual subject of the test. The extraction is also the cleaner long-term home regardless of testability.
- **Outcome type became `'created' | 'updated' | 'unchanged'` rather than just `'created' | 'updated'`.** The prompt explicitly asked to "preserve caller contracts". The CSV call site's `result` counter is `{created, updated, skipped, errors}` and is part of the public `POST /integrations/csv/import/stock` response — flattening `'unchanged'` into the function-level outcome would lose the semantic at the test boundary and make future callers (Cycle E may want it) less expressive. The call site collapses `'unchanged'` into `result.updated` so the public response shape is unchanged; the internal outcome stays expressive.
- **`isUniqueViolation` moved to `lib/db-errors.ts` rather than imported back from `routes/csv/index.ts`.** The original location is a route module; importing service code from a route is a back-reference that would invert the dependency graph. Moved to `lib/` as a dependency-free predicate both routes and services can share.
- **`useUpsertStock` hook + `UpsertStockInput` deleted along with the dialog.** They were the only callers; per the system instruction "if you are certain that something is unused, you can delete it completely". The backend `PUT /stock` endpoint is intentionally untouched (prompt explicitly scoped backend deprecation out) and is now tracked in KNOWN_TODOS as UI-orphaned.
- **The Activity-icon button next to the Eye is `disabled`.** The actual movements view is Cycle E. A non-disabled button leading nowhere would be a dead link; a tooltip-only `disabled` button telegraphs the upcoming feature without breaking on click.
- **Bestandswert column shows `—`, not a calculated value.** Schema has no `cost`/`unitCost`/`avgPrice` field on `stock_levels`/`product_variants`. Adding one would force a valuation-method decision (last cost / weighted average / FIFO) that's well out of cycle scope. KNOWN_TODOS now tracks the dependency.

## Skipped or deferred

- **Codex adversarial review skipped — plugin timeout / hang.** Per Sebastian's redirect mid-cycle, the `/codex:rescue --review` invocation was skipped after the plugin hung. Per WORKFLOW.md §5 this normally gates the push; with the operator override the push proceeds without it. The behaviour change is documented in DECISIONS 2026-05-04 so the next Codex round (Cycle C or a retroactive review) won't classify it as a regression.
- **Backend `PUT /stock` manual-adjust endpoint** — kept, per prompt scope. Frontend surface is gone but the route still exists in `apps/api/src/routes/stock/index.ts`. Tracked in KNOWN_TODOS for a future deprecation cycle.
- **Bestandswert real value** — placeholder only. Needs a cost field + valuation method decision. Tracked in KNOWN_TODOS.
- **`upsertStockLevel` rollback / unique-violation-retry tests** — current tests cover the happy paths only. Tracked in KNOWN_TODOS under "Pending test coverage".

## Tests

```
$ pnpm -C apps/api test
✓ src/services/stock/__tests__/upsert-stock-level.test.ts (2 tests)
✓ src/test/smoke.test.ts (2 tests)
Test Files  2 passed (2)
     Tests  4 passed (4)
```

`pnpm -C apps/api typecheck`, `pnpm -C apps/web typecheck`, and `pnpm -C apps/web lint` all clean. `pnpm -C apps/api lint` shows 11 pre-existing import-order warnings (none in files this cycle introduced or modified — the new service file's import-order warning was fixed before commit).

## Codex review

Not run for this cycle — plugin hang during invocation, operator authorized skipping. Push proceeds without the review gate (see "Skipped or deferred" above). The behaviour-change rationale is documented in DECISIONS 2026-05-04 so a retroactive or next-cycle Codex round can classify identical-quantity-writes findings as a documented decision rather than a regression.

## Memory Bank updates

- [x] `STATE.md` updated
- [x] `KNOWN_TODOS.md` updated
- [x] `DECISIONS.md` updated
- [x] `NEXT.md` updated (Cycle B → done; Cycle C is the next active)
- [x] Notion entry → ✅ Ausgeführt (pending — see push step)
- [x] This result file written
