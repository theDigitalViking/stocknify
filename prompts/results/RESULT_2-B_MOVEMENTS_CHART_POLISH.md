# RESULT: 2-B Movements-Chart Polish

**Prompt:** `prompts/PROMPT_2-B_MOVEMENTS_CHART_POLISH.md`
**Notion:** https://www.notion.so/35724fe1d88a812e87def200d60a6c21
**Branch:** develop
**Last commit:** 1794d1a — feat(web): Cycle 2-B — movements chart polish (time-axis + range picker)
**Date:** 2026-05-05

---

## Summary

The `/stock/movements` page gains a date-range control row above the chart and the chart's X-axis is now time-scaled. Operators can pick from four day-count presets (`7d`/`14d`/`30d`/`90d`, localized to `7T`/`14T`/`30T`/`90T` in de) or set a custom from–to range via two native `<input type="date">` controls; the range is mirrored into the URL as `?from=ISO&to=ISO` so the view is shareable. The Recharts X-axis switched from a categorical date string to a time-scale (`type="number"` + `scale="time"`) keyed off epoch-ms, with a smart tick formatter that picks `HH:mm` / `DD.MM. HH:mm` / `DD.MM.` based on the visible data range so same-day entries no longer collapse to a single point. Frontend-only cycle, no backend touch; build + typecheck green.

## Files changed

- `apps/web/src/components/stock/stock-movement-chart.tsx` — XAxis rebuilt as `type="number"` + `scale="time"` + `domain=['dataMin','dataMax']` keyed off `timestamp` (epoch-ms). New `formatTick(value)` switches granularity by visible range (≤24h `HH:mm`, ≤7d `DD.MM. HH:mm`, else `DD.MM.`). Tooltip's `labelFormatter` always renders the full local datetime via `Intl.DateTimeFormat({dateStyle:'short', timeStyle:'short'})` so hover detail stays consistent regardless of axis granularity. `minTickGap=32` keeps ticks legible at high data density. Dropped the now-unused `dateLabel` field from `ChartPoint`.
- `apps/web/src/app/(dashboard)/stock/movements/page.tsx` — added `RangeState` ({from, to, activePreset}), `PRESETS` array with 7/14/30/90-day entries, helpers `rangeForPreset`, `isoToDateInput`, `dateInputToIsoStartOfDay`, `dateInputToIsoEndOfDay`, plus three event handlers (`applyPreset`, `applyCustomFrom`, `applyCustomTo`) that update state, reset `page` to 1, and call `writeRangeToUrl` to sync `?from=…&to=…` via `router.replace`. Initial state pulls URL params if present, otherwise defaults to last-30-days with `activePreset='30d'` (and leaves the URL clean for the default). Threaded `range.from`/`range.to` into both `chartFilters` and `tableFilters`. Layout: presets in a `flex-wrap` group on the left, two `<input type="date">` controls + a hidden `–` separator on the right, all wrapping gracefully on mobile via `flex-col gap-3 md:flex-row md:items-center md:justify-between`. Empty-state copy now switches between `chart.emptyRange` (range set) and the existing `chart.empty` (no range).
- `apps/web/messages/en.json`, `apps/web/messages/de.json` — added `stockMovements.presets.{7d,14d,30d,90d}` (en uses `7d`/`14d`/`30d`/`90d`, de uses `7T`/`14T`/`30T`/`90T`), `rangeLabel` ("Time range" / "Zeitraum"), `fromLabel`/`toLabel` for the sr-only labels on the date inputs, and `chart.emptyRange.{title,description}` ("No movements in this time range" / "Keine Bewegungen in diesem Zeitraum").

## Key decisions made during execution

- **Native `<input type="date">` instead of pulling in `react-day-picker`.** The prompt suggested a shadcn DatePickerWithRange but allowed two calendar inputs as an alternative. `apps/web` already has `date-fns` for the math and zero existing day-picker UI; a brand-new dialog-driven calendar would have inflated the bundle and the dependency surface for a single page. Native date inputs are accessible by default, give the operator the OS picker on mobile, and keep this cycle's diff to four files. The single visual concession is no quick "pick last week of April" gesture — but the four day-count presets cover the common case.
- **Default 30 days lives in component state, not in the URL.** The prompt specified "no URL params → default to last 30 days" but didn't require the default to be written to the URL. Keeping the URL clean for the default makes shared/non-default URLs explicit ("this URL has a custom range") and avoids a bookkeeping `useEffect` that writes on mount and risks racing the user's first click. The 30-day window is recomputed at mount time, so a stale tab opened tomorrow shows tomorrow's last 30 days, not today's.
- **`useStockMovements` was not modified.** The hook already accepted `from`/`to` in its `StockMovementsFilters` type and the entire filters object goes into the TanStack Query key. Threading the new range through both filter memos was sufficient — no hook signature change, no separate query-key update. Worth recording so a future cycle doesn't try to re-add `from`/`to` to the hook signature.
- **Time conversion uses local-day boundaries, not UTC.** `from` translates an input `YYYY-MM-DD` into the operator's local 00:00:00.000, and `to` into local 23:59:59.999, before `.toISOString()` ships them as UTC ISO. Picking "today" in the right input therefore captures end-of-today in the operator's TZ — which matches the natural reading of "show me movements through today". The trade-off is that two operators in different TZs sharing the same URL see slightly different windows around the boundaries; that's the right call for a single-tenant operational view but worth flagging if multi-TZ coordination ever matters.
- **Resetting `page` to 1 on every range change.** The table's pagination is independent of the date range, so a user on page 7 of "last 90 days" who switches to "last 7 days" would otherwise land on a likely-empty page 7 of a much shorter result set. Page reset on range change is the same pattern Cycle 1-E used for sort toggles.
- **Empty-state split (`emptyRange` vs `empty`).** With a default range always applied, the existing "No movements yet" copy ("Movements will appear once stock data is synced for this combination.") felt off for a range-filtered miss. Added a separate `chart.emptyRange.{title,description}` block with copy that points at the range as the cause. Falls back to the existing keys when no range is set, so the original behavior is preserved for any future caller mounting the chart without a range filter.
- **Preset highlight clears on any custom date pick — no auto-rehydration from URL.** When the page loads with `?from=…&to=…`, the URL range is treated as "custom" even if it happens to exactly match a preset's computed window. Avoiding the equality math (with a minute-or-so tolerance) keeps the state machine simple; the trade-off is a missing highlight for one specific reload pattern. Recorded in KNOWN_TODOS as a "rehydrate preset highlight from URL on load" item.

## Skipped or deferred

- **Calendar-aligned presets ("Diese Woche", "Letzte 14 Tage", "Dieser Monat" from NEXT.md).** Prompt narrowed presets to day-counts; calendar-month/week math was out of scope. KNOWN_TODOS now records the follow-up — same `applyPreset` plumbing, different `from`/`to` math.
- **URL-driven preset highlight rehydration.** See decision notes; recorded in KNOWN_TODOS.
- **Server-side downsampling for wide ranges.** Already tracked under the existing "stock_movements chart aggregation/downsampling" Backend entry; the wider ranges enabled by 2-B make the 200-row cap easier to hit, so KNOWN_TODOS now cross-references it under Frontend too.
- **No regression test added.** Per testing strategy, frontend-only cycles ship without tests; no backend code was touched.

## Tests

- `pnpm -C apps/web typecheck` — passed (no errors).
- `pnpm -C apps/web build` — passed; 19 routes built. `/stock/movements` first-load JS at 306 kB (adds the date-fns helpers + range-control state on top of the Cycle 1-E baseline).
- No backend tests run; backend was not touched.

## Codex review

Not run inline. This cycle is `review:recommended` and Codex review is decoupled from Claude Code per DECISIONS 2026-05-05 — Sebastian runs Codex separately after the push if he wants the second pass. The frontend changes are localized (one component, one page, two locale files) with no backend/schema/auth surface, which matches the `recommended` (vs `mandatory`) classification.

## Memory Bank updates

- [x] `STATE.md` updated — Cycle 2-B entry added at the top of "What's deployed and working"; Last-updated bumped; "Critical paths" entries for `stock-movement-chart.tsx` and `movements/page.tsx` extended to mention the 2-B additions; "What's uncommitted" notes the carry-over → feature → memory-bank chain.
- [x] `KNOWN_TODOS.md` updated — added Frontend entries for URL→preset rehydration, calendar-aligned presets, and the wider-range/200-row-cap interaction. Last-updated bumped.
- [x] Notion entry → ✅ Ausgeführt (set via Notion MCP; "Ergebnis" → `prompts/results/RESULT_2-B_MOVEMENTS_CHART_POLISH.md`; "Ausgeführt am" → 2026-05-05).
- [x] This result file written.
