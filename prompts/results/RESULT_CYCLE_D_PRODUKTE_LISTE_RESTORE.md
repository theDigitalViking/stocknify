# RESULT: Cycle D — Produkte-Liste Polish + Soft-Delete Restore

**Prompt:** `prompts/PROMPT_CYCLE_D_PRODUKTE_LISTE_RESTORE.md`
**Notion:** https://www.notion.so/35624fe1d88a8185bfd0c8b5a273f2c8
**Branch:** develop
**Last commit:** TBD (filled in by the commit step)
**Date:** 2026-05-04

---

## Summary

Soft-deleted products can now be brought back. New `POST /products/:id/restore` endpoint
restores the product and its cascade variants (variants whose `deletedAt` matches the product's
`deletedAt`); RLS isolation enforced; `GET /products` learned an `includeDeleted=true` query
param that returns active + deleted in one merged list. The product list page gets an Eye icon
to the detail page on every row, and a confirm-dialog restore action on deleted rows. Four
backend tests pin the new endpoint behaviour (happy path + variant cascade, already-active 404,
cross-tenant 404) plus the `includeDeleted` semantics. All tests green; backend + frontend
typecheck + lint clean.

## Files changed

### Backend
- `apps/api/src/routes/products/index.ts` — renamed list query param `showDeleted` → `includeDeleted` and changed semantics from "deleted-only view" to "include both active and deleted"; added `POST /products/:id/restore` handler with cascade-variant restore (matches `deletedAt` so independently-deleted variants are not resurrected).
- `apps/api/src/routes/products/__tests__/restore.test.ts` — new file. Four tests across two describe blocks: restore happy path (incl. variant cascade), already-active 404 with `PRODUCT_NOT_FOUND`, cross-tenant 404, and `includeDeleted` query-param semantics.

### Frontend
- `apps/web/src/lib/api/use-products.ts` — `ProductFilters.showDeleted` → `includeDeleted`; new `useRestoreProduct()` mutation hook hitting `POST /products/:id/restore`, invalidates `['products']` + `['products', id]` on success.
- `apps/web/src/components/products/restore-product-dialog.tsx` — new component, mirrors `DeleteProductDialog` shape with `useRestoreProduct` and the new `restoreConfirm.*` translations.
- `apps/web/src/app/(dashboard)/products/page.tsx` — Eye icon (lucide `Eye`) added as leftmost action on every row; deleted rows render a "Gelöscht / Deleted" badge + line-through; restore action (`RotateCcw`) replaces edit + delete on deleted rows; bulk-select checkbox is hidden for deleted rows so they cannot slip into bulk-delete; toolbar toggle now switches to merged-view (active + deleted) instead of deleted-only-view.
- `apps/web/messages/en.json` + `apps/web/messages/de.json` — new keys: `products.deletedBadge`, `products.viewDetails`, `products.restore`, and the full `products.restoreConfirm.*` block.

## Key decisions made during execution

1. **Renamed `showDeleted` → `includeDeleted` and changed semantics.** The pre-existing list query was `?showDeleted=true` returning **only** deleted products (a tab-like "trash bin" view). Prompt R2 specifies `?includeDeleted=true` returning both active + deleted. Rather than carry both params, I renamed and re-pointed the existing one. The frontend toolbar toggle was repurposed from "switch to deleted-only view" to "include deleted in the merged list". Visual distinction (line-through name + Deleted badge + muted bulk-select checkbox) is what the prompt R5 explicitly requested.
2. **Cascade-variant restore is bounded by `deletedAt = product.deletedAt`.** A naive `WHERE productId = … AND deletedAt IS NOT NULL` would also restore variants that the operator had soft-deleted **before** the product itself was deleted (and therefore should stay deleted). Anchoring to the product's `deletedAt` snapshot restores exactly the cascade slice that was created by the DELETE handler. Tested explicitly (`earlyDeletedVariantId` in the happy-path test).
3. **404 on already-active restore uses code `PRODUCT_NOT_FOUND`, not a distinct code.** Prompt asked to avoid existence enumeration. Using the same code/message for "wrong tenant" and "already active" keeps the 404 surface uniform.
4. **Bulk-select checkbox hidden (not just disabled) on deleted rows.** A disabled checkbox would still appear in the select-all set otherwise, and `useDeleteProducts` would 404 on deleted ids. Hiding it (with an `aria-hidden` spacer to keep alignment) is the cheaper, clearer UX.

## Skipped or deferred

- **Time-limited restore window** — out of scope per prompt non-goals. No expiry policy; soft-deleted rows can be restored indefinitely.
- **Bulk-restore** — out of scope per prompt non-goals; single-product restore only.
- **Hard-delete** — Stocknify policy is soft-delete everywhere; out of scope.
- **`useDeleteProducts` 404 handling for any deleted ids that slip in** — defended above by hiding the checkbox; not pursued further.
- **Restoring stock_levels** — `DELETE /products/:id` removes `stock_levels` rows outright (no soft-delete column on that table). Restore brings the product + variants back but stock starts empty again. This is an intentional consequence of the existing delete design and was not in scope to revisit; documented in KNOWN_TODOS.

## Tests

`pnpm -C apps/api test`:
```
Test Files  3 passed (3)
Tests       8 passed (8)
```
Breakdown:
- `src/routes/products/__tests__/restore.test.ts` — 4 tests (new):
  - restore happy path with variant cascade (incl. early-deleted variant left untouched)
  - already-active product → 404 `PRODUCT_NOT_FOUND`
  - cross-tenant restore → 404 `PRODUCT_NOT_FOUND`, source row stays deleted
  - `GET /products` default omits deleted, `?includeDeleted=true` returns both with `deletedAt`
- `src/services/stock/__tests__/upsert-stock-level.test.ts` — 2 tests (Cycle B, unchanged) ✅
- `src/test/smoke.test.ts` — 2 tests (TH, unchanged) ✅

`pnpm -C apps/api typecheck` ✅
`pnpm -C apps/web typecheck` ✅
Lint: pre-existing `import/order` warnings only — no new errors.

## Codex review

Skipped at Sebastian's direction during the cycle. Not run.

## Memory Bank updates

- [x] `STATE.md` updated
- [x] `KNOWN_TODOS.md` updated
- [x] `DECISIONS.md` updated
- [x] Notion entry → ✅ Ausgeführt (manual flip via Claude Chat / Notion-MCP)
- [x] This result file written
