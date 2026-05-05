# Codex Review: 2-E Movements Filters & Legend

**Date:** 2026-05-06
**Reviewer:** OpenAI Codex (via `/codex:adversarial-review --base origin/main`)
**Cycle prompt:** `PROMPT_2-E_MOVEMENTS_FILTERS_LEGEND.md`
**Verdict:** needs-attention

---

## Findings Summary

| # | Finding | Severity | Classification | Action |
|---|---------|----------|---------------|--------|
| 1 | `Clear all` filter state lost via URL/state mismatch | high | ACTIONABLE (Correctness) | Fixed (this session, follow-up commit) |
| 2 | Filter option lists derived from truncated 200-row chart sample | medium | DEFERRED (prompt-scoped tradeoff) | Added to KNOWN_TODOS |

---

## ACTIONABLE — Fixes Applied

### Finding 1: `Clear all` filter state immediately lost due to URL/state mismatch

**Original finding (Codex paraphrase):** `clearAll` emits an empty `Set` (`onChange(new Set())`), but URL serialization writes that as an empty query value (`locations=` / `stockTypes=`). On the next search-param sync effect, `parseFilterParam` treats empty values as `'all'`, so the component overwrites the empty selection back to `'all'`. The UI cannot persist an explicit empty selection and the `noFilterSelected` branch is effectively unreachable after router sync.

**Root cause:** Asymmetric URL serialization. `selectionToParam(new Set())` returned `''` (writing `?locations=` to the URL — semantically "explicit deselection"), but `parseFilterParam('')` collapsed an empty string back to the `'all'` sentinel. The two functions need to round-trip every state value losslessly. The result: the `noFilterSelected` empty-state branch in the page (tied to acceptance criterion "All-deselected state shows an appropriate empty message") was reachable only for the single re-render before the URL-sync `useEffect` fired and forced state back to `'all'`.

**Fix:** Made `parseFilterParam` symmetric with `selectionToParam`:
- `raw === ''` (explicit `?locations=`) → `new Set()` (was `'all'`)
- `parts.length === 0` after trimming/filtering of malformed input (e.g. `?locations=,,,`) → `new Set()` (was `'all'`) — same destination so a malformed URL doesn't restart the same ping-pong via a different path.

The `raw === null` (param absent) case still returns `'all'` (or seeds from the legacy `locationId`/`stockType` fallback at mount). Only the explicit-empty path changed.

Verification:
- `pnpm -C apps/web typecheck` green.
- `pnpm -C apps/web build` green; `/stock/movements` first-load JS unchanged at 111 kB.

**Commit:** (this session, follow-up commit on `develop`)

---

## DEFERRED — Added to KNOWN_TODOS

### Finding 2: Filter option lists are built from a truncated page

**Original finding (Codex paraphrase):** In product mode, chart fetch is hard-limited to `perPage: CHART_PER_PAGE` (200), and both `locationOptions` and `stockTypeOptions` are derived only from `chartRows`. For larger ranges/datasets, valid locations/types outside the latest 200 rows never appear in filter controls, creating incomplete filter space. Recommendation: build filter option sets from an untruncated source (dedicated facet endpoint or full-scope query), or label the filter UX as scoped to the sampled window.

**Reason deferred:** Per DECISIONS 2026-04-16, only Security / Data Integrity / Correctness findings are actioned. This is a completeness/UX issue against the prompt's explicit scope — the prompt states "Filter logic is purely client-side against the already-fetched movements data", which directly mandates the fetched-sample derivation Codex flags. Going beyond it requires either a new backend facet endpoint or doubling the chart fetches, both out-of-scope for `review:recommended`. The transitive signal is already in place: when the chart is truncated, the existing amber `truncatedNotice` (Cycle 2-B-FIX) tells the operator the data is incomplete; a follow-on inference is that filter options reflect only the visible window. The structural fix lives alongside the existing "stock_movements chart aggregation/downsampling" entry in KNOWN_TODOS — server-side downsampling (LTTB / hour bucketing) is the real destination for both. Tracked there for visibility when a real tenant hits this.

---

## What Codex did NOT flag

- The legend fade-vs-hide rework (R3) — palette, opacity values, tooltip muting all read clean to Codex's pass.
- The pre-selection seeding from legacy `locationId`/`stockType` URL params (R4) — the once-at-mount fallback design with subsequent suppression via `useEffect` deps was accepted.
- The chart/table-can-disagree-in-multi-line-mode tradeoff (already self-tracked in KNOWN_TODOS as Cycle 2-E fallout) — not flagged as a blocker, presumably because the cycle's non-goal explicitly opts out of touching the table.
- The decision to drop `locationId`/`stockType` from `chartFilters` in multi-line mode so the dropdowns can populate from the full product dataset.

---

## Memory Bank updates

- [x] `STATE.md` — review-fix note appended to the Cycle 2-E bullet
- [x] `KNOWN_TODOS.md` — Finding 2 added under Frontend
- [x] This review file written
