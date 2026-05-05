# RESULT: 2-E Movements Filters & Legend

**Prompt:** `prompts/PROMPT_2-E_MOVEMENTS_FILTERS_LEGEND.md`
**Notion:** https://www.notion.so/35724fe1d88a81e291c6c5d152a871b2
**Branch:** develop
**Last commit:** (filled in by commit step)
**Date:** 2026-05-06

---

## Summary

Added Lager + Bestandstyp multi-select filter dropdowns above the movements chart in multi-line (productId-based) mode and reworked the legend so clicking a series fades it (~20% opacity) instead of hiding it. Filter selections persist in the URL via `?locations=`/`?stockTypes=` so the view is shareable; legacy `locationId`/`stockType` URL params seed the dropdown state at first render so links from the stock list pre-select the matching location/type.

## Files changed

- `apps/web/src/app/(dashboard)/stock/movements/page.tsx` — filter state (seeded from URL with legacy fallback at mount), URL writeback via `router.replace`, drops `locationId`/`stockType` from `chartFilters` in multi-line mode so the dropdowns can be populated from the full product dataset, derives distinct location/stockType options, applies client-side series filtering, renders `<MovementFilters>` and the no-filter-selected empty state.
- `apps/web/src/components/stock/movement-filters.tsx` — NEW. Two `DropdownMenu` + `DropdownMenuCheckboxItem` multi-selects (existing shadcn primitive — no new deps). `'all'` sentinel distinct from "every option in the set" so URL writeback can strip the param entirely when nothing is filtered. Trigger renders `Label: All` or `Label: N selected`; each menu has Select-all/Clear-all footer buttons. Exports `selectionsEqual` helper for the URL-sync effect.
- `apps/web/src/components/stock/stock-movement-chart.tsx` — replaced `hidden: Set<string>` with `faded: Set<string>`; legend click now toggles fade rather than removing the line. Faded `<Area>` keeps `stroke` + `dot` rendered with `strokeOpacity={0.2}` and reduced fill opacity. Custom `<Tooltip content>` replaces the default formatter so faded series can be muted (gray text + 0.45 opacity row) — single-line tooltip preserved through the same content function (single seriesMeta entry → one row, same look).
- `apps/web/messages/en.json` + `apps/web/messages/de.json` — new `stockMovements.filters.*` block (`locationLabel`, `stockTypeLabel`, `all`, `selectedCount`, `selectAll`, `clearAll`, `noOptions`); new `stockMovements.chart.noFilterSelected.{title,description}`; updated `stockMovements.chart.multiLine.legendToggleHint` to reflect the new fade-vs-remove split.

## Key decisions made during execution

- **Used existing `DropdownMenu` + `DropdownMenuCheckboxItem` instead of installing shadcn's `Popover` + `Command`.** The codebase already has `DropdownMenu` (Radix-backed) with built-in checkbox items; adding Popover + Command would mean two new deps (`@radix-ui/react-popover`, `cmdk`) and ~+5 kB for behaviour the existing primitive already covers. Trigger uses `<Button variant="outline" size="sm">` so it visually matches the preset buttons sitting above it. `onSelect={(e) => e.preventDefault()}` keeps the menu open after each tick, which is the standard multi-select interaction Radix doesn't give for free.
- **Chart fetch in multi-line mode now drops `locationId` and `stockType` from `chartFilters` even when those URL params are present.** Otherwise the API would pre-narrow the data to a single location/stockType and the user couldn't add others via the dropdown. Single-line mode (full trio in URL) keeps the old behaviour. Trade-off: the chart fetches more data than strictly necessary on a `productId+locationId` deep link, but stays inside the existing 200-row cap for typical product sizes.
- **Table behaviour deliberately unchanged** per non-goal "table always shows all movements matching the URL params". This means a multi-line entry from `?productId=X&locationId=Y` shows the table narrowed to Y while the user can broaden the chart filter to other locations — the chart and table can briefly disagree. We accept this MVP friction; resolving it would require either making the table consume `locations`/`stockTypes` (out of scope) or stripping `locationId` from the URL on first interaction (would break shared deep-links and the table).
- **`'all'` sentinel for `FilterSelection`** instead of "set containing every option". Lets the URL stay clean when nothing is filtered (param absent) and avoids a re-equality dance every time options arrive from the API. `selectionsEqual` handles the comparison cleanly in the URL-sync effect.
- **`?locations=`/`?stockTypes=` URL writeback uses `router.replace`** (no history pollution), matching the date-range pattern from Cycle 2-B.
- **Legacy `locationId`/`stockType` URL params seed selection only on first render.** Subsequent URL changes (browser back/forward, deep nav) read only the explicit `locations`/`stockTypes` params; legacy fallback is suppressed via the `useEffect` deps so re-syncs don't accidentally re-seed back to the legacy single value when the user has cleared the multi-select.
- **Custom `<Tooltip content>` replaces the default in BOTH single-line and multi-line modes.** Single-line still renders one row (the `quantity` series) — the visual is essentially identical to before. Doing it conditionally would have meant duplicating tooltip configuration; one path keeps the chart simpler.
- **Filter dropdowns hidden when `!isProductMode`** (single-line trio) — the chart already shows exactly one series, no filtering surface to expose.

## Skipped or deferred

- **No `noOptions` tooltip / inline hint when the data hasn't loaded yet** — the dropdown shows "No options available" inside the menu when opened on an empty dataset. Acceptable for the loading window; the menu re-renders with options as soon as `chartData` arrives.
- **No "shared filter+table" mode** — see decision above. Tracked as a known limitation; promote to a TODO if Sebastian flags it.
- **No URL→preset rehydration follow-up** — already tracked under KNOWN_TODOS Frontend (Cycle 2-B fallout) and untouched here.
- **The chart still fetches up to 200 rows in multi-line mode (CHART_PER_PAGE).** With many (location × stockType) combinations this may exceed the cap and trigger the existing truncated-notice. Server-side downsampling stays the structural fix (KNOWN_TODOS Backend, Cycle 2-B follow-up).

## Tests

- `pnpm -C apps/web typecheck` — green, no errors.
- `pnpm -C apps/web build` — green. `/stock/movements` first-load JS 110 → 111 kB (movement-filters component + chart-tooltip rewrite).
- No backend tests added (frontend-only cycle, per `review:recommended` classification + Test-Harness rule "every Backend cycle gets a test"; this cycle has zero backend touch).

## Codex review

Pending — Sebastian to run `/codex:adversarial-review --base origin/main` after the push lands. Findings will be parsed in this same session and documented in `prompts/results/REVIEW_2-E_MOVEMENTS_FILTERS_LEGEND.md`.

## Memory Bank updates

- [x] `STATE.md` updated
- [x] `KNOWN_TODOS.md` updated (one new entry: chart/table can disagree in multi-line mode after filter changes)
- [x] `NEXT.md` updated (item 8 removed from Review-Findings, Batch 2 marked complete)
- [x] Notion entry → ✅ Ausgeführt
- [x] This result file written
