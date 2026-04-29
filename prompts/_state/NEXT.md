# Stocknify — Next Up

> Top 3-5 next steps, prioritized. Updated by Claude (Chat) at the end of every cycle. Always answers: "if I had 90 minutes right now, what would I do?"

**Last updated:** 2026-04-29

---

## ⚠️ Cycle-planning needed

The last cycle (`STOCK_FIXES2_REVIEW2` / batch-expiry UTC fix, commit `e86cc7b`) was 8 days ago. The previous handover summary's "next steps" are largely stale: CSV encoding, CSV stock import, marketplace polish (`c37acca`), CSV required-field rework, `batchTracking` rename, sidebar logo link, and CSV dialog focus-ring clipping have all shipped. Sebastian and Claude (Chat) should pick the next cycle from the candidates below at the start of the next session.

## 🔴 Likely-next candidates (ordered by gut-feel ROI)

### A. CSV stock export (with separate export-template flow)
Symmetrical to import but the dialog flow is different — no upload step. User defines which Stocknify fields to export, in which order, with which header name. Export templates need a new schema flag (or separate table) to keep them disjoint from import templates. Decision context already captured in DECISIONS 2026-04-18.

### B. Refresh PROJECT.md
Static SoT predates everything from 2026-04-21+. Phase 4 section needs the encoding + stock-import additions, the post-FIXES6 import-button/route + stock-page column work, marketplace polish, and the new system-key precheck. "Last updated" needs bumping. Cheap cycle, mostly docs.

### C. Codex review of CSV stock import FIXES6 (if not yet done)
Confirm with Sebastian whether the review was run on 04-21. If not: short cycle to run `/codex:adversarial-review --base HEAD~6 stock import` and triage. Note that 4 subsequent cycles built on FIXES6 without surfacing a regression — review priority is lower than it would have been on the day of.

### D. Stock-overview navigation polish
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
