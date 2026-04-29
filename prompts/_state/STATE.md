# Stocknify — Current State

> Live snapshot of where the project is. Updated automatically by Claude Code at the end of every prompt run, plus manually by Claude (Chat) after reviews. Read this first at the start of every session.

**Last updated:** 2026-04-29 (Codex review of CSV stock import FIXES6 retro — HEAD `5606dd4`)
**Active phase:** Phase 4 — CSV import/export
**Live URL:** https://app.stocknify.app
**API health:** https://api.stocknify.app/v1/health

---

## What's deployed and working

- All Phase 3A/3B/3C work shipped: auth webhook, tenant provisioning, dashboard, products, stock, integrations skeleton, rules placeholder, notifications placeholder, settings.
- **Phase 4 CSV product import is live** — backend (mapping templates CRUD, preview, import with EAN/SKU matching, dry-run, error report, OOM-safe streaming parser) and frontend (integrations page with two tabs, drag-and-drop upload, mapping template editor with 2-step flow + live preview, `/products/import` route).
- **CSV encoding support is live (2026-04-18).** `iconv-lite` decodes ISO-8859-1 / Windows-1252 / UTF-8 buffers before the streaming parser. Encoding source precedence: template > request field > `'utf-8'` default. Unknown encodings silently fall back to UTF-8 (see KNOWN_TODOS).
- **CSV required-field rules finalized (2026-04-18).** Name + SKU + Barcode required + CSV-column only; Beschreibung optional + no fixed value; Kategorie removed from mapping (still in schema); Einheit optional + fixed value allowed. `batchTracking` renamed to "MHD- / chargengeführt" (DE) / "Best-before / Batch tracked" (EN). Sidebar logo links to `/products`. CSV dialog focus-ring clipping fixed.
- **CSV stock import is live (2026-04-21, 6 fix iterations).** Backend `POST /integrations/csv/import/stock`, `STOCK_IMPORT_FIELDS` + `buildStockExtractor`, variant resolution barcode-first → SKU, `upsertStockLevel` writing `stock_movements` audit rows (movementType `'sync'`), comma-decimal quantities. Frontend: `useImportStock` hook, resourceType-aware `MappingTemplateDialog`, stock tab in `CsvImportPanel`. i18n keys for stock fields in en + de. Last cycle (FIXES6) inverted savepoint cleanup-error precedence and added `extractErrorMessage` helper for cause-chain logging on row-level errors.
- **CSV import surface expanded (post-FIXES6, 2026-04-21):**
  - **Import buttons on toolbars:** Products and Stock list pages each carry an "Import" button in the toolbar; dedicated routes `/products/import` and `/stock/import` host the panel.
  - **Resource-toggle UX:** when the resource type is fixed (route-driven), the toggle is hidden; the panel renders only the active tab.
  - **Stock import auto-create:** unknown storage-location names create the bin on the fly; stock-type fallback to system defaults; Lagerplatz filter on stock page.
  - **Stock page Lager/Lagerplatz columns + filters** and a per-product stock table.
  - **Stock-type system-key precheck:** import no longer creates duplicate tenant-scoped rows for system keys (e.g. `available`, `reserved`); see DECISIONS 2026-04-21 (precheck).
  - **Batch column on stock page** (batch number + locale-formatted expiry); expiry rendered timezone-safe via `YYYY-MM-DD` parsing to avoid off-by-one in negative UTC offsets.
- **CSV import row error reasons sanitized (2026-04-29, commit `5606dd4`).** Both savepoint-cleanup catches (`upsertStockLevel` + stock-type precheck) now throw `AggregateError(stable message, [cleanupErr, insertErr])` instead of embedding `cleanupErr.message` directly. `result.errors[].reason` no longer leaks driver/SQL internals to API callers. Both row-loop catches now also call `request.log.error({ err, row })` so the full cause chain reaches server-side logs via pino's err serializer. Resolves the high-severity Codex finding from the FIXES6 retro review.
- **Marketplace + App Store is live (2026-04-21).** Page at `/integrations/marketplace` with installed-integration cards (logo, name, category, status badge, enable/disable Switch). "Add integration" opens the App-Store modal — category sidebar (all / shop / erp / wms / fulfiller), search, install button. `MarketplaceInstallDialog` is a generic install shell with a name input and a placeholder settings block (per-integration OAuth/API-key UI is future work). `IntegrationLogoPlaceholder` SVG fallback for entries without a logo. Hooks: `useMarketplaceCatalog`, `useInstallIntegration`, `useToggleIntegration`. New `Badge` UI primitive. **Marketplace polish shipped (commit `c37acca`):** WMS category label + fixed App-Store modal height. Identity-lock for product SKU/EAN: a `LOCKED_SOURCES = {sftp, ftp}` set + any external reference triggers a 409 `PRODUCT_IDENTITY_LOCKED` on PATCH. CSV-imported products are explicitly NOT locked.
- Sidebar is collapsible (desktop) + mobile drawer + responsive top bar.
- Navigation order: Produkte → Bestand → Integrationen → Regeln → Benachrichtigungen → Einstellungen.
- Root URL redirects to `/products` (middleware + page.tsx).
- Registration flow includes Vorname / Nachname / Firmenname.
- Stock types restricted to tenant-relevant types (backend-side filter).

## What's in flight

Nothing.

## What's uncommitted

User-intentional edits sit in working tree on `.gitignore` (extended ignore list for legacy template files + `test-data/bestandsimport_test.csv`) and `WORKFLOW.md` (added "Bootstrap prompt for Claude (Chat)" section). Untracked: `test-data/`. HEAD = `5606dd4` "fix: sanitize csv import row reasons + log row failures (codex review FIXES6 retro)".

## Critical paths

| File | Role |
|------|------|
| `PROJECT.md` | Single source of truth, architecture (static; stale, see KNOWN_TODOS) |
| `apps/api/src/routes/csv/index.ts` | All CSV backend routes + `parseCsvStreaming` + stock-type system-key precheck |
| `apps/api/src/lib/supabase-admin.ts` | Shared `getSupabaseAdmin()` helper |
| `apps/api/src/routes/auth/index.ts` | Auth webhook (production-ready) |
| `apps/api/src/db/schema.prisma` | Schema v4 |
| `apps/api/src/db/run-manual-migrations.ts` | Auto-runs SQL + seeds post-deploy |
| `apps/web/src/app/(dashboard)/integrations/page.tsx` | CSV import UI (two tabs) |
| `apps/web/src/app/(dashboard)/products/import/page.tsx` | Products CSV import route |
| `apps/web/src/app/(dashboard)/stock/import/page.tsx` | Stock CSV import route |
| `apps/web/src/components/csv/` | All CSV frontend components |
| `apps/web/src/components/products/product-stock-table.tsx` | Per-product stock block |
| `apps/web/src/app/(dashboard)/stock/page.tsx` | Stock list w/ Lager/Lagerplatz/Batch columns + filters |
| `apps/web/src/components/shared/sidebar.tsx` | Collapsible sidebar |
| `apps/web/src/middleware.ts` | Supabase SSR auth + root → /products |

## Infrastructure

- Frontend: Vercel, auto-deploy from `main`
- Backend: Hetzner VPS at 178.104.175.191, Kamal-deployed
- DB: Supabase Postgres (managed), RLS-enforced
- CI/CD: GitHub Actions, runs `run-manual-migrations.ts` post-deploy automatically — no manual SQL in Supabase needed
