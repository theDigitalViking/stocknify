# RESULT: 2-D Production Review Fixes

**Prompt:** `prompts/PROMPT_2-D_PRODUCTION_REVIEW_FIXES.md`
**Notion:** https://www.notion.so/35724fe1d88a81ea8d9ac092c2e16702
**Branch:** `develop`
**Last commit:** (pending — see push step)
**Date:** 2026-05-05

---

## Summary

Six purely visual/UX fixes from Sebastian's production review of Batch 2: sticky page headers across all dashboard pages (R1), reliable variant-row highlight via inset box-shadow + `bg-brand-100` (R2), chart tick formatter now keys off the user-selected range instead of the data spread (R3), "View movements" button moved to the stock-table section and made variant-aware (R4), reusable `HorizontalScrollFade` indicator wrapped around the Quick-View Sheet's stock table (R5), sidebar identity block showing org name + user + plan badge on both desktop and mobile sidebars (R6). No backend changes, no schema changes, no new endpoints. Frontend typecheck + build green.

## Files changed

- `apps/web/src/components/shared/page-header.tsx` — sticky by default at `top-0 z-20 bg-background`; new `noSticky` opt-out for pages that wrap their own sticky region
- `apps/web/src/app/(dashboard)/products/[id]/page.tsx` — breadcrumb wrapper made sticky; variant-row highlight switched to `shadow-[inset_4px_0_0_0_#0d9488]` + `bg-brand-100`; "View movements" button moved out of the page header and next to the "Aktueller Bestand" section, with variant-aware URL (`&variantId={selectedVariantId}` when selected)
- `apps/web/src/app/(dashboard)/products/import/page.tsx` — breadcrumb wrapper made sticky
- `apps/web/src/app/(dashboard)/stock/import/page.tsx` — breadcrumb wrapper made sticky
- `apps/web/src/app/(dashboard)/stock/movements/page.tsx` — breadcrumb + PageHeader wrapped in a single sticky parent with PageHeader marked `noSticky`; passes `selectedRangeMs` (computed from `to - from`) into the chart for tick granularity
- `apps/web/src/components/stock/stock-movement-chart.tsx` — added `selectedRangeMs?: number` to both branches of the `{movements} | {series}` discriminated-union prop type; range used for tick formatting now prefers `selectedRangeMs` over data spread
- `apps/web/src/components/shared/horizontal-scroll-fade.tsx` — NEW reusable wrapper with right-edge gradient driven by scroll position + ResizeObserver
- `apps/web/src/components/products/product-stock-table.tsx` — wrapped table in `HorizontalScrollFade`
- `apps/web/src/components/shared/plan-badge.tsx` — NEW compact plan pill, four brand-tinted tiers
- `apps/web/src/lib/api/use-auth-user.ts` — NEW TanStack-cached hook around `supabase.auth.getUser()` returning `{ id, email, displayName }`
- `apps/web/src/components/shared/sidebar.tsx` — identity block now shows org name + plan badge on one line and user display name below; collapsed state unchanged
- `apps/web/src/components/shared/mobile-sidebar.tsx` — same identity block treatment as desktop sidebar
- `apps/web/messages/en.json` + `apps/web/messages/de.json` — new `nav.plans.{trial,starter,growth,enterprise}` keys
- `prompts/_state/STATE.md` — Cycle 2-D bullet + Critical-paths additions for new files
- `prompts/results/RESULT_2-D_PRODUCTION_REVIEW_FIXES.md` — this file

## Key decisions made during execution

- **R1 sticky-header layering.** Most dashboard pages render only `<PageHeader>` at the top, so making `PageHeader` self-sticky covered the majority. Four pages prepend a custom breadcrumb-bar `<div>` (products/[id], products/import, stock/import, stock/movements). Of those, only `stock/movements` also renders `<PageHeader>` below the breadcrumb. To avoid two sticky layers fighting for `top-0`, that one page wraps both in a single `sticky top-0` parent and the inner `<PageHeader>` opts out with `noSticky`. The other three breadcrumb pages just got `sticky top-0` on the breadcrumb wrapper directly. Considered (and rejected) adding a `topOffsetClassName` prop because only one page needs the dual-layer behaviour.
- **R2 box-shadow over border-l.** The previous Cycle 2-A code applied `border-l-4 border-l-brand-600` to the `<tr>`. Tailwind's preflight sets `border-collapse: collapse` on tables, which suppresses tr-level borders entirely — that's why the highlight wasn't visible on production despite the class being applied. `shadow-[inset_4px_0_0_0_#0d9488]` paints reliably regardless of collapse mode, doesn't shift cell padding, and survives hover. Bumped the row tint from `bg-brand-50` (#f0fdfa) to `bg-brand-100` (#ccfbf1) for clearly visible contrast on white.
- **R3 selectedRangeMs prop.** Considered adding `from`/`to` props to the chart and computing the diff inside, but the chart only needs the magnitude of the window for tick granularity — passing the precomputed ms is more direct and lets the page's `useMemo` cache the calculation alongside the existing range state. Custom same-day picks still hit the `≤ 24h` HH:mm branch since `from` (00:00:00.000) → `to` (23:59:59.999) ≈ 1d - 1ms.
- **R4 button placement.** Moved next to the "Aktueller Bestand" section heading inside a `flex items-center justify-between` wrapper. Variant-awareness uses the existing `selectedVariantId` state — when null (no variant pre-selected), the URL omits `variantId` and the movements page shows the all-variants view; when set, it threads through. No new state was introduced.
- **R5 reusable component.** Built as `HorizontalScrollFade` rather than inlining in `ProductStockTable` because the variant table on `[id]` and other tables across the app share the same `overflow-x-auto + min-w-[…]` shape — the wrapper is now available without further work, even though only `ProductStockTable` uses it in this cycle.
- **R6 user-data source.** New `useAuthUser` hook wraps `supabase.auth.getUser()` in a TanStack query (5min staleTime). Settings page's existing inline pattern was kept (it's its own page-scoped lookup). Display name composes from `user_metadata.firstName + lastName` (the registration flow asks for both), falling back to `fullName`, falling back to email so the slot is never blank for a signed-in user.
- **Plan badge styling.** Four tiers, escalating brand tint: trial → muted gray (`bg-muted text-muted-foreground`), starter → `bg-brand-50 text-brand-700`, growth → `bg-brand-100 text-brand-800`, enterprise → `bg-brand-600 text-white`. Compact `px-1.5 py-0.5 rounded text-[10px]` so the right-aligned pill doesn't dominate the org name.

## Skipped or deferred

- **`HorizontalScrollFade` not applied to other tables yet.** Variant table on `[id]` page, products list, stock list, and integrations table all use the same `overflow-x-auto + min-w` shape. Out of cycle scope (prompt names only the Quick-View Sheet table). The wrapper is reusable so adopting it elsewhere is a one-import drop-in.
- **No "scrolled" shadow on sticky header.** Prompt offered `shadow-sm` or `border-b` as the visual-separation cue; the existing `border-b border-border` already serves that role on both `PageHeader` and the breadcrumb wrappers, so no extra shadow was added. A scroll-driven shadow would need a JS scroll listener for marginal benefit.
- **Mobile top bar not made sticky.** Prompt scoped sticky behaviour to "header (breadcrumbs, back button, title)". The mobile-only `MobileTopBar` (Stocknify logo + menu button) sits above the page header on mobile and was deliberately left alone — it's a navigation chrome layer, not a page header.

## Tests

Frontend cycle, no backend touch — backend test suite (12 tests) untouched and assumed green per Cycle 2-C. `pnpm -C apps/web typecheck` + `pnpm -C apps/web build` both green. Per WORKFLOW + KNOWN_TODOS testing strategy, frontend tests stay out of scope until backend test discipline has held for ≥3 cycles post-TH.

## Codex review

`review:skip` per the prompt's classification (purely visual fixes, verifiable by eye on the Vercel Preview). No Codex review run.

## Memory Bank updates

- [x] `STATE.md` updated
- [x] `KNOWN_TODOS.md` — N/A (no new deferrals; existing entries are out of cycle scope)
- [x] Notion entry → ✅ Ausgeführt (https://www.notion.so/35724fe1d88a81ea8d9ac092c2e16702 — flipped after push)
- [x] This result file written
