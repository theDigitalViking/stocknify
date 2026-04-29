# Stocknify — Known TODOs

> Tech debt and deferred Codex findings. Not blocking, but tracked. Claude Code appends to this list when a finding is classified as deferred. Sebastian or Claude (Chat) removes items when fixed.

**Last updated:** 2026-04-29 (Codex review FIXES6 retro)

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
- **Marketplace install name is cosmetic** — `MarketplaceInstallDialog` collects a name but the backend's install endpoint doesn't accept it. Typed name only appears in the success toast. Backend follow-up needed to persist per-tenant labels (probably on `Integration.name`).
- **Marketplace settings block is a placeholder** — per-integration OAuth / API-key form is future work, scoped out of the install-dialog shell.
- **No marketplace uninstall UI** — backend has `DELETE /integrations/marketplace/:key/uninstall` but no UI hook calls it. Toggle only enables/disables.
- **Marketplace toggle has no failure feedback** — `useToggleIntegration` invalidates on success but failure is silent (no toast, no rollback).
- **`<img>` `onError` on the marketplace card** falls back to invisible square instead of `IntegrationLogoPlaceholder`. Small follow-up.
- **`LOCKED_SOURCES` duplicated** in two frontend files + backend (`apps/api/src/routes/products/index.ts`). Cross-referenced via comments. If a third automated source is added (e.g. EDI), all three sites must change. Promote to `packages/shared/constants/` if list grows.
- **`metadata.source` is mutable via PATCH** — the identity-lock guard reads `metadata.source`, but the same PATCH can rewrite `metadata` itself. A determined caller can flip `metadata.source = 'manual'` and then mutate SKU. Decide whether `metadata.source` should be immutable or guarded.
- **List-view identity-lock is incomplete** — list endpoint doesn't return `hasExternalReferences`, so the dialog only locks on source-based criteria from the list page. Backend still 409s on save; UX gap.

## Documentation

- **`PROJECT.md` is stale** — last updated 2026-04-18, predates encoding support and stock import. Refresh in a docs cycle.
- **No regression tests anywhere in the CSV pipeline** — recurrent across all CSV cycles. No Fastify test harness in repo. Once one exists, target: dry-run with unmapped SKU, missing-location import, batched-product-without-batchTracking import, overlapping-key round trip.
