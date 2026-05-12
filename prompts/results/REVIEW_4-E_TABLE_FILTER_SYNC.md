# Codex Review: Cycle 4-E — Movements-Tabelle: Filter-Sync mit Chart-Dropdowns

**Date:** 2026-05-12
**Reviewer:** OpenAI Codex (via `/codex:adversarial-review --base origin/main`)
**Cycle prompt:** `PROMPT_4-E_TABLE_FILTER_SYNC.md`
**Verdict:** needs-attention (2 findings, both ACTIONABLE)

---

## Findings Summary

| # | Finding | Severity | Classification | Action |
|---|---------|----------|---------------|--------|
| 1 | Clear-all silently broadens table query to unfiltered tenant-wide movements | high | ACTIONABLE — Correctness (operator intent silently inverted) | Fixed in-session |
| 2 | Unbounded CSV filter lists enable query amplification / large `IN (...)` blow-ups | medium | ACTIONABLE — Security (DoS surface on an authenticated endpoint) | Fixed in-session |

---

## ACTIONABLE — Fixes Applied

### Finding 1: Empty Set → table widens to "no filter"

**Original finding:** Clearing a multi-select filter to an empty Set produces a URL like `?locations=`. The page's URL parser preserves that as `new Set()` (Cycle 2-E review-fix made the parse symmetric so Clear-all survived the URL round-trip). But the new `tableFilters` `toCsv` helper collapses empty Set to `undefined`, which gets stripped by `toQueryString`. The backend then sees no `locationIds` param and serves all movements in range — the opposite of the operator's intent. Codex flagged this as a UI-layer trust-boundary regression because an action that looks like "narrow" produces "broaden."

**Root cause:** The frontend's chart already has a `noFilterSelected` short-circuit at render time that swaps the chart for a hint card when ANY filter is an empty Set. The table had no equivalent gate — it just consumed `tableFilters` and rendered whatever came back. With the new multi-select wiring, an empty Set silently degrades to "no filter for that dimension" instead of "match nothing." Codex's recommended fix was a server-side sentinel (`WHERE false`); I chose a frontend gate because it keeps backend semantics simple, mirrors the chart's existing behaviour exactly, and removes any chance of accidentally fetching wide data even on first render before the operator notices.

**Fix:**
1. `apps/web/src/lib/api/use-stock-movements.ts` — `useStockMovements` gained an optional `{ enabled?: boolean }` second argument that defers to the underlying TanStack `useQuery({ enabled })`. Default `true` so every existing call site keeps its previous behaviour.
2. `apps/web/src/app/(dashboard)/stock/movements/page.tsx` — the `noFilterSelected` computation moved up (now lives just before the `useStockMovements` calls) so the table fetch can gate on it: `useStockMovements(tableFilters, { enabled: !noFilterSelected })`. The duplicate declaration further down was removed.
3. Same file, render block — the table `<section>` now branches on `noFilterSelected` and renders the same "Select a filter" hint card (`chart.noFilterSelected.title` / `chart.noFilterSelected.description`) that the chart already shows. The `StockMovementTable` only mounts when at least one option is selected on every dimension.

**Behavioural result:** clicking "Clear all" on any dropdown puts BOTH the chart AND the table into the empty-state UI. No fetch fires for the table during that state, so even an adversarial direct hit on the API with `?locations=` (no plural at all) cannot produce a table view that contradicts the operator's intent. Chart and table now agree on every cell of the (selection × visible-data) matrix.

**Files changed:**
- `apps/web/src/lib/api/use-stock-movements.ts`
- `apps/web/src/app/(dashboard)/stock/movements/page.tsx`

**Tests:** frontend behaviour change — covered by the existing chart `noFilterSelected` branch and the moved-up computation. Frontend test infra is still queued per the Testing strategy section of `KNOWN_TODOS.md`; when it lands, this is a high-leverage case to pin (target: state-machine test that an empty-Set on any single dropdown disables the table query and renders the empty-state).

---

### Finding 2: Unbounded CSV filter lists → query amplification / DoS surface

**Original finding:** The three plural params (`locationIds`, `storageLocationIds`, `stockTypes`) accepted arbitrary-length CSV strings. After per-item UUID validation, they were dropped straight into Prisma `{ in: [...] }` clauses. An authenticated caller could submit megabyte-scale lists, inflating SQL parameter count and Postgres planning cost, and potentially triggering Postgres' `MaxAllocSize` ceiling or a client-side prepared-statement-arg cap. Codex flagged this as a real 5xx / DoS vector on a tenant-scoped endpoint.

**Root cause:** The 4-E primary diff added the plural params but only validated the SHAPE of each item (UUID regex for IDs). It never bounded the SIZE of the parsed list or the length of the raw query string. The dedupe step was also missing — a caller submitting `?locationIds=A,A,A,…,A` (100k copies) would still produce a hot `IN (...)` clause even after format validation.

**Fix (single commit, three layers):**
1. **Schema-level byte cap:** each plural is now `z.string().max(8192).optional()`. 8 kB covers roughly 200 UUID entries with commas, well above the post-parse item cap (100), so it acts as a defence-in-depth ceiling before any allocation happens at the handler. The schema rejects with a structured Zod error → existing `400 VALIDATION_ERROR` reply path.
2. **Post-parse item cap:** new `MAX_CSV_FILTER_ITEMS = 100` constant. After `parseCsvParam`, the handler checks `arr.length > 100` for each filter and returns `400 VALIDATION_ERROR` with the message `"Filter list exceeds maximum of 100 items"`. The check fires before any DB I/O. The 100-item ceiling matches Codex's suggested limit and is far above any plausible operator multi-select (a tenant with ten warehouses × ten bins is still under the cap).
3. **Dedupe:** `parseCsvParam` now does `Array.from(new Set(parts))` so `?locationIds=A,A,A` collapses to a single-element list before hitting Prisma. Prevents both planner cost amplification AND a subtle correctness bug where duplicate entries could affect future code paths that count `IN` items.

**Files changed:**
- `apps/api/src/routes/stock/index.ts`
- `apps/api/src/routes/stock/__tests__/movements.test.ts` (3 new tests)

**Tests:** 3 new in `movements.test.ts`:
- `rejects oversized CSV filter lists` — 101 random UUIDs in `locationIds` → 400 with the `"maximum of 100 items"` message. Pins the post-parse cap.
- `rejects overlong CSV filter strings` — 8193 bytes of dummy content in `stockTypes` → 400. Pins the schema-level byte cap (Zod `max(8192)`).
- `deduplicates repeated values in CSV filter lists` — `locationIds=A,A,A` over a tenant with one row at location A → still returns exactly one row. Pins the dedupe contract so a future refactor doesn't accidentally let duplicates back through.

Backend test suite 92 → 95 green; `pnpm -C apps/api typecheck` + `pnpm -C apps/web typecheck` green.

---

## DEFERRED — Added to KNOWN_TODOS

None. Both findings ship in this commit.

---

## Notes on Codex's "server-side sentinel" recommendation

Codex's primary recommendation for Finding 1 was a server-side `WHERE false` sentinel for empty-Set selections. I went with a frontend-only gate instead because:

1. **Symmetry with the chart.** The chart already short-circuits to a hint card when any filter is an empty Set — no fetch fires. A frontend-only table gate makes the two halves of the page behave identically without any backend change. A server sentinel would have made the table behaviour different in shape (request fired with sentinel, response interpreted as "match nothing") from the chart (no request).
2. **Simpler contract.** A sentinel like `?locationIds=__none__` would have ugly edge cases: how does the backend distinguish `__none__` from a legitimate stock-type called "none"? Encoding empty intent in the URL would require a new well-known token everywhere on both sides, vs. simply not firing the request.
3. **TanStack idiom.** `useQuery({ enabled })` is the canonical way to gate a fetch on application state. Reusing it keeps the page consistent with everywhere else in the app that disables fetches on render-time conditions.

The "least-privilege regression" framing in Codex's finding is technically a stretch — the operator already had access to all the same data via the `'all'` sentinel — but the underlying point that operator intent should match operator-visible behaviour is real, and the frontend gate addresses it directly. Documented here so a future cycle considering "should we add backend WHERE-false sentinels" has the context for the choice.
