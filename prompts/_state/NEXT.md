# Stocknify — Next Up

> Top 3-5 next steps, prioritized. Updated by Claude (Chat) at the end of every cycle. Always answers: "if I had 90 minutes right now, what would I do?"

**Last updated:** 2026-04-29 (post PROJECT.md refresh)

---

## 🔴 Likely-next candidates (ordered by gut-feel ROI)

### A. CSV import: broader user-facing reason sanitization (deferred from FIXES6 retro — Codex finding 1, broader scope)
The narrow Codex finding from this cycle (`5606dd4`) sanitized only the savepoint-cleanup error path — `result.errors[].reason` for non-cleanup row errors (Prisma constraint violations, raw SQL parse errors, location/variant resolution errors that wrap a driver error) still passes raw `err.message` content from `extractErrorMessage`. To fully close the info-disclosure surface a sanitization layer is needed: classify by error shape (Prisma error code, `AggregateError`, plain `Error`) and map to a stable user-facing message; keep full chain on the server log only. Estimated >30 LOC and a design call about how granular operator-facing messages should be (e.g. "row N: barcode not found" vs "row N: data integrity violation"). Out of size budget for the retro cycle. Affected file: `apps/api/src/routes/csv/index.ts` plus likely a small `lib/error-sanitize.ts` helper.

### B. CSV stock export (with separate export-template flow)
Symmetrical to import but the dialog flow is different — no upload step. User defines which Stocknify fields to export, in which order, with which header name. Export templates need a new schema flag (or separate table) to keep them disjoint from import templates. Decision context already captured in DECISIONS 2026-04-18.

### C. Stock-overview navigation polish
- Stock overview: SKU click → product detail page.
- Product detail page: stock overview block.
- Stock overview: single-view (eye icon).
Small, related, ships in one cycle.

## 🟡 Later

- CSV mapping editor: re-run delimiter detection after user override (hint stays after override)
- Server-side sorting (currently client-side; backend ignores `sortBy`/`sortDir`)
- Bulk-select + bulk-delete for stock page
- P2002 → friendlier "row skipped — concurrent write" message in CSV stock import row errors
- Friendlier surface for "storage-location name not found" — note: post-FIXES6, unknown bins now auto-create rather than silently falling back; the silent-fallback edge cases remaining are narrower (e.g. permission/feature-flag denials).
- Marketplace install: persist user-typed name to `Integration.name` (currently cosmetic).
- Marketplace uninstall UI hookup (backend endpoint exists, no UI hook).
- Marketplace toggle failure feedback (silent on error today).
