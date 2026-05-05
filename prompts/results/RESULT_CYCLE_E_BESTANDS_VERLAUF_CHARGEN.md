# RESULT: Cycle E — Bestands-Verlauf + Chargen-Liste

**Prompt:** `prompts/PROMPT_CYCLE_E_BESTANDS_VERLAUF_CHARGEN.md`
**Notion:** https://www.notion.so/35724fe1d88a8151a53bf3bcc9ca9b13
**Branch:** develop
**Last commit:** `81a4ef1` feat(stock): Cycle E — Bestands-Verlauf + Chargen-Liste
**Date:** 2026-05-05

---

## Summary

`GET /stock/movements` was already a partial endpoint from earlier scaffolding; this cycle extended it with `productId` / `stockType` / `sortDir` filters and a denormalized response (variantSku, productName, location/bin names, batchNumber, quantity = quantityAfter). The new `/stock/movements` page renders a Recharts area chart over time plus a paginated movement-history table; the Activity icon on the stock list is enabled and pre-fills the filter trio. A `ProductBatchList` lands below the product-detail stock table for batch-tracked products. Closes the A–E batch.

## Files changed

- `apps/api/src/routes/stock/index.ts` — extended `movementsQuerySchema` (productId, stockType, sortDir; perPage cap 200, default 50); replaced raw response with denormalized payload using a Prisma `include` for variant→product, location, storageLocation, batch.
- `apps/api/src/routes/stock/__tests__/movements.test.ts` — new file. 4 tests: empty state, variantId + from/to filters, pagination (perPage=2 over 3 rows), cross-tenant RLS isolation.
- `apps/web/src/lib/api/client.ts` — added `apiFetchWithMeta<T>(path)` returning `{ data, meta }` so paginated callers can read `meta.total`.
- `apps/web/src/lib/api/use-stock-movements.ts` — new hook file. `useStockMovements(filters)` returns `UseQueryResult<ApiPage<StockMovementRow[]>>`.
- `apps/web/src/lib/api/use-stock.ts` — removed unused `useStockMovements` (zero callers) and the now-unused `StockMovement` import.
- `apps/web/src/components/stock/stock-movement-chart.tsx` — new. Recharts `AreaChart` over `quantityAfter` per movement; sorts asc internally regardless of API sortDir.
- `apps/web/src/components/stock/stock-movement-table.tsx` — new. DataTable with sortable date toggle, color-coded delta, paginated footer with previous/next controls.
- `apps/web/src/app/(dashboard)/stock/movements/page.tsx` — new. URL-driven filter state, two parallel `useStockMovements` queries (chart asc/wide, table paged/sorted), filter-completeness gate for the chart.
- `apps/web/src/app/(dashboard)/stock/page.tsx` — Activity icon now wraps a `<Link>` with `?variantId=…&locationId=…&stockType=…`.
- `apps/web/src/app/(dashboard)/products/[id]/page.tsx` — mounts `ProductBatchList` below the stock section when `product.batchTracking === true`.
- `apps/web/src/components/products/product-batch-list.tsx` — new. Reuses `useStock({ productId, variantId })`, filters to entries with `batchId !== null`, renders Charge / MHD / Lager / Menge / Bestandstyp.
- `apps/web/messages/en.json`, `apps/web/messages/de.json` — new top-level `stockMovements` block (title, chart, table, columns, pagination), new `products.batchList` block, new `products.detail.batchListTitle` key.

## Key decisions made during execution

- **Pre-flight finding:** the `GET /stock/movements` route already existed at `apps/api/src/routes/stock/index.ts:147` (predates this cycle) but was a partial implementation — no `productId`/`stockType`/`sortDir`, no denormalized fields. A frontend hook (`useStockMovements` in `use-stock.ts`) also existed but had zero callers. Treated as **partially done**: extended the existing endpoint instead of creating a new one, and rewrote the hook into a dedicated file (`use-stock-movements.ts`) that returns `{ data, meta }`. Removed the dead hook from `use-stock.ts`.
- **Bestands-Verlauf is a dedicated page, not a Sheet/Drawer.** Recorded in DECISIONS 2026-05-05 — the chart + table are too heavy for a Sheet, both want URL-shareable filter state, and the chart re-fetches independently of the table.
- **Chargen list reuses `useStock`; no separate batches endpoint.** Recorded in DECISIONS 2026-05-05 — the existing `GET /stock` already joins batch onto every level row with `batchId`, `batchNumber`, `expiryDate`. A dedicated `GET /products/:id/batches` endpoint would duplicate the join and split the source of truth without new information.
- **Pagination meta surfaced via a sibling helper.** Added `apiFetchWithMeta` rather than changing the shape of every existing `apiFetch` caller. Tracked in KNOWN_TODOS as a future consolidation if a third envelope shape is needed.
- **`perPage` cap raised to 200 (default 50).** Prompt R1 specified the limits; the prior endpoint inherited the shared `paginationSchema` (max 100, default 25). Replaced with a route-local schema rather than mutate the shared one.
- **Chart only mounts when `variantId` + `locationId` + `stockType` are all in the URL.** Per prompt R3 — without the trio the line is meaningless. Otherwise we render a "pick filters" empty state.
- **`ProductBatchList` is gated on `product.batchTracking`.** Non-batched products would render an empty section; the gate keeps the page tight. Adds no new product types or schema work.

## Skipped or deferred

- License-tier-based history cap (prompt non-goal) — tracked in KNOWN_TODOS under Backend (`stockMovementRetentionDays` not enforced on `GET /stock/movements`).
- Movement-data aggregation / downsampling — tracked in KNOWN_TODOS. At MVP scale the 200-row chart cap is fine; revisit when a real tenant trips it.
- Multi-line chart overlay (per prompt non-goal) — tracked in KNOWN_TODOS.
- CSV export of movements (per prompt non-goal) — not added; would be its own future cycle.
- Real-time websocket movement updates (per prompt non-goal) — not added.
- `Batch` metadata CRUD endpoint — tracked in KNOWN_TODOS. Not needed for the readout this cycle ships.

## Tests

- `pnpm -C apps/api test` — 4/4 files green, 12/12 tests passed (4 new movements tests + 4 restore + 2 upsert-stock-level + 2 smoke).
- `pnpm -C apps/api typecheck` — clean.
- `pnpm -C apps/web typecheck` — clean.
- `pnpm -C apps/web lint` — clean (0 errors, 0 warnings introduced; pre-existing import-order warnings unchanged).
- `pnpm -C apps/api lint` — 0 errors. 11 pre-existing import-order warnings unchanged; my edits did not add new warnings.
- `pnpm -C apps/web build` — green; `/stock/movements` route compiled (107 kB, 304 kB First Load JS — chart adds Recharts to the route bundle).

No UI was test-driven against a running browser. Frontend coverage stays out of scope per the testing strategy in DECISIONS 2026-05-02.

## Codex review

To be run via the review gate before push (review gate enabled via `/codex:setup --enable-review-gate` at session start). Findings will be classified per DECISIONS 2026-04-16 — Security/Correctness fix in another commit, MVP-irrelevant logged into KNOWN_TODOS.

## Memory Bank updates

- [x] `STATE.md` updated (Cycle E entry + critical-paths additions)
- [x] `KNOWN_TODOS.md` updated (license-tier cap, chart aggregation, batch metadata endpoint, apiFetchWithMeta consolidation; movements test pinning marked shipped)
- [x] `DECISIONS.md` updated (dedicated movements page; Chargen reuses `useStock`)
- [x] `NEXT.md` updated (active cycle cleared; batch A–E flagged complete)
- [x] Notion entry → ✅ Ausgeführt (will be flipped after the push step)
- [x] This result file written
