# RESULT: Cycle 4-B — Movements-Filter: Alle Optionen anzeigen, Vorauswahl korrekt setzen

**Prompt:** `prompts/PROMPT_4-B_MOVEMENTS_FILTER_FIX.md`
**Notion:** https://www.notion.so/35e24fe1d88a81a59c83fce1c1724c10
**Branch:** develop
**Last commit:** (this cycle — see git log)
**Date:** 2026-05-12

---

## Summary

Decoupled the movement-page filter dropdowns from the chart fetch so deep-linked operators see the full universe of locations/bins/stock-types instead of just the one combo their URL pre-selected. Also removed the `size === options.length → 'all'` auto-collapse in `SingleFilter` so a Set with a single concrete value never silently rewrites itself back to the `'all'` sentinel.

## Files changed

- `apps/web/src/app/(dashboard)/stock/movements/page.tsx` — added a second `useStockMovements` call (`optionsFilters`) scoped only to product/variant + range (no locationId/storageLocationId/stockType narrowing); switched `locationOptions` / `allStorageOptions` / `stockTypeOptions` to derive from `optionsRows` instead of `chartRows`; new `OPTIONS_PER_PAGE = 200` constant (matches backend cap; see deviation below).
- `apps/web/src/components/stock/movement-filters.tsx` — removed the `if (current.size === options.length) onChange('all')` collapse in `handleToggle` with an inline comment pointing at this cycle. "Select all" button still sets `'all'` explicitly when the operator actually wants it.

## Key decisions made during execution

- **Chose Option A over Option B.** The prompt offered two paths: (A) a second movements API call without per-row narrowing, vs (B) reusing `useLocations` / `useStorageLocations` / `useStockTypes` (which all exist). Both would fix the bug. Option A keeps the option universe *scoped to the current product/variant + date range* — a tenant with 50 warehouses but movements for product X at only 3 of them sees those 3, not all 50. Option B would have shown all 50, including warehouses with no movements for this product, where selecting any of them would simply filter to an empty series. Option A matches the prompt's stated preference and produces less confusing dropdowns; the extra API call shares cache with the chart fetch when the chart is also broad (post-filter-touch) and only adds one network call when pristine. Worth the trade.
- **`OPTIONS_PER_PAGE = 200`, not 500.** The prompt's example used `perPage: 500`, but `apps/api/src/routes/stock/index.ts` movementsQuerySchema caps `perPage` at 200 (line 39). Asking for 500 would 400. 200 is the largest the backend currently allows; same cap the chart already uses. Operator-visible consequence: for high-throughput tenants whose latest 200 rows in range don't include every location/bin/stock-type the product has been at, options will still be incomplete — same caveat that already affects the chart (KNOWN_TODOS "Movements page: filter dropdowns reflect only the latest 200 rows of chart data"). The Cycle 4-B fix narrows the bug to its structural minimum; lifting the cap is a backend cycle.
- **Did NOT add a `preventCollapseToAll` prop.** The prompt offered that as a safer-edit alternative to outright removal of the auto-collapse, then explicitly stated "Decision for the agent: Remove the … collapse." Removal it is — the `selectAll` button covers the legitimate use case (user explicitly wants 'all') without the URL/state ping-pong that the auto-collapse triggered.

## Skipped or deferred

- **200-row cap on options derivation** — same root cause as the existing "Movements page: filter dropdowns reflect only the latest 200 rows of chart data" KNOWN_TODOS entry (Cycle 2-E Codex finding, medium, deferred). The Cycle 4-B fix reaches the structural floor of what the current API allows. Fully resolving requires either server-side downsampling or a dedicated `GET /stock/movement-dimensions?productId=…&from=&to=` endpoint returning DISTINCT triples without row-level data. Out of scope here; the KNOWN_TODOS entry already covers the residual gap.
- **Cascade with newly-visible bins from broader options data** — the cascade helper (`pruneStorageForLocations`) still operates on `allStorageOptions` (now derived from `optionsRows` instead of `chartRows`). No code change needed; the cascade automatically respects the wider option universe. Verified by inspection.

## Tests

No automated tests changed. `pnpm -C apps/web typecheck` green. `pnpm -C apps/web build` green (`/stock/movements` first-load JS stays at 111 kB — unchanged).

## Codex review

Not run for this cycle (`review:skip` — frontend-only, no security or data-integrity surface; cosmetic + UX correctness).

## Memory Bank updates

- [x] `STATE.md` updated
- [x] `KNOWN_TODOS.md` updated (existing 200-row-cap entry extended to mention the Cycle 4-B fix narrowed but did not eliminate the structural gap)
- [x] Notion entry → ✅ Ausgeführt (queued for Sebastian / Claude (Chat) — no Notion MCP in this Claude Code session)
- [x] This result file written
