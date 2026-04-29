# Stocknify — Next Up

> Top 3-5 next steps, prioritized. Updated by Claude (Chat) at the end of every cycle. Always answers: "if I had 90 minutes right now, what would I do?"

**Last updated:** 2026-04-29 (post Marketplace polish 2 — stabilization-track set)

---

## Context

We're in **stabilization mode** before the next `develop` → `main` merge. The plan agreed with Sebastian:

1. Marketplace polish 2 — **DONE** (this cycle, 2026-04-29). Install-name persistence, uninstall UI, toggle failure toast, logo fallback all shipped on `develop`.
2. Stock-overview navigation polish — next.
3. CSV reason-sanitization broader scope — after that.
4. Optional: CSV import UX edge-cases (P2002 friendlier message, storage-location feedback).

Once 2–4 are in, Sebastian merges `develop` → `main` and reviews the deployed frontend. New features (e.g. CSV stock export) are deliberately deferred until after that review pass.

---

## 🔴 Likely-next candidates (ordered)

### A. Stock-overview navigation polish (frontend, small — one cycle)
Three related UI improvements that anchor stock data more tightly to products:

- Stock overview: SKU click → navigates to product detail page.
- Product detail page: gains a stock overview block (per-location quantities, batch info if applicable). The component `apps/web/src/components/products/product-stock-table.tsx` already exists and is referenced in STATE.md — verify it's the same shape we want or whether it needs adaptation.
- Stock overview: single-view (eye icon) for quick inspection of one product's stock state without leaving the list.

Low risk, sharp UX win, ships in one cycle.

### B. CSV import: broader user-facing reason sanitization (backend, medium)
The narrow Codex finding from 2026-04-29 (`5606dd4`) sanitized only the savepoint-cleanup error path — `result.errors[].reason` for non-cleanup row errors (Prisma constraint violations, raw SQL parse errors, location/variant resolution errors that wrap a driver error) still passes raw `err.message` content from `extractErrorMessage`. Closes the info-disclosure surface.

**Pre-cycle design call needed** (do this in the planning chat, not in the prompt): how granular should operator-facing messages be? Proposed two-tier:
- **Whitelist of operator-actionable classes:** "barcode not found", "storage location not allowed", "row skipped — duplicate".
- **Everything else** → "data integrity violation, see logs". Server-side `request.log.error({ err })` keeps the full cause chain.

Estimated >30 LOC + a small `lib/error-sanitize.ts` helper. Affected file: `apps/api/src/routes/csv/index.ts`.

### C. CSV import UX edge-cases (frontend + small backend, optional — last cycle before merge)
- P2002 (concurrent write) → "row skipped — concurrent write" instead of generic "Unknown error".
- Friendlier "storage-location name not found" surface for the narrow remaining cases (post-FIXES6, unknown bins auto-create; only permission/feature-flag denials remain).

Polish on the most-touched feature. Optional — if A and B land cleanly we can also choose to merge straight to `main` and bundle these into a post-merge cleanup cycle.

## 🟡 Later (post-merge, post-review)

After the `develop` → `main` merge and Sebastian's frontend review:

- CSV stock export (with separate export-template flow) — schema decision + full-stack cycle, 2–3 cycles.
- CSV mapping editor: re-run delimiter detection after user override.
- Server-side sorting (currently client-side; backend ignores `sortBy` / `sortDir`).
- Bulk-select + bulk-delete for stock page.
- Marketplace mutation toasts under masked-success transport failures — pre/post-state-diff layer (Codex 2026-04-29 round-2 deferral).
- Marketplace integration rename after install (PATCH constraint or dedicated endpoint).
- Identity-lock list-view completeness (`hasExternalReferences` on list endpoint).
