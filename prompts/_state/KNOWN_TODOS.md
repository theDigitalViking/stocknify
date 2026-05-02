# Stocknify — Known TODOs

> Tech debt and deferred Codex findings. Not blocking, but tracked. Claude Code appends to this list when a finding is classified as deferred. Sebastian or Claude (Chat) removes items when fixed.

**Last updated:** 2026-05-02 (Test-Harness Foundation shipped — deferred extensions tracked below)

---

## Testing strategy

> Sebastian and Claude (Chat) settled on a hybrid approach (Option D) on 2026-05-02. The full discussion is in chat history; the operational shape lives here so future cycles inherit it without re-deciding.

**Decision:** Stocknify ships features faster than it tests them today. Rather than retroactively building coverage or stalling Phase 4 for a test-first rebuild, the project introduces test infrastructure incrementally, anchored to actual feature cycles.

**Rules going forward:**
- A dedicated `TEST_HARNESS_FOUNDATION` cycle (Cycle TH in NEXT.md) lands the Backend Fastify test harness before the next feature cycle (Cycle B). Without that cycle, no backend tests exist and there is nothing to add tests *to*.
- After Cycle TH, every cycle that touches Backend code ships at least one test for the touched endpoint or service surface. Frontend cycles stay test-free for now.
- Test failures are warnings, not red CI, for the first 5 cycles after Cycle TH. After that, flip to blocking. The grace window protects against harness-bedding-in friction.
- No coverage thresholds. No TDD enforcement. No retrofit-tests-for-existing-code initiatives. Adding tests for an old feature is a deliberate cycle, not a side-effect.
- E2E (Playwright) is explicitly out of scope until the onboarding flow has been stable for ≥30 days.
- Frontend test infra (React Testing Library) is out of scope until backend test discipline has held for ≥3 cycles post-TH. Tracked in NEXT.md backlog.

**Harness status (2026-05-02):** in place. Vitest harness lives at `apps/api/src/test/`, Postgres 16 in Docker on port 5433, `pnpm -C apps/api test` runs sequentially after `pnpm -C apps/api test:up`. Smoke suite green. Deferred extensions:

- **Worker-schema isolation** — defer until backend test count > ~50 or sequential runs exceed 60s. Single-DB sequential is the deliberate current choice (DECISIONS 2026-05-02).
- **Frontend test infrastructure (React Testing Library)** — unchanged from existing entry; defer until backend test discipline has held for ≥3 cycles.
- **CI test-blocking flip** — Test step is currently `continue-on-error: true`. Flip to blocking after 5 cycles where the harness has been used. Tracked in NEXT.md backlog. *(Codex 2026-05-02 flagged this `[high]`; deferred per DECISIONS 2026-04-16 — soft-fail window is the explicit operational choice for the harness's bedding-in period, documented in DECISIONS 2026-05-02 (test-DB strategy) and NEXT.md.)*
- **Vitest UI / `--ui` mode** — not configured. Add when a future cycle needs it.
- **RLS-isolation tests** — Prisma in tests connects as the table owner (`test` user in Docker), which bypasses RLS by default (RLS is `ENABLE`d, not `FORCE`d on these tables). Smoke test does not exercise cross-tenant isolation. When RLS-coverage tests are needed, either add a non-owner test role or `FORCE ROW LEVEL SECURITY` on the migrated tables.

**Pending test coverage** (will be picked up by feature cycles or a future dedicated cleanup):
- **`upsertStockLevel` behaviour change** (Cycle B) — identical-quantity upsert must still append a `stock_movements` row. First test under the new harness.
- **`POST /products/:id/restore`** (Cycle D) — restore happy path, restore-on-active edge case, RLS isolation across tenants.
- **`GET /stock/movements`** (Cycle E) — filter combinations, RLS isolation, license-tier date-cap enforcement.
- **CSV row-error sanitization** (`sanitizeRowError` in `apps/api/src/lib/csv-errors.ts`) — whitelist contract, P2002/P2010+23505/foreign-key paths, `StockLevelInvariantError` UUID-leak prevention. Already documented under "Documentation" below; promoted up here for visibility once the harness exists.
- **CSV pipeline regressions** — recurrent gap from every CSV cycle to date. Target tests: dry-run with unmapped SKU, missing-location import, batched-product-without-batchTracking import, overlapping-key round trip.

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

- **No regression tests anywhere in the CSV pipeline** — recurrent across all CSV cycles. No Fastify test harness in repo. Once one exists, target: dry-run with unmapped SKU, missing-location import, batched-product-without-batchTracking import, overlapping-key round trip. **Update 2026-05-02:** harness-foundation cycle is queued (Cycle TH in NEXT.md); CSV regression tests will land progressively in subsequent cycles per the Testing strategy section above.
- **PROJECT.md §17 `csv_mapping_templates` schema drift** — block doesn't document `sample_data`, `is_locked`, `marketplace_key` columns that exist in `schema.prisma`. Out of size scope for the 2026-04-29 refresh; canonical reading is `schema.prisma`. Refresh next time §17 is touched. *(Surfaced 2026-04-29, RESULT_REFRESH_PROJECT_MD.md "Skipped or deferred".)*
- **CSV row-error sanitization regression coverage** — `sanitizeRowError` (in `apps/api/src/lib/csv-errors.ts`) has a clear whitelist + generic-fallback contract but no test asserts it. When a Fastify test harness lands, target tests: P2002 → `'Row skipped — concurrent write detected'`; raw P2010+23505 → same; arbitrary `Error('Foreign key…')` → `'Data integrity violation — see server logs'` fallback; `StockLevelInvariantError` carries variant/location/stockType but `error.message` has no UUIDs. The `isWhitelistedError` predicate is exported alongside for assertion convenience.
