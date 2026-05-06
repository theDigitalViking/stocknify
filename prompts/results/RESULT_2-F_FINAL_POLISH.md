# RESULT: 2-F Final Polish

**Prompt:** `prompts/PROMPT_2-F_FINAL_POLISH.md`
**Notion:** https://www.notion.so/35724fe1d88a81ef8b63c4fe2ba5d07f
**Branch:** develop
**Last commit:** (this cycle's feat commit + memory-bank commit, see `git log`)
**Date:** 2026-05-06

---

## Summary

Closing-cycle frontend polish for Batch 2: a third **Lagerplatz** filter on `/stock/movements` with cascading from Lager; the single-line/multi-line chart-mode distinction is gone (always multi-line, entry point controls pre-selection); the variant-row highlight now applies even on single-variant products; the X-axis tick formatter switched from window-spread heuristics to a same-day-duplicates check (always shows date, only adds time when same-day entries exist); the `HorizontalScrollFade` got wider/stronger and a `ChevronRight` cue; dashboard pages got `md:px-8` content padding. No backend touch.

## Files changed

- `apps/web/src/components/stock/movement-filters.tsx` — `MovementFilters` now takes three filters (locations + storage + types), six setters, three `<SingleFilter>` triggers in one row.
- `apps/web/src/app/(dashboard)/stock/movements/page.tsx` — full rewrite: `hasSingleLineFilters`/`isProductMode` distinction removed, replaced by `hasScope = Boolean(variantId || productId)`. Chart filter API now drops every per-row filter (warehouse/bin/type) so dropdowns can populate from the full dataset. Series key extended to `locationId|storageLocationId|stockType`; bin-agnostic rows use a `-` sentinel. New `selectedStorageLocations` state, third URL param `?storageLocations=`, legacy `?storageLocationId=` mount-time fallback. Cascade (`pruneStorageForLocations`) runs inside `handleLocationsChange` to avoid effect-loop with URL sync. New `seriesLabelWithBin` ICU template renders `Lager · Lagerplatz · Bestandstyp` when bin present.
- `apps/web/src/app/(dashboard)/stock/page.tsx` — Bewegungen link extended to forward `storageLocationId` (when the row carries one) so the cascading bin filter pre-selects too.
- `apps/web/src/app/(dashboard)/products/[id]/page.tsx` — variant row highlight now driven by `isSelected` alone; clickability still gated on `variants.length > 1`. Single-variant products see the brand-100 background + inset teal rail on the lone row.
- `apps/web/src/components/stock/stock-movement-chart.tsx` — same-day-duplicate detector replaces the window-spread tick heuristic. Always shows DD.MM. on the axis; appends HH:mm only when at least two points share a calendar day. `minTickGap` swings 32 → 64 in the longer-label case to keep ticks from overlapping. `selectedRangeMs` prop kept for backwards-compat but no longer consulted.
- `apps/web/src/components/shared/horizontal-scroll-fade.tsx` — gradient `w-8` → `w-14`, `via-background/80` → `via-background/95`, added a `ChevronRight` icon centered in the fade with `pr-2`. Same `pointer-events-none` opacity-fade as before.
- `apps/web/src/components/shared/page-header.tsx` — `px-6` → `px-6 md:px-8`.
- `apps/web/src/app/(dashboard)/{products,products/[id],products/import,settings,stock,stock/import,stock/movements,integrations/marketplace,integrations/automatic}/page.tsx` — every page-level wrapper, sticky breadcrumb bar, toolbar, and section block bumped `px-6` → `px-6 md:px-8`. Inner card placeholders (rounded-md border with `px-6` inside the empty-state graphic) intentionally left alone — those are content-box paddings, not page edges. `<DataTable>` callers on `/products` and `/stock` now wrap the table in `<div className="px-6 md:px-8 py-2">` so cells align with the toolbar above.
- `apps/web/messages/en.json` + `apps/web/messages/de.json` — added `stockMovements.filters.storageLocationLabel` (en: "Storage location", de: "Lagerplatz"). Dropped `chart.filtersRequired.{title,description}` (single-line mode is gone). Replaced with `chart.missingScope.{title,description}` (only shown when neither productId nor variantId is in the URL). Removed `chart.multiLine.title` + `chart.multiLine.description` (no longer rendered — the multi-line is now the only mode and the section heading already names it). Added `chart.multiLine.seriesLabelWithBin` ICU template. Tweaked `chart.empty.description` ("for this combination" → "."), `chart.multiLine.legendToggleHint` (now mentions filters explicitly).

## Key decisions made during execution

- **Cascade lives in the change handler, not an effect.** `pruneStorageForLocations` is called synchronously inside `handleLocationsChange`, batched with the locations setState and writeFiltersToUrl. Doing it in a `useEffect` watching `selectedLocations` would race with the URL-sync effect already running on `[search]` and risk flicker / unintended URL writes during back/forward navigation. Same pattern as Cycle 2-E's `selectionsEqual` short-circuits — keep effect-driven writes idempotent and let event handlers carry the cascading semantics.
- **Bin-agnostic series treated like the stock-page filter.** When `selectedStorageLocations` is `'all'`, bin-agnostic series pass through. When it's a Set (even empty), bin-agnostic series are hidden — they have no bin id to satisfy the explicit constraint. Mirrors the stock page's `matchesStorageLocation` logic and avoids surprising the operator who picks "Bin A" expecting only Bin A movements but seeing ungrouped rows mixed in.
- **`selectedRangeMs` prop on `StockMovementChart` deprecated, not removed.** The new same-day-duplicate detector makes the prop unused, but keeping it in the discriminated union avoids a downstream-caller break (and lets a future cycle delete it cleanly with the rest of the obsolete window-spread code paths). One-line "Will be removed in a future cleanup" comment in the prop type docs the deprecation.
- **DataTable wrapping div added on `/products` and `/stock`.** With the page wrappers bumped to `md:px-8`, the bare `<DataTable>` would have left first-column cells at `px-4 cell padding = 16px` from the page edge while the toolbar above sat at `px-8 = 32px`. Wrapping the table in `<div className="px-6 md:px-8 py-2">` aligns them. Prior behavior already had a 16px misalignment between toolbar and table cells; this is the moment to fix it because the new desktop padding makes it visible. Mobile (px-6) still has the 16-vs-24 offset but the gap is smaller and the toolbar input is smaller too.
- **Stock-list link includes `storageLocationId` only when present.** The row has `storageLocationId: string | null`; a row without a bin would otherwise emit `?storageLocationId=null` in the URL which the parser wouldn't reject but the cascade would store as a synthetic Set-of-1 with the literal string `"null"`. Conditional spread keeps the URL clean.
- **Variant row gets `aria-selected` even on single-variant products.** The accessibility attribute now leaks the highlight state to AT users regardless of clickability. `tabIndex` and `role="button"` remain gated on `isClickable` so a single-variant table doesn't add a focus stop the user can't act on.
- **i18n key cleanup is part of this cycle.** `chart.filtersRequired` and `chart.multiLine.{title,description}` are removed in en + de. They were only referenced from the movements page; no other consumer. Removing the dead keys avoids drift between code and translation files.

## Skipped or deferred

- **Table is unaffected by the new filters** (Cycle 2-E non-goal preserved). Selecting bins/warehouses/types in the chart filters does not narrow the table below; the table still consumes the URL trio (variantId / locationId / stockType) directly. The known mismatch entry in KNOWN_TODOS Frontend ("chart filter and table can disagree in multi-line mode") still applies — the storage-location filter joins it as a third dimension that can drift. No structural change.
- **Storage-location filter options derived from chart sample (200 rows max).** Same caveat as the existing Cycle 2-E `[medium]` Codex finding — when total movements exceed CHART_PER_PAGE, locations/bins/types that only appear in older history are silently absent from the dropdowns. KNOWN_TODOS already tracks this under the existing "filter dropdowns reflect only the latest 200 rows of chart data" entry; the new bin dimension is subject to the same limit and the same structural fix (server-side downsampling).
- **`selectedRangeMs` prop deprecation.** Prop kept on the chart's discriminated-union type but no longer read. Future cleanup once the cycle that drops it is convenient.
- **Mobile content padding** stays at `px-6` (current default). The prompt's example was "px-4 mobile / px-8 desktop" but reducing mobile would also push the existing mobile-tablet experience tighter against the sidebar drawer. Held back; if mobile feels too padded after this cycle's review, easy follow-up.

## Tests

- `pnpm -C apps/web typecheck` — green, no errors.
- `pnpm -C apps/web build` — green; 19 routes, all dynamic. Bundle deltas vs Cycle 2-E:
  - `/stock/movements` Size 111 kB → 111 kB (unchanged); First Load 336 kB.
  - `/products` 9.83 kB.
  - `/products/[id]` 5.28 → 5.33 kB (variant row highlight rewiring).
  - `/stock` 8.98 kB.
  - All other routes within ±0 kB.
- No backend tests run (frontend-only cycle, per testing strategy).

## Codex review

`review:recommended` per prompt header. Will be triggered by Sebastian after the push via `/codex:adversarial-review --base origin/main`. Findings disposition will go in `prompts/results/REVIEW_2-F_FINAL_POLISH.md` per the post-push flow in WORKFLOW.md § Step 6.

## Memory Bank updates

- [x] `STATE.md` updated
- [x] `KNOWN_TODOS.md` updated (storage-filter caveat folded into existing entry; chart/table disagreement entry extended)
- [x] `NEXT.md` updated (Batch 2 complete, awaiting Sebastian merge to main)
- [x] Notion entry → ✅ Ausgeführt (deferred to Notion MCP after this commit)
- [x] This result file written
