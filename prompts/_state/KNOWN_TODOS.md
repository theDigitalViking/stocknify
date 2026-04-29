# Stocknify — Known TODOs

> Tech debt and deferred Codex findings. Not blocking, but tracked. Claude Code appends to this list when a finding is classified as deferred. Sebastian or Claude (Chat) removes items when fixed.

**Last updated:** 2026-04-30 (CSV row-error sanitization broadened — P2002 + cause-chain TODOs resolved)

---

## Backend

- **JWT verifier HS256 fallback** — needs a cutoff date once all tokens are ES256-signed.
- **Auth webhook idempotency** — duplicate Supabase delivery can produce orphan tenants. Acceptable at current scale.
- **CSV per-row N+1 queries** — batchable later when import volume grows.
- **CSV encoding unknown-value fallback** — unknown encodings silently route to UTF-8 in `decodeBuffer`. Could mask user misconfiguration. See DECISIONS 2026-04-18.
- **`@types/iconv-lite` deprecated stub** — kept per spec; iconv-lite ships its own types now. Remove in a cleanup pass.
- **CSV stock import: storage-location fallback is silent** — typo'd bin name falls back to bin-agnostic row without warning. Could mask config errors.
- **CSV stock import: dry-run "created" mismatch for batched rows** — dry-run skips batch creation, so batched rows always look "created" in dry-run even when a real run would update.
- **CSV stock import: `batchTracking=false` silently drops batch columns** — CSV with a batch column for a non-batched product has the value ignored without warning.
- **CSV imports: no partial-progress recovery** — a 10k-row import dying at row 5k leaves the first 5k written and returns 500 with no replay path. Replay/checkpoint mechanism out of scope for MVP.
- **GET /stock in-memory grouping** — should move to DB-level pagination at scale.
- **Product sort** — backend ignores `sortBy` / `sortDir`; frontend sorts client-side.

## Frontend

- **`useDeleteProducts`** — sequential calls, no batch endpoint.
- **`?confirmed=true`** URL parameter — not stripped after refresh.
- **Stock page** — no bulk-select / bulk-delete yet.
- **CSV mapping editor delimiter detection** — does not re-run after user override; hint stays after override.
- **Marketplace settings block is a placeholder** — per-integration OAuth / API-key form is future work, scoped out of the install-dialog shell.
- **Marketplace integration rename after install** — backend PATCH still rejects `name` for marketplace integrations (the "name and config are immutable on marketplace integrations" 400). Decide whether to lift the constraint for marketplace rows or build a dedicated rename endpoint. Tracked in DECISIONS 2026-04-29 (install-name persistence).
- **Marketplace mutation toasts under masked-success transport failures** — `useInstallIntegration` / `useUninstallIntegration` / `useToggleIntegration` already invalidate `marketplace-catalog` on `onSettled` (commit `28e2827`), so cache converges. The remaining UX gap: when a transport error masks a successful server commit, the destructive failure toast still fires before the catalog refetch confirms the actual state. Codex (2026-04-29 re-review) recommends a pre/post-state-diff layer to choose toast text from the refreshed catalog. Classified as ergonomics/MVP-irrelevant per DECISIONS 2026-04-16.
- **`LOCKED_SOURCES` duplicated** in two frontend files + backend (`apps/api/src/routes/products/index.ts`). Cross-referenced via comments. If a third automated source is added (e.g. EDI), all three sites must change. Promote to `packages/shared/constants/` if list grows.
- **`metadata.source` is mutable via PATCH** — the identity-lock guard reads `metadata.source`, but the same PATCH can rewrite `metadata` itself. A determined caller can flip `metadata.source = 'manual'` and then mutate SKU. Decide whether `metadata.source` should be immutable or guarded.
- **List-view identity-lock is incomplete** — list endpoint doesn't return `hasExternalReferences`, so the dialog only locks on source-based criteria from the list page. Backend still 409s on save; UX gap.
- **Stock list `productId` deploy-skew window** — the stock-overview SKU link and Quick-View Eye-Button hard-require `row.productId` from `GET /stock`. During a staggered Vercel/Hetzner deploy where the web ships before the API (or the API is rolled back), `productId` is `undefined`, producing `/products/undefined` 404s on SKU click and an empty Quick-View. Codex (2026-04-30) recommends a defensive `if (!row.productId)` guard that disables both affordances. Classified as deployment ergonomics per DECISIONS 2026-04-16. Self-resolves once the API redeploys; revisit if a real user hits the gap.

## Documentation

- **No regression tests anywhere in the CSV pipeline** — recurrent across all CSV cycles. No Fastify test harness in repo. Once one exists, target: dry-run with unmapped SKU, missing-location import, batched-product-without-batchTracking import, overlapping-key round trip.
- **PROJECT.md §17 `csv_mapping_templates` schema drift** — block doesn't document `sample_data`, `is_locked`, `marketplace_key` columns that exist in `schema.prisma`. Out of size scope for the 2026-04-29 refresh; canonical reading is `schema.prisma`. Refresh next time §17 is touched. *(Surfaced 2026-04-29, RESULT_REFRESH_PROJECT_MD.md "Skipped or deferred".)*
- **CSV row-error sanitization regression coverage** — `sanitizeRowError` (in `apps/api/src/lib/csv-errors.ts`) has a clear whitelist + generic-fallback contract but no test asserts it. When a Fastify test harness lands, target tests: P2002 → `'Row skipped — concurrent write detected'`; raw P2010+23505 → same; arbitrary `Error('Foreign key…')` → `'Data integrity violation — see server logs'` fallback; `StockLevelInvariantError` carries variant/location/stockType but `error.message` has no UUIDs. The `isWhitelistedError` predicate is exported alongside for assertion convenience.
