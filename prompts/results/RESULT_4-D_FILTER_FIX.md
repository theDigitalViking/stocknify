# RESULT: Cycle 4-D — Movements-Filter: URL-Sync-Race + Tenant-weite Optionen

**Prompt:** `prompts/PROMPT_4-D_FILTER_FIX.md`
**Notion:** https://www.notion.so/35e24fe1d88a81269097c9a084617df0
**Branch:** develop
**Last commit:** (set on commit — Cycle 4-D feature commit)
**Date:** 2026-05-12

---

## Summary

Third pass at the movements-page filter dropdowns, fixing two root causes that 3-A and 4-B missed. (1) The URL-sync effect overwrote legacy-param-seeded state with `'all'` because it read absent `locations` / `storageLocations` / `stockTypes` URL params with a `null` fallback. (2) Filter options were sourced from movement data, so dropdowns shrank to the dimensions present in the current product's movements. Both are resolved: a mount-only migration effect now rewrites legacy single-value params (`locationId` / `storageLocationId` / `stockType`) into multi-select form before the URL-sync effect fires, and the three option lists come from tenant-wide hooks (`useLocations`, `useStorageLocations`, `useStockTypes`).

## Files changed

- `apps/web/src/app/(dashboard)/stock/movements/page.tsx` — both fixes plus removal of the Cycle 4-B `optionsFilters` + `useStockMovements(optionsFilters)` + `optionsRows` plumbing and the `OPTIONS_PER_PAGE` constant. Added imports for `useLocations`/`useStorageLocations` and `useStockTypes`. Inserted a mount-only `useEffect` directly above the existing multi-select URL-sync effect so they fire in declaration order within the same commit, making the URL the single source of truth from tick zero.

## Key decisions made during execution

- **Stock-type label uses `st.key`, not `st.label`.** `StockTypeDefinition` carries a separate human-readable `label` field, but the deep-link compares against `st.key` (e.g. `stockType=reserved`) and the prior implementation labelled options by their key (`{ value: v, label: v }`). Following the prompt verbatim (`label: st.key`) keeps URL params, chart series keys, and dropdown labels in lock-step. If localised labels are wanted later, `st.label` is the next step — but that's a separate decision (does `'reserved'` get translated? what about tenant-defined types?).
- **Storage-option cascade kept unchanged.** The `pruneStorageForLocations` helper, `filteredStorageOptions` derivation, and the `parentLocationId`-by-bin metadata all work the same way they did with movement-derived options — `useStorageLocations()` returns `locationId` on each row, so the cascade still has the data it needs.
- **`hasScope` removed from option `useMemo` deps.** The tenant-wide hooks fire regardless of whether the page has a scope (variantId or productId). The empty-state UI is still gated by `hasScope` at the `MovementFilters` render site, so unscoped pages don't show dropdowns — but precomputing the options is cheap and removes a `hasScope` short-circuit that was only there to avoid touching `optionsRows` while it was empty.

## Skipped or deferred

- **Localised stock-type labels.** See the decision note above. Not in this cycle's scope.
- **"Hide dimensions with no movements" toggle.** The trade-off here is that operators see every tenant-wide dimension in the dropdowns, even ones with no movements for the current product. At MVP this is the desired behaviour ("I want to broaden the chart to Lager B before any movements exist for this product in B"). If a future operator reports the noise, the right fix is a dedicated `GET /stock/movement-dimensions` endpoint returning DISTINCT triples — tracked in KNOWN_TODOS.

## Tests

- `pnpm -C apps/web typecheck` → green (no output, exit 0).
- `pnpm -C apps/web build` → green. `/stock/movements` first-load JS went from 111 kB to 108 kB (one less `useStockMovements` call on the page; the tenant-wide hooks were already in the bundle via the stock page).
- No automated frontend tests touched — the movements page has no test coverage today (cross-cutting frontend-test-infra gap, tracked in KNOWN_TODOS).

## Codex review

Not run for this cycle. Review classification: `review:skip` (purely frontend state-machine + UX fix; no schema, no backend, no API contract change).

## Memory Bank updates

- [x] `STATE.md` updated
- [x] `KNOWN_TODOS.md` updated (removed the 4-B "broad-fetch capped at 200 rows" entry; replaced with a 4-D entry describing the tenant-wide-options trade-off)
- [ ] Notion entry → ✅ Ausgeführt (no Notion MCP in this Claude Code session — queued for Claude (Chat) or Sebastian)
- [x] This result file written
