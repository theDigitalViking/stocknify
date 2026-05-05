# Codex Review: 2-C Movements von Produktseite

**Date:** 2026-05-05
**Reviewer:** OpenAI Codex (via `/codex:adversarial-review --base origin/main`)
**Cycle prompt:** PROMPT_2-C_MOVEMENTS_FROM_PRODUCT.md

---

## Findings Summary

| # | Finding | Severity | Classification | Action |
|---|---------|----------|---------------|--------|
| 1 | `rangeForPreset` is off by one — the 7d preset spans 8 calendar days, 30d spans 31, etc. | medium | ACTIONABLE (Correctness) | Fixed (`movements/page.tsx:rangeForPreset`) |
| 2 | URL `from`/`to` query params are forwarded to the API without validation; malformed deep links can crash render or trigger 4xx loops | medium | ACTIONABLE (Correctness / Robustness) | Fixed (`movements/page.tsx` — added `parseUrlRange` + sanitization in initial state, mount effect, and sync effect) |

Both findings target code that originated in Cycle 2-B / 2-B-FIX and is on `develop` but not yet merged to `main`. Codex reviewed the cumulative diff vs `origin/main`, so the findings appear in the 2-C review window even though the regressions weren't introduced by 2-C itself. Fixing them here keeps the merge-to-`main` payload clean.

---

## ACTIONABLE — Fixes Applied

### Finding 1: Preset ranges off by one
**Original finding:** `rangeForPreset` does `subDays(startOfDay(now), days)` paired with `endOfDay(now)`. For `7d` that spans today plus the seven prior days = 8 calendar days; `30d` spans 31; `90d` spans 91. The chart and table windows are systematically wider than the preset label promises.

**Root cause:** Off-by-one in the inclusive-day math. "7d" means "the last 7 days **including today**" (today + 6 prior), not "today + 7 prior days".

**Fix:** Changed `subDays(startOfDay(now), days)` to `subDays(startOfDay(now), days - 1)` and added a comment explaining the inclusivity contract. Boundary verification: `rangeForPreset(7)` now produces a `from` six days before today's local 00:00 and a `to` of today's local 23:59 — exactly seven calendar days inclusive of today. Same arithmetic holds for 14/30/90.

### Finding 2: URL `from`/`to` accepted without validation
**Original finding:** `useState`'s initializer reads `search.get('from') ?? undefined` and `search.get('to') ?? undefined` and passes those raw strings into `tableFilters` / `chartFilters` and onward to `useStockMovements`. A malformed deep link like `?from=garbage` is forwarded verbatim to the API, can cause 4xx responses, and (depending on TanStack retry) keeps re-firing. There's also no guarantee `from <= to`.

**Root cause:** The page treated the URL as a trusted input. Initial state, mount effect, and sync effect all read raw strings without parsing.

**Fix:** Added a single `parseUrlRange(rawFrom, rawTo)` helper that:
- Returns `{ from: undefined, to: undefined, isValid: true, hadParams: false }` when the URL has neither param (default-30d landing).
- Parses each provided value with `Number.isFinite(new Date(raw).getTime())`. A non-empty raw value that fails to parse marks the pair `isValid: false`.
- Compares `from`/`to` ms ordering and marks the pair `isValid: false` when `from > to`.
- Returns normalized ISO strings (round-tripped through `new Date(ms).toISOString()`) so downstream equality checks aren't tripped by trailing-Z vs offset-suffix divergence.

All three URL→state call sites now route through the helper:
- **Initial `useState`:** Falls back to the stable default-30d range when the URL is empty *or* invalid; the mount effect handles the URL rewrite.
- **Mount effect:** Now rewrites the URL when `!parsed.hadParams || !parsed.isValid` (was previously `!from && !to` — silently ignored bad input).
- **Sync effect (URL → state):** When `!parsed.isValid`, resets `range` to the default *and* calls `writeRangeToUrl(defaultRangeRef.current)` so the address bar matches state on the next render. Valid + populated URL flows unchanged; valid + empty URL still resets to default.

Net effect: a malformed shared link no longer makes it to the API. `useStockMovements` only ever sees either parsed ISO strings or `undefined` (the case the API already handles). The `applyCustomFrom`/`applyCustomTo` paths are unchanged — they already produce valid ISOs from `<input type="date">` values, and the input's HTML `min`/`max` props guard ordering at the UX layer; if those are bypassed and a `from > to` pair lands in the URL, the sync effect catches it on the next tick.

**Commit:** `34d4991` — fix(web): Cycle 2-C — preset off-by-one + URL date validation (Codex review)

---

## DEFERRED — Added to KNOWN_TODOS

None. Both findings were Correctness/Robustness and per DECISIONS 2026-04-16 are ACTIONABLE.

Codex's "Next steps" included "add a unit test around boundary dates/timezones" for the preset math and a regression test for invalid URL handling. Frontend tests are still out of scope per the testing strategy (see KNOWN_TODOS § Testing strategy — "Frontend test infra (React Testing Library) is out of scope until backend test discipline has held for ≥3 cycles post-TH"). When that infra lands, both branches of `parseUrlRange` plus the four preset boundary calculations are good first-target tests.

---

## Verification

- `pnpm -C apps/web typecheck` — green.
- `pnpm -C apps/web build` — green; bundle sizes unchanged from the pre-fix build (`/stock/movements` first-load JS still 110 kB, `/products/[id]` 4.89 kB).
- Manual reasoning check on preset boundaries:
  - `rangeForPreset(7).from`: 6 days before today's 00:00 local. `to`: today 23:59:59.999 local. → spans exactly 7 calendar days.
  - `rangeForPreset(30).from`: 29 days before today. → spans exactly 30 days.
  - Same shape for 14 and 90.
- Manual reasoning check on URL parsing:
  - `?from=garbage&to=garbage` → `parsed.isValid=false` → mount effect rewrites URL to default; sync effect doesn't propagate bad values to API filters.
  - `?from=2025-12-31T00:00:00.000Z&to=2025-01-01T00:00:00.000Z` (reversed) → `orderInvalid=true` → `parsed.isValid=false` → reset + URL rewrite.
  - `?from=2026-04-01T00:00:00.000Z` (only `from`, no `to`) → parses to a valid ISO + `to` undefined; not flagged invalid (the API accepts open-ended ranges).
