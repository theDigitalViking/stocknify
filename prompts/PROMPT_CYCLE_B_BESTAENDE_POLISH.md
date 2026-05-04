# PROMPT: Cycle B — Bestände-Tabelle Polish + Re-Upload Behavior

**Phase:** Phase 4
**Area:** Frontend + Backend
**Type:** Fix + Refactor
**Notion:** https://www.notion.so/35624fe1d88a8187bed5d34a5d59133f

---

## Context

Frontend-Review (2026-04-30) identified 15 bugs/ideas triaged into five sequential cycles (A–E). Cycle A (marketplace install-name regression) and the Test-Harness Foundation cycle are both shipped. Cycle B is the first cycle that touches backend logic **and** ships with a backend test under the freshly built Vitest harness.

The core behaviour change in this cycle: every CSV upload must create a `stock_movements` entry even when the new quantity equals the current quantity. The current `upsertStockLevel` short-circuits with `return 'skipped'` on identical quantities — that must go. Rationale: upload visibility in history is more important than write-avoidance idempotency, and the movement-history chart in Cycle E depends on a gapless movement trail.

Separately, `ManualAdjustDialog` is removed from the UI because Stocknify mirrors inventory — it does not manipulate it.

## Non-goals

- No new endpoints (stock movements endpoint is Cycle E).
- No chart/history UI (Cycle E).
- No product detail page changes (Cycle C).
- No soft-delete restore (Cycle D).
- No frontend test infrastructure.
- No changes to CSV import flow itself — only to `upsertStockLevel` behaviour.

## Files involved

### Backend
- `apps/api/src/services/stock/upsert-stock-level.ts` (or wherever `upsertStockLevel` lives — grep for `upsertStockLevel`)
- `apps/api/src/routes/csv/index.ts` (contains the `if (currentQty.equals(newQty)) return 'skipped'` guard — verify)
- New test file: `apps/api/src/services/stock/__tests__/upsert-stock-level.test.ts` (or colocated per harness convention from Cycle TH)

### Frontend
- `apps/web/src/components/stock/stock-quick-view-sheet.tsx` — add Bestandswert column
- `apps/web/src/app/(dashboard)/stock/page.tsx` — split Charge/MHD columns, resolve three-dot menu
- `apps/web/src/components/stock/manual-adjust-dialog.tsx` (or similar) — remove component + all imports/usages
- i18n files: `apps/web/public/locales/en/` and `apps/web/public/locales/de/` (or `messages/` — check actual i18n path)

## Pre-flight check (mandatory — do this FIRST, before writing any code)

> **TRANSITIONAL** — this section stays in every prompt until the memory bank has stabilized. See WORKFLOW.md § Pre-flight policy.

Before implementing anything, verify whether the feature in this prompt may already exist in the repo. Cycles in this project have sometimes overlapped and the historical handover may be incomplete.

1. **Look in the obvious places.** For each file under "Files involved", grep for symbols, props, routes, or i18n keys this prompt would add. Check the most recent ~20 entries in `prompts/results/` (sorted by mtime) for anything touching the same area. Skim `git log --oneline -30`.
2. **Classify.**
   - **Already done:** the feature is implemented and matches this prompt's intent. → Stop. Write `prompts/results/RESULT_CYCLE_B_BESTAENDE_POLISH.md` noting "already implemented; no changes needed", point at the existing files, set the Notion entry to ✅ Ausgeführt with a one-line `Ergebnis` like *"Pre-flight: feature already present, no commit"*. Do **not** commit, do **not** push. Update STATE.md if the existing implementation isn't reflected there.
   - **Partially done:** some items in this prompt's Requirements list are already in the repo. → Implement only the missing items. In the result file, list which were already done (with file pointers) and which you implemented.
   - **Not done:** proceed normally with Requirements below.
3. **When uncertain**, default to flagging in the result file rather than building. Write what you found and propose a plan; do not silently overwrite.

## Requirements

### R1 — Remove identical-quantity skip in `upsertStockLevel` (Backend)

Find the guard that short-circuits when the incoming quantity equals the existing quantity (the `if (currentQty.equals(newQty)) return 'skipped'` or equivalent). Remove it so that every call always writes a `stock_movements` row, even for identical quantities.

**Important:** The `stock_levels` row may still be updated with the same value (quantity unchanged), but a new `stock_movements` entry must always be appended. If `upsertStockLevel` currently skips both the level update *and* the movement write, both must now execute. If only the movement write is skipped, only that guard needs removal.

Update the return value / result type if needed so callers can still distinguish "quantity changed" from "quantity unchanged but movement recorded" — but do not break existing caller contracts silently.

### R2 — Backend test for R1 (Backend)

Write a Vitest test under the test harness (Cycle TH conventions: `buildTestApp()`, `signTestJwt()`, `createTestTenant()`, test DB on port 5433).

Test case: call `upsertStockLevel` (or the API endpoint that triggers it, e.g. `POST /integrations/csv/import/stock`) twice with identical quantities for the same variant × location. Assert that two `stock_movements` rows exist after the second call, not one. This pins the behaviour change from R1 against future Codex regressions.

Place the test file adjacent to the service or in `apps/api/src/test/` — follow whatever convention emerged from Cycle TH's smoke test.

### R3 — Bestandswert column in Quick-View stock table (Frontend)

`StockQuickViewSheet` → `ProductStockTable` currently shows quantity but not the value column ("Bestandswert"). Add a column that shows `quantity × unit cost` (if unit cost is available) or just quantity if no cost data exists. Check the `stock_levels` or related schema for a cost/price field. If no cost field exists anywhere in the schema, add the column header but display "—" and note in KNOWN_TODOS that cost data is needed.

### R4 — Split "Charge (MHD)" into two columns (Frontend)

On the stock list page (`stock/page.tsx`), the combined "Charge (MHD)" column must become two separate columns:
- **Charge** — batch number only
- **MHD** — expiry date only (locale-formatted, timezone-safe as per existing convention: `YYYY-MM-DD` parsing)

Update table headers, cell renderers, and i18n keys (en + de) accordingly.

### R5 — Remove ManualAdjustDialog (Frontend)

Find and remove:
- The `ManualAdjustDialog` component file
- All imports and usages across the codebase
- Any related i18n keys
- Any "Manuelle Anpassung" / "Manual adjustment" menu entries or buttons

Stocknify mirrors inventory — manual stock manipulation is not a feature. If there is a backend endpoint for manual adjustment, do **not** remove it in this cycle (backend deprecation is out of scope) — only remove the frontend surface.

### R6 — Dissolve three-dot menu → single action icon (Frontend)

On the stock list page, the three-dot dropdown menu currently contains (after R5 removes manual adjustment) only "Bewegungen anzeigen" / "View movements". Replace the dropdown with a direct icon button (e.g., `Activity` or `History` from lucide-react) in the actions column. Tooltip: "Bewegungen anzeigen" / "View movements".

If the three-dot menu still contains other items after R5 (unexpected), keep the dropdown but remove the manual-adjust entry.

## Acceptance Criteria

- [ ] `upsertStockLevel` always writes a `stock_movements` row, even when quantity is unchanged
- [ ] New Vitest test passes: two identical-quantity upserts → two movement rows
- [ ] Quick-View sheet shows a Bestandswert column (value or "—" placeholder)
- [ ] Stock list has separate Charge and MHD columns (not combined)
- [ ] `ManualAdjustDialog` component is gone; no "manual adjustment" UI anywhere
- [ ] Three-dot menu replaced with single icon if only one action remains
- [ ] i18n keys updated in both en and de
- [ ] `pnpm -C apps/api typecheck` passes
- [ ] `pnpm -C apps/web typecheck` passes
- [ ] All existing + new tests pass (`pnpm -C apps/api test`)
- [ ] Codex adversarial review passes (security/correctness findings fixed before push)

## Behaviour-Change Documentation

**R1 changes observable system behaviour.** Document this in the result file explicitly:

> **Before:** `upsertStockLevel` returns `'skipped'` and writes no `stock_movements` row when `currentQty === newQty`.
> **After:** `upsertStockLevel` always writes a `stock_movements` row. The `stock_levels` row is still updated (even if the value is identical) to refresh `last_synced_at`.

This prevents future Codex from flagging "unnecessary writes" and attempting to re-add the skip guard.

## Memory Bank update (mandatory — do this LAST, before pushing)

After commit, in the same commit or a follow-up commit, update the memory bank:

1. **`prompts/_state/STATE.md`** — under "What's deployed and working", add Cycle B summary. Update "Last updated" date. Move resolved items out of "in flight".
2. **`prompts/_state/KNOWN_TODOS.md`** — append any deferred Codex findings or known limitations introduced by this cycle (e.g., missing cost field for Bestandswert column). Update "Last updated" date.
3. **`prompts/_state/DECISIONS.md`** — append a decision entry for the identical-quantity behaviour change (R1). Date: today. Decision: `upsertStockLevel` no longer skips on identical quantities. Rationale: upload visibility + movement-history completeness for Cycle E chart. Alternatives: keep skip + synthetic "upload marker" events → rejected (adds complexity, loses real movement semantics).
4. Result file: `prompts/results/RESULT_CYCLE_B_BESTAENDE_POLISH.md` following `prompts/_templates/RESULT_TEMPLATE.md`.
5. **Notion entry status** → ✅ Ausgeführt. URL: `https://www.notion.so/35624fe1d88a8187bed5d34a5d59133f`. Add the result file path under the "Ergebnis" property and set "Ausgeführt am" to today's date.

## Push (mandatory final step on `develop`)

After the Memory Bank update is committed and Codex review is clean:

```
git push origin develop
```

This pushes to `origin/develop` only. CI runs and a Vercel Preview Deployment is created; **no production deploy** is triggered. Production deploy is gated on Sebastian's manual `develop` → `main` merge.

**Never push to `main`.** That branch is Sebastian's manual merge target.

## Reminders

- **Branch is `develop`.** Verify with `git rev-parse --abbrev-ref HEAD` before committing.
- **Do not push to `main`** under any circumstances.
- Run Codex adversarial review via `/codex:adversarial-review --base origin/develop Cycle B: upsertStockLevel behaviour change, ManualAdjustDialog removal, stock table column changes` **before** the push. Classify findings per WORKFLOW.md §5.
- The behaviour change in R1 is **intentional and documented**. If Codex flags "unnecessary write on identical quantity" or similar, classify as MVP-irrelevant / documented-decision and log in KNOWN_TODOS with a pointer to the DECISIONS entry.
