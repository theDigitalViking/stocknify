# Codex Review: 2-F Final Polish

**Date:** 2026-05-06
**Reviewer:** OpenAI Codex (via `/codex:adversarial-review --base origin/main`)
**Cycle prompt:** `PROMPT_2-F_FINAL_POLISH.md`

---

## Findings Summary

| # | Finding | Severity | Classification | Action |
|---|---------|----------|---------------|--------|
| 1 | Chart fetch broadened in 2-F but still capped at 200 rows → selected series can be silently dropped on high-throughput tenants | high | ACTIONABLE | Fixed (pristine-entry narrow-fetch) |
| 2 | `storageLocationId` added to deep-links but ignored by the API filter contract → bin-scoped link doesn't narrow the table | medium | ACTIONABLE | Fixed (end-to-end filter wired) |

Both findings concern Cycle 2-F changes and both qualify as Correctness per DECISIONS 2026-04-16. Both fixed in this in-session review-fix pass.

---

## ACTIONABLE — Fixes Applied

### Finding 1: Chart query broadened but still hard-capped

**Original finding:** "The new chart request always omits `locationId`/`stockType` and fetches only the latest `CHART_PER_PAGE` rows for the whole variant/product scope. With many warehouses/bins/types, the selected line(s) from deep-link seed filters can be absent from that capped window even when matching movements exist in-range, producing false empty/misleading charts."

**Root cause:** Cycle 2-F dropped `locationId`/`stockType` from `chartFilters` so the multi-select dropdowns could populate from the full dataset (the cycle's design goal). But `CHART_PER_PAGE = 200` + `sortDir: 'desc'` was kept as-is. On a high-throughput tenant with many warehouses × bins × stock-types, the latest 200 rows in the variant/product scope can be dominated by a few high-velocity series — silently excluding the user's pre-selected series even though matching movements exist in the visible range. The pre-2-F behaviour avoided this for stock-list entries because the legacy URL trio (`?variantId&locationId&stockType`) narrowed the API call to that one series.

**Fix:** Hybrid fetch driven by a new `pristineEntry` flag in `apps/web/src/app/(dashboard)/stock/movements/page.tsx`:
- **Pristine entry** = page entered with at least one legacy single-value URL param AND the user hasn't touched any filter dropdown yet. While pristine, `chartFilters` includes `legacyLocationId` / `legacyStorageLocationId` / `legacyStockType` so the API narrows to the entry-point scope and the selected series is guaranteed to land within the 200-row cap.
- **Non-pristine** (no legacy params, or any filter touched) → broad fetch, identical to the 2-F design. Dropdowns populate from the full dataset; the existing `truncatedNotice` handles cap-bite.

The `pristineEntry` boolean flips to `false` inside all three filter `change` handlers (`handleLocationsChange`, `handleStorageLocationsChange`, `handleStockTypesChange`), so as soon as the operator broadens the selection, the chart fetch broadens with them. Deep-link reload while pristine still narrows because the seed comes from URL on every mount.

This is exactly Codex's "at least for legacy preselected scope" recommendation. The structural fix (server-side downsampling / multi-value filters) stays tracked in KNOWN_TODOS under the existing "stock_movements chart aggregation/downsampling" entry.

**Commit:** see `git log` for the review-fix commit on `develop`.

---

### Finding 2: `storageLocationId` deep-link contract incomplete

**Original finding:** "Stock rows now link to `/stock/movements` with `storageLocationId`, but the movements query filter type does not include `storageLocationId`, and table filters never pass it. Result: users can navigate from a specific bin row and still see mixed-bin table results, breaking expectation and making investigation workflows error-prone."

**Root cause:** Cycle 2-F added `?storageLocationId=…` to the stock-list Bewegungen link so the chart filter could pre-select the bin too — but skipped the rest of the contract. The backend `movementsQuerySchema` had no `storageLocationId`, the `StockMovementsFilters` TypeScript type didn't expose it, and `tableFilters` on the movements page didn't pass it through. Pre-2-F, the table consistently honored the location+type pair from the stock-list deep-link; 2-F broke the implicit "table reflects all single-value URL params from the entry-point row" invariant by adding a new param to the URL that nothing read.

**Fix:** End-to-end wire-up of the new dimension:
1. **Backend `apps/api/src/routes/stock/index.ts`** — added `storageLocationId: uuidSchema.optional()` to `movementsQuerySchema` and `if (storageLocationId) where.storageLocationId = storageLocationId` to the route's where-clause (mirrors the existing `locationId` line directly above).
2. **Backend test `apps/api/src/routes/stock/__tests__/movements.test.ts`** — new test "filters by storageLocationId" creates two bins + one bin-agnostic + two bin-scoped movements, asserts that `?storageLocationId=binA` returns exactly the bin-A row (excluding the bin-agnostic and bin-B). Pinned because the contract is now load-bearing for the bin-scoped deep-link UX.
3. **Frontend `apps/web/src/lib/api/use-stock-movements.ts`** — added `storageLocationId?: string` to `StockMovementsFilters` so callers can pass the new dimension through `apiFetchWithMeta` + `toQueryString`.
4. **Frontend `apps/web/src/app/(dashboard)/stock/movements/page.tsx`** — `tableFilters` now includes `storageLocationId: legacyStorageLocationId`, restoring the table's "reflects every entry-point URL param" contract for the new dimension.

Test count: backend movements suite goes 4 → 5 tests, all green.

**Commit:** see `git log` for the review-fix commit on `develop`.

---

## DEFERRED — Added to KNOWN_TODOS

None this round. Both findings were Correctness, both Actionable.

---

## No Findings

(N/A — see Findings Summary above.)
