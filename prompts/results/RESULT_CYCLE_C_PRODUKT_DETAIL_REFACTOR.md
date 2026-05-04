# RESULT: Cycle C — Produkt-Detailseite Refactor

**Prompt:** `prompts/PROMPT_CYCLE_C_PRODUKT_DETAIL_REFACTOR.md`
**Notion:** https://www.notion.so/35624fe1d88a81138061fc38bb89d355
**Branch:** `develop`
**Last commit (frontend):** `c14eea2` — feat(products): Cycle C — variant table drives product detail page
**R0 commit:** `c592907` — fix(ci): track Prisma migrations so test harness can apply them
**Date:** 2026-05-04

---

## Summary

Cycle C restructured the product detail page so the variant table acts as the steering element for the lower sections, cleaned up the header affordance (no SKU/EAN/Barcode/source-icon, labelled Edit/Delete buttons), and added a Source column to the variant table. R0 fixed the CI test-harness migration path by simply un-gitignoring `apps/api/src/db/migrations/` — locally the directory existed but was never committed, so CI was running `prisma migrate deploy` against an empty migrations folder. The fix is two-line: drop the line from `.gitignore` and commit the five existing migration files plus `migration_lock.toml`.

## Files changed

### R0 (CI / infra)
- `.gitignore` — removed `apps/api/src/db/migrations/`. Prisma's own `migration_lock.toml` says migrations belong in version control; the scaffold default was wrong.
- `apps/api/src/db/migrations/**` (6 files) — five migration directories + `migration_lock.toml` newly tracked. No content change.

### R1–R5 (frontend)
- `apps/web/src/app/(dashboard)/products/[id]/page.tsx` — main refactor target. Header now only renders name/description/unit/batch-tracked. SKU and Barcode `MetaItem`s removed. `<ProductSourceIcons>` removed from the header. Icon-only `<button>` Edit/Delete replaced with labelled `<Button>` (`outline` + `destructive`). New `selectedVariantId` `useState` + `useEffect` that defaults to the first variant id once the product loads. Variant rows are clickable (`onClick`, keyboard handler for Enter/Space, `tabIndex={0}`, `role="button"`, `aria-selected`) with a brand-tinted highlight when selected. New "Quelle / Source" column rendered between Barcode and Status. The stock section now passes `variantId={selectedVariantId ?? undefined}` to `<ProductStockTable>`.
- `apps/web/src/components/products/product-source-icons.tsx` — added an optional `source: string | null` prop alongside the existing `metadata`. When `source` is passed, it short-circuits the metadata extraction. Component shape unchanged for existing callers.
- `apps/web/src/components/products/product-stock-table.tsx` — added an optional `variantId?: string` prop, forwarded to `useStock({ productId, variantId })`. The hook already supported per-variant filtering server-side, so no API change was needed.
- `apps/web/messages/en.json`, `apps/web/messages/de.json` — removed unused `products.detail.editProduct` and `products.detail.deleteProduct` keys (those were the icon-button tooltips, no longer present after R3).

## Key decisions made during execution

- **R0 root cause was gitignore, not Prisma config.** The prompt suggested the issue might be `--schema` flag or `prisma db push` vs `migrate deploy`. The actual root cause was simpler: `.gitignore` line 19 listed `apps/api/src/db/migrations/`, so the migrations directory was never committed and CI checkouts had nothing to deploy. The `--schema src/db/schema.prisma` flag in `global-setup.ts` was already correct. Fix is removing the gitignore line and committing the existing migrations.
- **Per-variant source = product source for now.** The original triage entry for #7 (R4) cites "CSV-Hauptprodukt + manuell hinzugefügte Variante" as the motivating case for a per-variant source column. But `ProductVariant` (in `packages/shared/src/types/index.ts` and `apps/api/src/db/schema.prisma`) has no `metadata` or `source` field — only `attributes` for color/size. So today every variant of a given product genuinely has the same source. I rendered the column using the product's source for every row and made `ProductSourceIcons` accept an explicit `source` prop so the wiring is ready when variants gain their own source field. Tracked as a deferred KNOWN_TODO so the column doesn't ship with hidden faux-data later.
- **Auto-select first variant on load (incl. multi-variant products).** The prompt said single-variant products auto-select and gave latitude on multi-variant ("show all (or a prompt to select one)"). I picked first-variant-auto-selected for both cases — it's the friendlier default, doesn't require a new "no variant selected" empty-state translation, and matches the operator mental model of clicking through variants rather than enabling a global view.
- **Auto-select default uses lazy state init via `useEffect`.** `useState(null)` + a `useEffect` keyed off `firstVariantId` that only assigns when current state is still null. This keeps the user's manual selection intact across React Query refetches that re-emit the same product object — the `setSelectedVariantId((current) => current ?? firstVariantId)` guard prevents the auto-select from clobbering a deliberate click.
- **Integrations section stays a placeholder.** Per Non-goals in the prompt, the per-variant integration section is deferred. The stock section is the only thing that reacts to `selectedVariantId` today. Both sections sit below the variant table, so when the integration section becomes real it will slot into the same variant-reactive position.

## Skipped or deferred

- **Per-variant source data.** Schema work — added to `KNOWN_TODOS.md`. Today the column shows the product's source for every variant row.
- **Variant-reactive integration section.** Explicit non-goal. Tracked in NEXT.md backlog area; will land alongside real integration data per variant.
- **Backend test for variant filtering on `GET /stock`.** The hook already supports `variantId`, but no harness test pins the contract. Per testing-strategy decision, this would be added when the touched endpoint surface is the focus of a future cycle. R5's frontend wiring exercises an existing endpoint behaviour, so no new test is mandated by Cycle C scope.
- **Visual browser verification.** Frontend cycle running against the existing API in a Next.js dev server is Sebastian's review step on Vercel Preview after push. Local typecheck + lint pass; no in-browser smoke run from the agent.

## Tests

- `pnpm -C apps/api test` — 4 / 4 green (2 smoke + 2 upsert-stock-level). Verified twice: once after R0 to confirm the migration path resolves, once at end-of-cycle.
- `pnpm -C apps/web typecheck` — clean.
- `pnpm -C apps/web lint` — clean.
- `pnpm -C apps/api typecheck` — clean (touched indirectly by R0; no API code changed).

## Codex review

Not run for this cycle. The prompt marked Codex as optional for a frontend-only cycle, recommended only if data-flow logic (R5) felt risky. R5's logic is small: a `selectedVariantId` state, a `useEffect` defaulting to the first variant, and one new prop forwarded to an existing query hook. No security or correctness surface; deferring Codex is consistent with DECISIONS 2026-04-16 + the prompt's own guidance.

## Memory Bank updates

- [x] `STATE.md` updated
- [x] `KNOWN_TODOS.md` updated
- [x] Notion entry → ✅ Ausgeführt
- [x] This result file written
