# RESULT: 2-C Movements von Produktseite

**Prompt:** `prompts/PROMPT_2-C_MOVEMENTS_FROM_PRODUCT.md`
**Notion:** https://www.notion.so/35724fe1d88a81e38945c5390df5b196
**Branch:** develop
**Last commit:** fcdcb9d — feat(web): Cycle 2-C — movements multi-line chart + product-detail entry point
**Date:** 2026-05-05

---

## Summary

Added a second entry point into `/stock/movements`: a `BarChart3` "View movements / Bewegungen anzeigen" button on the product detail page links to `?productId={id}`. The movements page detects product-only mode (productId without the variant+location+stockType trio) and switches the chart into a multi-line view that groups movements by `locationName · stockType`. The chart component now accepts either flat `movements` (existing single-line, unchanged behaviour) or a `series` array (new multi-line) via a discriminated union; multi-line mode renders one `<Area>` per series with a distinct Tailwind-500 hue + dasharray pattern, a clickable `<Legend>` that toggles series visibility, and a tooltip that shows all visible series at the hovered timestamp.

## Files changed

- `apps/web/src/app/(dashboard)/products/[id]/page.tsx` — new outlined `BarChart3` button next to Edit/Delete linking to `/stock/movements?productId={id}`. Reuses existing `stock.viewMovements` translation. `Button asChild` wraps a Next.js `<Link>`.
- `apps/web/src/app/(dashboard)/stock/movements/page.tsx` — split chart-gating into `hasSingleLineFilters` (existing trio) vs `isProductMode` (productId only). Added `productSeries` memo that fans the flat `chartData.data` payload out into one series per `${locationId}|${stockType}` composite key, sorted by display name. Renders a heading + legend-toggle hint above the chart in product mode; truncation notice still applies (counts total rows, not per series). Picks the right chart prop branch (`series` vs `movements`) at the call site so the discriminated union is exhaustive.
- `apps/web/src/components/stock/stock-movement-chart.tsx` — refactored to a discriminated-union prop type. Multi-line mode iterates the series array, paints each as a separate `<Area>` with a colour from an 8-hue palette and a paired `strokeDasharray` (so colourblind operators can still distinguish adjacent series), and mounts a `<Legend>` whose `onClick` toggles a local `Set<string>` of hidden series keys; visible series in the tooltip stay in sync via Recharts' `hide` prop. Single-line mode is unchanged for callers — same gradient fill, teal stroke, smart time-tick formatter — but now also routes through the merged `seriesMeta` rendering path so there's a single render pipeline.
- `apps/web/messages/en.json` — added `stockMovements.chart.multiLine.{title,description,legendToggleHint,seriesLabel}` (ICU placeholders `{location}` / `{stockType}` on `seriesLabel`).
- `apps/web/messages/de.json` — same keys with German strings.

## Key decisions made during execution

- **Reused `stock.viewMovements` for the product-detail button label.** A `stock.viewMovements` key already existed ("View movements" / "Bewegungen anzeigen") and reads naturally as a button label on the product detail header. Avoided introducing a parallel `products.detail.viewMovements` key for the same surface.
- **Series key is `${locationId}|${stockType}`, label is `${locationName} · ${stockType}`.** Using IDs in the key keeps two locations with the same name disambiguated; the human label drops the IDs. The label is built via the new ICU `chart.multiLine.seriesLabel` key so DACH operators can localise the separator if ever needed.
- **Discriminated-union props instead of an optional second prop.** The chart now takes either `{ movements }` or `{ series }`, never both, with `?: never` on the alternate branch. This catches accidental "pass both" call sites at compile time and keeps the existing single-line caller (`hasSingleLineFilters` branch) untouched in source-text terms.
- **`fill="transparent"` in multi-line mode, gradient kept in single-line mode.** Stacking eight semi-opaque area fills produces unreadable mud. Multi-line uses outline-only `<Area>` for clarity; single-line keeps the original teal gradient so the existing entry point (BarChart3 from the stock list row) is visually unchanged.
- **`isAnimationActive={false}` + `dot={{ r: 2 }}` in multi-line.** Movement payloads are sparse per series (most rows belong to *one* series, others get `null` at that timestamp). Disabling animation prevents jitter when the legend toggle re-renders, and the small dot makes individual movements legible when a series only has 1–3 entries inside the visible range.
- **Tooltip `formatter` swaps the raw series key for the human label.** Recharts passes `dataKey` (`locationId|stockType`) to `formatter`'s `name` arg by default; the formatter looks up the series meta and returns the display name so the tooltip rows are readable.
- **Truncation notice stays a single-row notice in both modes.** `meta.total` is the API's row count regardless of how the page slices it into series, so the existing "shown of total" text reads correctly in product mode too. Per-series caps were a non-goal.
- **No URL-driven series visibility persistence.** The hidden-series state lives in component-local `useState<Set<string>>`. URL persistence would require namespacing the keys to avoid colliding with the existing `from`/`to`/`productId` params and adds churn to the address bar; left out of MVP scope.

## Skipped or deferred

- **Stock-type localisation in the legend label.** The series label inserts the raw `stockType` string (e.g. `available`, `reserved`). The stock list and movement table both already do the same (no `stockTypeNames` translation block exists today), so this stays consistent — when a `stockTypes.<key>` translation block lands across the app, the legend label can pick it up via the same `seriesLabel` key.
- **Server-side downsampling for high-throughput tenants.** The `/stock/movements` chart still pulls up to 200 rows per fetch and renders client-side. With multiple series the per-series row count drops naturally, but a single tenant with very high movement volume can still hit the cap on the *total* fetch. Tracked under the existing "stock_movements chart aggregation/downsampling" entry in KNOWN_TODOS.
- **`sourceDetail`-driven movement-type lines (item 7 from the 2026-05-05 review).** Splitting "sync" into CSV-import / SFTP / Integration lines was explicitly listed as a non-goal in the prompt and depends on a `sourceDetail` schema field that doesn't exist yet. Left for a future cycle.
- **Calendar-aligned presets (2-B fallout).** Day-count presets stay; calendar-week / month presets are still tracked as a future polish item under "Movements page: calendar-month/week presets" in KNOWN_TODOS.
- **URL→preset rehydration.** Unchanged from 2-B's behaviour; pre-existing entry in KNOWN_TODOS still applies and was not in scope here.

## Tests

- `pnpm -C apps/web typecheck` — green.
- `pnpm -C apps/web build` — green; Next.js build emits 19 routes. `/stock/movements` first-load JS 109 → 110 kB (one extra Recharts import — `Legend` — plus the multi-line render path); `/products/[id]` first-load JS 4.89 kB (negligible delta from the BarChart3 button).
- No backend tests added — pure frontend cycle per the testing strategy (see KNOWN_TODOS § Testing strategy).

## Codex review

Not run by Claude Code in this session. The prompt is `review:recommended`; Sebastian decides whether to run `/codex:adversarial-review --base origin/main` after the push and, if so, the findings will be triaged in the same session per WORKFLOW.md § Step 6.

## Memory Bank updates

- [x] `STATE.md` updated
- [x] `KNOWN_TODOS.md` updated
- [x] Notion entry → ✅ Ausgeführt (URL: https://www.notion.so/35724fe1d88a81e38945c5390df5b196)
- [x] This result file written
