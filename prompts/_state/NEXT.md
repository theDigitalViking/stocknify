# Stocknify — Next Up

> Top 3-5 next steps, prioritized. Updated by Claude (Chat) at the end of every cycle. Always answers: "if I had 90 minutes right now, what would I do?"

**Last updated:** 2026-04-30 (CSV_ERROR_SANITIZATION cycle prepared — bundles broad-scope sanitization + P2002 mapping, last cycle before develop → main merge)

---

## Context

We're in **stabilization mode** before the next `develop` → `main` merge. The plan agreed with Sebastian:

1. Marketplace polish 2 — **DONE** (2026-04-29). Install-name persistence, uninstall UI, toggle failure toast, logo fallback all on `develop`.
2. Stock-overview navigation polish — **DONE** (2026-04-30). SKU link + Quick-View Eye-Button on `develop`.
3. CSV reason-sanitization broader scope + P2002 mapping — **PROMPT WRITTEN** (PROMPT_CSV_ERROR_SANITIZATION.md). Bundles former Tracks B and C — see "Active cycle" below.
4. After cycle 3 ships → Sebastian merges `develop` → `main` and reviews the deployed frontend.

New features (CSV stock export, server-side sort, etc.) are deliberately deferred until after the merge + review pass.

---

## 🟢 Active cycle

### CSV_ERROR_SANITIZATION — broad row-error sanitization + custom error classes
- **Prompt:** `prompts/PROMPT_CSV_ERROR_SANITIZATION.md`
- **Notion:** https://app.notion.com/p/35124fe1d88a81fc936afd00f7fd66b9
- **Scope:** New `apps/api/src/lib/csv-errors.ts` module with four error classes (`VariantNotFoundError`, `InvalidNumberError`, `InvalidDateError`, `StockLevelInvariantError`) and a `sanitizeRowError` helper. Both per-row catches in `csv/index.ts` route through the sanitizer. Whitelist: actionable strings (variant not found, invalid number, invalid date) + Prisma codes (P2002 → "Row skipped — concurrent write detected", P2000 → "Field value exceeds the allowed length", P2025 → "Required record not found"). Generic fallback: "Data integrity violation — see server logs". Invalid `expiryDate` for batched products becomes an explicit row error instead of silent null. UUID-leaking invariant message in `upsertStockLevel` is replaced with a custom error class.
- **Behavior changes (intentional):** Invalid expiryDate is no longer silent; `Invalid quantity: "X"` reason text becomes `Invalid number for field "quantity": "X"` for consistency.
- **Decisions taken upstream (in the planning chat, locked into the prompt):**
  - Refactor scope: Custom error classes + Prisma code mapping (~80–120 LOC).
  - Whitelist: 3 application-layer classes + invalid-number/date format + field-too-long via P2000.
  - i18n: English literals stay; translation cycle deferred post-merge.
  - Bundle Track B + Track C in one cycle; ship before the merge.
- **Estimate:** Single cycle. Codex review before push — likely surfaces around AggregateError nesting and behavior-change for invalid dates.

---

## 🟡 Next after the merge

After cycle 3 ships and Sebastian merges `develop` → `main`:

1. **Frontend review pass.** Sebastian walks the deployed app (production-Vercel + production-Hetzner) and surfaces anything that needs polish.
2. **CSV stock export.** Schema decision (export-template flow distinct from import templates per DECISIONS 2026-04-18) + full-stack cycle. 2–3 cycles.
3. **CSV i18n migration.** Move the row-error reasons from English literals to translatable error codes. Scope follow-up to the sanitization cycle.

## 🟠 Backlog (post-merge, lower priority)

- CSV mapping editor: re-run delimiter detection after user override.
- Server-side sorting (currently client-side; backend ignores `sortBy` / `sortDir`).
- Bulk-select + bulk-delete for stock page.
- Marketplace mutation toasts under masked-success transport failures — pre/post-state-diff layer (Codex 2026-04-29 round-2 deferral).
- Marketplace integration rename after install (PATCH constraint or dedicated endpoint).
- Identity-lock list-view completeness (`hasExternalReferences` on list endpoint).
- Stock list `productId` deploy-skew defensive guard (Codex 2026-04-30 deferral).
- CSV stock import: storage-location silent fallback (still in KNOWN_TODOS — narrow surface, MVP-tolerable).
- CSV stock import: dry-run "created" mismatch for batched rows.
- CSV stock import: `batchTracking=false` silently drops batch columns.
