# Stocknify — Known TODOs

> Tech debt and deferred Codex findings. Not blocking, but tracked. Claude Code appends to this list when a finding is classified as deferred. Sebastian or Claude (Chat) removes items when fixed.

**Last updated:** 2026-04-29 (Marketplace polish 2 — 4 frontend items resolved, rename-after-install added)

---

## Backend

- **JWT verifier HS256 fallback** — needs a cutoff date once all tokens are ES256-signed.
- **Auth webhook idempotency** — duplicate Supabase delivery can produce orphan tenants. Acceptable at current scale.
- **CSV per-row N+1 queries** — batchable later when import volume grows.
- **CSV encoding unknown-value fallback** — unknown encodings silently route to UTF-8 in `decodeBuffer`. Could mask user misconfiguration. See DECISIONS 2026-04-18.
- **`@types/iconv-lite` deprecated stub** — kept per spec; iconv-lite ships its own types now. Remove in a cleanup pass.
- **CSV stock import: P2002 on concurrent same-key writes** — currently surfaces as a generic per-row "Unknown error" reason. Map to friendlier "row skipped — concurrent write" message.
- **CSV stock import: storage-location fallback is silent** — typo'd bin name falls back to bin-agnostic row without warning. Could mask config errors.
- **CSV stock import: dry-run "created" mismatch for batched rows** — dry-run skips batch creation, so batched rows always look "created" in dry-run even when a real run would update.
- **CSV stock import: `batchTracking=false` silently drops batch columns** — CSV with a batch column for a non-batched product has the value ignored without warning.
- **CSV stock import: cause chain only one level deep** — `extractErrorMessage` unwraps `.cause` once. Deeper chains lose context in row-level `reason`. *(2026-04-29: Codex flagged this in the FIXES6 retro. Mooted on the user-facing path by commit `5606dd4` which sanitizes `reason` regardless of depth; server-side `request.log.error({ err })` now captures the full chain via pino's err serializer. Helper itself remains shallow, kept as-is — non-blocking for current users.)*
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
- **`LOCKED_SOURCES` duplicated** in two frontend files + backend (`apps/api/src/routes/products/index.ts`). Cross-referenced via comments. If a third automated source is added (e.g. EDI), all three sites must change. Promote to `packages/shared/constants/` if list grows.
- **`metadata.source` is mutable via PATCH** — the identity-lock guard reads `metadata.source`, but the same PATCH can rewrite `metadata` itself. A determined caller can flip `metadata.source = 'manual'` and then mutate SKU. Decide whether `metadata.source` should be immutable or guarded.
- **List-view identity-lock is incomplete** — list endpoint doesn't return `hasExternalReferences`, so the dialog only locks on source-based criteria from the list page. Backend still 409s on save; UX gap.

## Documentation

- **No regression tests anywhere in the CSV pipeline** — recurrent across all CSV cycles. No Fastify test harness in repo. Once one exists, target: dry-run with unmapped SKU, missing-location import, batched-product-without-batchTracking import, overlapping-key round trip.
- **PROJECT.md §17 `csv_mapping_templates` schema drift** — block doesn't document `sample_data`, `is_locked`, `marketplace_key` columns that exist in `schema.prisma`. Out of size scope for the 2026-04-29 refresh; canonical reading is `schema.prisma`. Refresh next time §17 is touched. *(Surfaced 2026-04-29, RESULT_REFRESH_PROJECT_MD.md "Skipped or deferred".)*
