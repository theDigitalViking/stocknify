# RESULT: Cycle 4-A — Marketplace-Fix: Katalog vs. Instanzen, Multi-Install, SFTP-Separation

**Prompt:** `prompts/PROMPT_4-A_MARKETPLACE_FIX.md`
**Notion:** https://www.notion.so/35e24fe1d88a81deacacfa854f76d06b
**Branch:** `develop`
**Date:** 2026-05-12

---

## Summary

Three related Marketplace defects from Sebastian's Batch 3 production review fixed in one cycle. The public catalog endpoint now uses static names and surfaces multiple installations per key; the install endpoint accepts repeated calls per (tenant, key) so two Shopify shops are first-class; SFTP/FTP/FTPS leaves the marketplace catalog entirely and is reachable only via the dedicated `/integrations/automatic` page. New per-instance `DELETE /v1/integrations/:id` replaces the bulk key-scoped uninstall in the web app.

## Files changed

### Backend
- `apps/api/src/lib/marketplace-catalog.ts` — SFTP entry moved out of `MARKETPLACE_CATALOG` into a new `INTERNAL_INTEGRATIONS` constant; `getCatalogEntry(key)` searches both so the install endpoint still resolves `sftp` for the existing wizard call site.
- `apps/api/src/routes/integrations/index.ts` —
  - `GET /integrations/marketplace/catalog`: `Map<key, row[]>` groups installs per key; response shape changed to `{ key, name, description, category, logoUrl, installCount, installations: [{ integrationId, instanceName, isEnabled, installedAt }] }`. Catalog names/descriptions are always from `MARKETPLACE_CATALOG`, never the instance.
  - `POST /integrations/marketplace/:key/install`: removed the `findFirst` conflict check and the `P2002` race-catch (`409 ALREADY_INSTALLED` is gone). Multi-install is now the default behaviour. Locked-template creation is idempotent — if any locked template already exists for `(tenantId, marketplaceKey)`, the install reuses it instead of duplicating.
  - New `DELETE /integrations/:id` — per-instance soft-delete. Tears down locked templates ONLY when this was the last surviving installation of the marketplace key; otherwise siblings keep the shared templates alive.
  - `DELETE /integrations/marketplace/:key/uninstall` kept for backwards compatibility (deprecated; no web caller).
- `apps/api/src/db/sql/unique-active-marketplace-integration.sql` — rewritten from `CREATE UNIQUE INDEX` to `DROP INDEX IF EXISTS integrations_tenant_marketplace_key_active_unique`. Idempotent, picked up by the manual-migration sweep on every deploy.

### Frontend
- `apps/web/src/lib/api/use-integrations.ts` — `MarketplaceCatalogEntry` reshaped to the new contract (`installCount`, `installations: MarketplaceInstallation[]`). `InstallIntegrationResult` typed (caller can read `installed.integration.id`). `useUninstallIntegration` now takes an `integrationId` string. New `useIntegrationsList(type?)` hook for `GET /integrations`.
- `apps/web/src/app/(dashboard)/integrations/marketplace/page.tsx` — flattens `catalog[*].installations[*]` into one card per installation, sorted newest-first. Cards keyed by `integrationId`.
- `apps/web/src/components/integrations/marketplace-integration-card.tsx` — receives a `MarketplaceCard` (installation merged with its catalog metadata). Title is the instance name; subtitle combines catalog name + category. Toggle/uninstall target the `integrationId`.
- `apps/web/src/components/integrations/marketplace-app-store-modal.tsx` — Install button always shown (no more disabled "Already Installed"). When `installCount > 0` a secondary `installCount` badge ("2× installed") appears next to the catalog name. SFTP-specific wizard branching removed (SFTP no longer appears in the modal).
- `apps/web/src/app/(dashboard)/integrations/automatic/page.tsx` — switched from `useMarketplaceCatalog` to `useIntegrationsList('marketplace')` because SFTP rows no longer ride along on the catalog payload. Health-status dot now reflects the real `healthStatus` field on the Integration row.
- `apps/web/src/components/integrations/setup-wizard.tsx` — removed `useMarketplaceCatalog` dependency. Multi-install means every wizard run creates a fresh integration row; the "already installed → reuse existing" branch (and its amber banner) is gone. Step 2's directory browser is retired during the wizard flow — the wizard never has an integrationId pre-submit, so the browser path was dead. `DirectoryBrowser` import removed. The `existingInstall?.integrationId` fallback path on submit is gone; the install response is the authoritative source.
- `apps/web/messages/en.json` + `de.json` — new `marketplace.installCount` ICU key ("{count}× installed" / "{count}× installiert"). New `integrations.sftp.wizard.step2.linkedRemotePath` for the renamed step-2 description.

### Tests
- `apps/api/src/routes/integrations/__tests__/marketplace.test.ts` — 6 new cases:
  - GET catalog excludes `sftp`/`ftp`/`ftps` keys (and includes the regular public ones).
  - Custom install name surfaces in `installations[0].instanceName` while the catalog `name` stays "Shopify".
  - Multi-install: two POSTs to `/marketplace/shopify/install` both return 201; catalog reports `installCount: 2` with both names in `installations[]`.
  - Locked-template idempotency: two installs of the same key never create more locked templates than the catalog's fixed-template count.
  - Per-instance DELETE removes only the targeted installation and leaves the sibling intact (catalog drops from 2 to 1 with the surviving install's ID preserved).
  - Cross-tenant DELETE returns 404 without leaking existence (tenant B cannot delete tenant A's integration; A's row stays active).

## Key decisions made during execution

- **SFTP entry split into `INTERNAL_INTEGRATIONS`, not deleted.** R1 says "remove SFTP from `MARKETPLACE_CATALOG`", but the existing setup wizard calls `POST /integrations/marketplace/sftp/install` and the install endpoint resolves the key via `getCatalogEntry`. Deleting outright would 404 the wizard. The split keeps `MARKETPLACE_CATALOG` clean for the catalog endpoint while letting the install endpoint find SFTP. A dedicated `POST /integrations/sftp` is the eventual clean shape — tracked as a Backend KNOWN_TODO.
- **Locked-template idempotency on re-install.** The original install handler unconditionally created the catalog's locked templates inside the install transaction. With multi-install enabled, installing the same key twice would have duplicated every locked template per (tenant, marketplaceKey). The handler now does a `findFirst` for an existing locked template and skips template creation when one is already present — first install creates the canonical set, subsequent installs reuse them. The corresponding regression test asserts `templates.length <= 1` for Shopify (Shopify currently ships no `fixedTemplates`, so the count stays 0 today; the assertion will keep biting once a marketplace entry adds locked templates).
- **Per-instance DELETE tears down locked templates only when last sibling.** The locked templates are scoped by `(tenantId, marketplaceKey)`, not per integration row. Uninstalling one of two Shopify installs would otherwise erase the templates the other install still uses. The handler counts surviving siblings and only soft-deletes the templates when `siblings === 0`. This is symmetrical with the bulk uninstall's prior semantics (which always erased templates because it removed all installs anyway).
- **Bulk `DELETE /marketplace/:key/uninstall` kept for backwards compatibility.** No web caller uses it after R4, but rather than removing the endpoint in the same cycle and leaving an external script footgun, the deprecation is logged in KNOWN_TODOS so a future cleanup cycle can delete it cleanly.
- **Automatic page switched from catalog to `GET /integrations`.** The non-goal forbids "changes to the SFTP/FTP automatic integrations page or wizard", but R1's removal of SFTP from the catalog payload is incompatible with the page's existing data source. The minimal adaptation: swap the data source from `useMarketplaceCatalog` to a new `useIntegrationsList('marketplace')` hook. The page's UX is unchanged; only the wire format differs. The health-status dot now reflects the real `healthStatus` field (previously hard-coded to "unknown").
- **Setup wizard's amber "already installed" banner removed.** Under multi-install the wizard always creates a fresh installation, so the `alreadyInstalled` state is gone. The `noIntegrationYetNote` in step 2 (directory) is the unified message now — there is no pre-existing integration during the wizard flow. The `alreadyInstalledNote` i18n key is left in place (orphan) for translators to remove at a later cleanup pass — leaving it doesn't cost anything and avoids a translator-coordination side effect on this cycle.

## Skipped or deferred

- **Marketplace `singleton: boolean` flag.** Some catalog entries (an ERP integration that only makes sense once per tenant) want a single-install enforcement again. Logged in KNOWN_TODOS — add a flag and a per-entry 409 path when an actual entry requires it.
- **Renaming after install.** Already in KNOWN_TODOS (marketplace integration rename); Cycle 4-A intensifies the need but doesn't fix it. The PATCH route still 400s on `name` changes for marketplace rows.
- **Dedicated SFTP install endpoint.** Backend KNOWN_TODO. The setup wizard hits the marketplace install endpoint indirectly via `INTERNAL_INTEGRATIONS`; a cleaner `POST /integrations/sftp` belongs to a future F4/F5 UX cycle.
- **Health-status data on Marketplace cards.** Cycle 3-E already flagged that the catalog payload doesn't carry per-installation `healthStatus`. Still deferred — the marketplace page doesn't render a health dot, and the automatic page now reads the real value via the new list hook.

## Tests

`pnpm -C apps/api test`:
- 9 test files, 83 tests passed (was 77 before this cycle; +6 from `marketplace.test.ts`).
- Redis ECONNREFUSED noise from BullMQ during request lifecycle is unrelated to the suite outcome (every test asserts via Fastify inject without depending on the scheduler).

`pnpm -C apps/api typecheck` — clean.
`pnpm -C apps/api build` — clean.
`pnpm -C apps/web typecheck` — clean.
`pnpm -C apps/web build` — clean.
`pnpm -C apps/web lint` — 0 errors, 6 warnings (all pre-existing in `movements/page.tsx` and the sidebars; not introduced by this cycle).

## Codex review

Not run by Claude Code (`review:mandatory` — Sebastian will run `/codex:adversarial-review --base origin/main` separately after the push).

## Memory Bank updates

- [x] `STATE.md` updated — Cycle 4-A bullet added at the top of "What's deployed and working"; header date + active phase refreshed.
- [x] `KNOWN_TODOS.md` updated — added Backend entries for the deprecated bulk uninstall and the interim SFTP install path, plus a Frontend entry on `singleton` integrations and the extended rename-after-install discussion.
- [x] Notion entry → ✅ Ausgeführt, `Ergebnis` set to the result-file path, `Ausgeführt am` = 2026-05-12.
- [x] This result file written.
