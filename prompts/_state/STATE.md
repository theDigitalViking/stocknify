# Stocknify — Current State

> Live snapshot of where the project is. Updated automatically by Claude Code at the end of every prompt run, plus manually by Claude (Chat) after reviews. Read this first at the start of every session.

**Last updated:** 2026-05-04 (Cycle B shipped — Bestände polish + identical-quantity now writes a stock_movements row; first cycle running with the Vitest harness)
**Active phase:** Phase 4 — CSV import/export
**Live URL:** https://app.stocknify.app
**API health:** https://api.stocknify.app/v1/health

---

## What's deployed and working

- **Cycle B — Bestände polish + identical-qty movement write (2026-05-04, commit `fc5036a`).** `upsertStockLevel` extracted from `apps/api/src/routes/csv/index.ts` into `apps/api/src/services/stock/upsert-stock-level.ts`; the inline `if (currentQty.equals(newQty)) return 'skipped'` short-circuit is gone. New outcome type `'created' | 'updated' | 'unchanged'` — identical-quantity calls now bump `last_synced_at` on the level row and append a `stock_movements` row with `delta=0`. Caller in `csv/index.ts` rolls `'unchanged'` into the existing `result.updated` counter so the public CSV import response shape stays `{created, updated, skipped}` (no frontend break; `skipped` is now reserved for the dry-run-missing-location case). `isUniqueViolation` lifted to a new `apps/api/src/lib/db-errors.ts` so both csv and stock paths share the predicate without back-references. **First test under the Cycle TH harness:** `apps/api/src/services/stock/__tests__/upsert-stock-level.test.ts` — two cases (identical-quantity → two movement rows; non-zero delta → outcome `'updated'`). All four backend tests green (smoke + new). Frontend: stock list (`stock/page.tsx`) splits the combined "Charge (MHD)" column into separate `Charge` + `MHD` columns; three-dot dropdown collapsed into a disabled `Activity` icon button next to the existing Quick-View Eye button (target: Cycle E movement view); `ManualAdjustDialog` component, the `useUpsertStock` hook, and the entire `stock.adjust` + `stock.manualAdjust` i18n blocks (en+de) are gone. Quick-View `ProductStockTable` gained a `Bestandswert`/`Stock value` column rendering `—` (no cost field on `stock_levels`/`product_variants` yet — KNOWN_TODOS now tracks the cost-data dependency). Backend `PUT /stock` endpoint (manual adjust) is intentionally untouched per prompt scope.
- **Test-Harness Foundation shipped (2026-05-02).** Backend now has a Vitest harness against Postgres 16 in Docker (`apps/api/docker-compose.test.yml`, port 5433, named volume + healthcheck). `apps/api/.env.test` carries every var `config.ts` requires (incl. `SUPABASE_WEBHOOK_SECRET`, 64-hex `CREDENTIALS_ENCRYPTION_KEY`). `vitest.config.ts` runs sequentially (`pool: 'forks'`, `singleFork: true`) with dotenv loading `.env.test` before any test imports config. `src/test/global-setup.ts` runs `prisma migrate deploy` + the manual-migration runner; refuses to migrate against any DB other than `localhost`/`127.0.0.1:5433`. `src/test/setup.ts` truncates all 25 tenant-scoped tables in `beforeEach` (verified against `schema.prisma`). Helpers: `buildTestApp()`, `signTestJwt()` + `authedHeaders()` (real HS256 tokens — no `NODE_ENV==='test'` bypass anywhere in production code), `createTestTenant()`, shared `testDb` Prisma client. Smoke suite `src/test/smoke.test.ts` has two green tests: `GET /v1/health` (no auth, 200) + `GET /v1/products` for a fresh tenant (signed JWT, 200 + empty array). New scripts: `test:up`, `test:down`, `test:setup`. CI gets a `postgres:16-alpine` service container on 5433 and `continue-on-error: true` on the Test step (initial non-blocking window per testing-strategy decision; flip-to-blocking tracked in NEXT.md backlog after 5 cycles).
- **Marketplace install-name render fix (2026-05-02).** `GET /integrations/marketplace/catalog` now selects `Integration.name` and falls back to the static catalog default only when no installed row exists. Persisted custom names entered at install time now appear on the marketplace cards. Two-line read-path fix in `apps/api/src/routes/integrations/index.ts` (added `name: true` to the `select`; changed `name: entry.name` to `name: row?.name ?? entry.name` in the response mapper). Closes Bug #1 of the 2026-04-30 frontend triage.
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
- **PROJECT.md refreshed to Phase 4 reality (2026-04-29).** Section 5 `integrations` block gained marketplace + health fields (`is_enabled`, `marketplace_key`, `logo_url`, `category`, `health_status`, `last_successful_sync_at`, `last_error_at`, `consecutive_failures`, `sync_direction`); SQL paths corrected to `apps/api/src/db/sql/`. New "Tables defined in other sections" pointer table maps `external_references`/`csv_mapping_templates`/`integration_credentials`/`integration_schedules`/`notification_templates`/`incidents`/`partners` to their feature sections. Section 6 endpoint list grew CSV (`/csv-mappings*`, `/integrations/csv/*`) + Marketplace (`/integrations/marketplace/*`) clusters, plus `/storage-locations`, `/stock-types`, and `/products/:id/variants*`. Section 7 gained a Marketplace + identity-lock subsection. Section 13 documents auto-runner SQL deployment. Last-updated bumped to 2026-04-29; version → 0.7.0.
- **Marketplace polish 2 (2026-04-29).** Install dialog name is now persisted: `POST /integrations/marketplace/:key/install` accepts an optional `{ name }` body (Zod-validated), resolves to `parsed.data?.name?.trim() || entry.name`, and stores it on `Integration.name`. Marketplace cards expose a `MoreVertical` dropdown → confirm-dialog → `useUninstallIntegration` calling `DELETE /integrations/marketplace/:key/uninstall`. `useToggleIntegration` now passes an `onError` callback that shows a destructive toast with `t('toggleFailed')`; success path stays silent. All three logo render sites (card, install dialog, app-store modal — via a new inline `CatalogLogo` component) fall back to `IntegrationLogoPlaceholder` on `<img>` `onError` instead of vanishing. New i18n keys (`actions`, `uninstall*`, `toggleFailed`) shipped in en + de. PATCH name-immutability for marketplace integrations stays — rename-after-install is a separate cycle. See DECISIONS 2026-04-29 (Marketplace install name is now persisted).
- **Stock-overview navigation polish (2026-04-30).** SKU is now a link to the product detail page; an Eye-Button next to the row dropdown opens a right-side Quick-View sheet (product meta header — SKU, Barcode, Einheit, batch-tracking — plus the existing `ProductStockTable` and a "Zum Produkt" footer link). `GET /stock` response now includes `productId` (Prisma include already loaded `variant.product`). New shadcn `Sheet` primitive at `apps/web/src/components/ui/sheet.tsx` (Radix Dialog under the hood with `cva` slide variants) and a new `StockQuickViewSheet` component. New i18n keys under `stock.quickView` (en + de).
- **CSV row-error sanitization broadened (2026-04-30).** New `apps/api/src/lib/csv-errors.ts` with `VariantNotFoundError`, `InvalidNumberError`, `InvalidDateError`, `StockLevelInvariantError` classes and a `sanitizeRowError` helper. Both per-row catches in `csv/index.ts` now route through the sanitizer; `result.errors[].reason` is whitelisted to actionable strings (variant not found, invalid number, invalid date, P2002 concurrent write, P2000 length, P2025 missing record) or the generic `'Data integrity violation — see server logs'` fallback. Invalid `expiryDate` for batched products is now an explicit row error instead of silent null. UUID-leaking invariant message in `upsertStockLevel` is gone — IDs travel only on the `StockLevelInvariantError` instance, captured server-side via pino's err serializer. The legacy `extractErrorMessage` helper had zero remaining callers and was removed. Closes Codex's broad-scope follow-up to commit `5606dd4`.
- **Product detail page already renders `<ProductStockTable productId={id} />` (corrective entry).** This was in place from an earlier cycle; STATE.md previously didn't reflect it. Confirmed during the 2026-04-30 stock-overview polish pre-flight.
- **Marketplace + App Store is live (2026-04-21).** Page at `/integrations/marketplace` with installed-integration cards (logo, name, category, status badge, enable/disable Switch). "Add integration" opens the App-Store modal — category sidebar (all / shop / erp / wms / fulfiller), search, install button. `MarketplaceInstallDialog` is a generic install shell with a name input and a placeholder settings block (per-integration OAuth/API-key UI is future work). `IntegrationLogoPlaceholder` SVG fallback for entries without a logo. Hooks: `useMarketplaceCatalog`, `useInstallIntegration`, `useToggleIntegration`. New `Badge` UI primitive. **Marketplace polish shipped (commit `c37acca`):** WMS category label + fixed App-Store modal height. Identity-lock for product SKU/EAN: a `LOCKED_SOURCES = {sftp, ftp}` set + any external reference triggers a 409 `PRODUCT_IDENTITY_LOCKED` on PATCH. CSV-imported products are explicitly NOT locked.
- Sidebar is collapsible (desktop) + mobile drawer + responsive top bar.
- Navigation order: Produkte → Bestand → Integrationen → Regeln → Benachrichtigungen → Einstellungen.
- Root URL redirects to `/products` (middleware + page.tsx).
- Registration flow includes Vorname / Nachname / Firmenname.
- Stock types restricted to tenant-relevant types (backend-side filter).

## What's in flight

Nothing.

## What's uncommitted

User-intentional edits sit in working tree on `.gitignore` (extended ignore list for legacy template files). Untracked: `test-data/`. HEAD after this cycle's commits = Cycle B (`upsertStockLevel` extraction + identical-quantity behaviour change + first harness test + frontend Bestände polish) + memory bank update.

## Critical paths

| File | Role |
|------|------|
| `PROJECT.md` | Single source of truth, architecture |
| `apps/api/src/routes/csv/index.ts` | All CSV backend routes + `parseCsvStreaming` + stock-type system-key precheck + sanitized row errors |
| `apps/api/src/services/stock/upsert-stock-level.ts` | Stock-level upsert + paired stock_movements write (always, including delta=0 on identical-quantity) |
| `apps/api/src/lib/csv-errors.ts` | Custom row-error classes + `sanitizeRowError` whitelist for CSV imports |
| `apps/api/src/lib/db-errors.ts` | `isUniqueViolation` predicate shared across CSV + stock services |
| `apps/api/src/lib/supabase-admin.ts` | Shared `getSupabaseAdmin()` helper |
| `apps/api/src/routes/auth/index.ts` | Auth webhook (production-ready) |
| `apps/api/src/db/schema.prisma` | Schema v4 |
| `apps/api/src/db/run-manual-migrations.ts` | Auto-runs SQL + seeds post-deploy |
| `apps/web/src/app/(dashboard)/integrations/page.tsx` | CSV import UI (two tabs) |
| `apps/web/src/app/(dashboard)/products/import/page.tsx` | Products CSV import route |
| `apps/web/src/app/(dashboard)/stock/import/page.tsx` | Stock CSV import route |
| `apps/web/src/components/csv/` | All CSV frontend components |
| `apps/web/src/app/(dashboard)/stock/page.tsx` | Stock list w/ Lager/Lagerplatz/Charge/MHD columns + filters + SKU link + Quick-View Eye + Activity icon (placeholder for Cycle E movement view) |
| `apps/web/src/components/stock/stock-quick-view-sheet.tsx` | Right-side Quick-View sheet for stock list rows |
| `apps/web/src/components/products/product-stock-table.tsx` | Per-product stock table w/ Bestandswert column (placeholder until cost field exists) |
| `apps/web/src/components/ui/sheet.tsx` | shadcn Sheet primitive (Radix Dialog + cva slide variants) |
| `apps/web/src/components/shared/sidebar.tsx` | Collapsible sidebar |
| `apps/web/src/middleware.ts` | Supabase SSR auth + root → /products |
| `apps/api/docker-compose.test.yml` | Postgres-in-Docker test DB (port 5433) |
| `apps/api/vitest.config.ts` | Vitest harness config — sequential, .env.test, globalSetup |
| `apps/api/src/test/build-app.ts` | `buildTestApp()` factory |
| `apps/api/src/test/auth.ts` | Test JWT signer (`signTestJwt`, `authedHeaders`) |
| `apps/api/src/test/db.ts` | Tenant-table truncate + `createTestTenant` helper |
| `apps/api/src/test/smoke.test.ts` | Harness proof-of-life suite |
| `apps/api/src/services/stock/__tests__/upsert-stock-level.test.ts` | Pins identical-quantity → movement-row behaviour (Cycle B) |

## Infrastructure

- Frontend: Vercel, auto-deploy from `main`
- Backend: Hetzner VPS at 178.104.175.191, Kamal-deployed
- DB: Supabase Postgres (managed), RLS-enforced
- CI/CD: GitHub Actions, runs `run-manual-migrations.ts` post-deploy automatically — no manual SQL in Supabase needed
