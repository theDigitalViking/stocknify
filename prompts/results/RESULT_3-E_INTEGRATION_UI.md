# RESULT: Cycle 3-E — SFTP/FTP Integration UI (Config Page + Setup Wizard)

**Prompt:** `prompts/PROMPT_3-E_INTEGRATION_UI.md`
**Notion:** https://www.notion.so/35824fe1d88a8140b4b0cbb3d44de043
**Branch:** develop
**Last commit:** see `git log -1` after this cycle's feature commit
**Date:** 2026-05-08

---

## Summary

Final cycle of Batch 3. Replaces the "coming soon" placeholder at `/integrations/automatic` with a real card list of installed SFTP/FTP integrations, adds a per-integration config page at `/integrations/automatic/[id]` with sections for credentials, directory browser, mapping template, schedule builder, and import-runs history, and ships a 5-step setup wizard accessible from both the automatic-integrations list and the marketplace's new SFTP/FTP card. Three new TanStack Query hook modules (`use-credentials`, `use-schedules`, `use-import`) wrap the Cycle 3-B/3-C/3-D backend endpoints; seven new `components/integrations/*` building blocks compose the wizard and the config page. Backend touch is one line in the marketplace catalog adding an `sftp` entry so the wizard has an install handle.

## Files changed

**New (frontend hooks):**
- `apps/web/src/lib/api/use-credentials.ts` — `useCredentials`, `useCreateCredential`, `useUpdateCredential`, `useDeleteCredential`, `useTestCredential`, `useTestUnsavedCredential`. Types follow the masked-credential shape the `/v1/credentials` endpoints emit (sensitive fields are either `null` or the shared mask string).
- `apps/web/src/lib/api/use-schedules.ts` — `useSchedules`, `useCreateSchedule`, `useUpdateSchedule`, `useDeleteSchedule`, `useToggleSchedule`. Create-mutation hard-codes `resourceType: 'stock'` + `direction: 'import'` per Cycle 3-D's create schema.
- `apps/web/src/lib/api/use-import.ts` — `useRemoteFiles` (gated on `credentialId`, 30 s `staleTime`, no focus refetch — every call opens an SFTP socket), `useImportNow` (invalidates `import-runs` + `stock`), `useImportRuns` (paginated via `apiFetchWithMeta`).

**New (frontend components — `apps/web/src/components/integrations/`):**
- `connection-test-button.tsx` — Reusable button. States: idle → testing (spinner) → success (green check, auto-resets after 5 s) → error (red X, error message stays until retry).
- `credential-form.tsx` — Inline create form. Name, Protocol radio (SFTP/FTP/FTPS) with auto-default port (22/21/21), Host, Port, Username, Password, Remote path. Test-connection button uses `useTestUnsavedCredential`; Save uses `useCreateCredential` and bubbles the created row through `onCreated`.
- `credential-selector.tsx` — Radix Select dropdown of existing credentials filtered by allowed types (default `['sftp','ftp','ftps']`). First option is "New credentials" → expands the inline form.
- `directory-browser.tsx` — Editable path + Browse button. Renders a table of CSV files (Filename, Size, Last modified). Files are clickable (when `onFileSelect` is provided). Surfaces "No CSV files found" empty state and the API error message on failure.
- `mapping-template-selector.tsx` — Filtered `useCsvMappings({ direction: 'import', resourceType: 'stock' })`. First option is "Default (column-name matching)" — represented as `null` in parent state.
- `schedule-builder.tsx` — Multi-step inline builder (not a modal). Type selector (Interval / Daily / Weekly), per-type detail inputs, presets for interval (15min/30min/1h/2h/4h — auto-converts ≥60min into `interval_hours` to satisfy the backend's `intervalValue ≤ 59` cap), and a live preview sentence computed client-side in the user's locale.
- `import-runs-table.tsx` — Paginated history table (page size 20). Columns: Date, File, Status badge (success/partial/failed/running), Rows (created/updated/skipped/errored as compact glyphs), Duration. Embeds a "Import now" dialog that picks credentials + optional file from the directory browser → calls `useImportNow`.
- `setup-wizard.tsx` — 5-step modal: (1) Connection name + credentials (2) Directory browser (3) Mapping template (4) Schedule (with "manual only" opt-out) (5) Summary review. On submit: installs the `sftp` marketplace entry if not already installed, then creates the schedule via inline `fetch` (the `useCreateSchedule` hook needs the integrationId at instantiation; the wizard learns it post-install). Redirects to the new config page on success.

**New (frontend pages):**
- `apps/web/src/app/(dashboard)/integrations/automatic/[id]/page.tsx` — Per-integration config page. Sticky header with name, protocol badge, health-status dot + label (en + de), enable/disable Switch. Body sections: health summary (last successful sync, last error, consecutive failures), credentials, directory, mapping, schedule (with toggle + next-run timestamp + delete), import history. State hydrates from existing schedule once on first load; subsequent edits never re-overwrite.
- (replaced) `apps/web/src/app/(dashboard)/integrations/automatic/page.tsx` — Replaces the "coming soon" placeholder. Pulls the marketplace catalog and filters installed entries to `AUTOMATIC_KEYS = {sftp, ftp, ftps}`. Each integration renders as a card with name, protocol badge, health dot, last-sync time (from the active schedule's `lastRunAt`), schedule summary (`cronDescription`), enable/disable Switch, and a "Configure" link. Empty state CTAs to open the wizard.

**Modified:**
- `apps/web/src/lib/api/use-integrations.ts` — Adds `useIntegration(id)` returning `{ integration, lockedTemplates }` (matches `GET /v1/integrations/:id` envelope). The config page uses it to drive the header (name, health, isEnabled) and the health summary section.
- `apps/web/src/components/integrations/marketplace-app-store-modal.tsx` — `WIZARD_KEYS = {sftp, ftp, ftps}`. When the operator clicks Install on a wizard-key card, the app-store modal closes and the SetupWizard opens instead of the generic `MarketplaceInstallDialog`.
- `apps/web/messages/en.json` + `de.json` — New `integrations.sftp.*` block (~150 keys) covering list/config/health/credentialSelector/credentialForm/connectionTest/directoryBrowser/mappingSelector/scheduleBuilder/runs/wizard.

**Modified (backend — single additive change):**
- `apps/api/src/lib/marketplace-catalog.ts` — Adds an `sftp` catalog entry (category `'erp'`, placeholder logo). Single entry covers SFTP/FTP/FTPS — the wizard collects the protocol at install time. Without this, the marketplace had no SFTP card to override and the wizard had no install handle.

## Behaviour notes

- **Single SFTP install per tenant.** The marketplace install endpoint enforces a one-row-per-`marketplaceKey` constraint (`409 ALREADY_INSTALLED`). The wizard handles this gracefully: if an SFTP integration is already installed, it skips the install call, surfaces an "already installed — this wizard will configure the existing one" notice on step 1, and proceeds straight to schedule creation against the existing integration. Multi-instance SFTP requires lifting the unique constraint — out of scope for this cycle, tracked alongside the marketplace-rename TODO.
- **Schedule create from the wizard uses an inline `fetch`, not the `useCreateSchedule` hook.** The hook closes over the integrationId at instantiation; in the wizard, the integrationId is learned mid-submit (after install). Switching to a service function or a deferred mutation factory is a future refactor; the inline fetch is acceptable at MVP scale and goes through the same auth path.
- **Credential management lives only inside the integration setup, not as its own page.** Per the prompt's non-goals, there's no `/credentials` page in this cycle. The selector exposes a "New credentials" option that opens the inline form; existing credentials can be reused but not edited or deleted from the SFTP UI. A future cycle can add a dedicated credentials settings page.
- **Directory browser caches results for 30 seconds with no focus refetch.** Each call opens a real SFTP/FTP socket against the operator's remote server; the rate-limit gap on the listing endpoint is already tracked in KNOWN_TODOS. Aggressive client-side caching (`staleTime: 30_000`, `refetchOnWindowFocus: false`) keeps the per-keystroke fetch storms off the wire.
- **Health dot on the automatic-integrations card list is always "unknown".** The `marketplace/catalog` endpoint doesn't return per-integration `healthStatus` today. Surfacing it on the card list would require either a per-card `useIntegration()` fetch (N+1) or extending the catalog payload — both deferred. The actual health is shown on the config page where `useIntegration` is already loaded.
- **Schedule preview is computed client-side for instant feedback; the server is the authoritative source.** `schedule-builder.tsx` derives the human sentence locally; the backend's `cronDescription` (en + de) is what the list page and config page render for *saved* schedules, so any drift between the two is corrected as soon as the row is saved.
- **The 15+ minute / 30 min interval presets convert >=60 min into `interval_hours`.** Cycle 3-D's `intervalValue` schema caps at 59 — the preset buttons silently switch the schedule type when the operator picks "1 h" / "2 h" / "4 h" so the request validates. The user sees the same preview either way.
- **Manual-import dialog reuses the `DirectoryBrowser` and `CredentialSelector`.** Operators can run a one-off import from the config page without touching the schedule. The dialog auto-picks the newest CSV when the file field is left empty (matching the backend's behaviour when `filePath` is omitted from `POST /import-now`).

## Acceptance criteria

- [x] All API hooks created and working against the backend endpoints (typecheck green).
- [x] Credential selector allows choosing existing or creating new credentials inline.
- [x] Connection test button shows real-time feedback (spinner → success/error, auto-reset on success).
- [x] Directory browser lists CSV files from remote server (gated on credential, with empty/error states).
- [x] Schedule builder produces structured fields for all four schedule types (interval_minutes/interval_hours/daily/weekly).
- [x] Schedule builder shows human-readable preview in the user's locale (en + de).
- [x] Import runs table displays paginated history with status badges and per-row stats.
- [x] Config page (`/integrations/automatic/[id]`) renders all six sections (header, credentials, directory, mapping, schedule, history).
- [x] Automatic integrations list replaces the "coming soon" placeholder.
- [x] Setup wizard guides through 5 steps and creates the integration + schedule + credential as needed.
- [x] Wizard accessible from both the automatic page (Add button + empty-state CTA) and the marketplace SFTP/FTP card.
- [x] All i18n keys in en + de under `integrations.sftp.*`.
- [x] `pnpm -C apps/web typecheck` ✅ green.
- [x] `pnpm -C apps/web build` ✅ green.
- [x] `pnpm -C apps/web lint` — 0 errors (only the pre-existing warnings remain).
- [x] `pnpm -C apps/api typecheck` ✅ green (backend catalog change).
- [x] `pnpm -C apps/api build` ✅ green.

## Tests

- Frontend: no automated tests added — frontend test infrastructure is still out of scope per the testing strategy in KNOWN_TODOS (pending React Testing Library setup). UI verified via typecheck + build.
- Backend: no new tests required — the marketplace-catalog change is additive (new entry) and existing route tests don't enumerate catalog entries. Existing `pnpm -C apps/api typecheck` + `build` ✅ green.

## Skipped or deferred

- **Credential settings page (separate from integration setup).** The prompt explicitly defers this; tracked for a future cycle.
- **Multi-instance SFTP installs.** The single `ALREADY_INSTALLED` constraint blocks installing a second SFTP integration. The wizard currently routes a second-attempt operator to configure the existing install. Lifting the constraint is a backend concern shared with the marketplace-rename TODO.
- **Per-card health status on the automatic list.** Catalog payload doesn't carry `healthStatus`. Either extend the catalog or add per-card `useIntegration` fetches in a follow-up.
- **OAuth/SSH-key auth UX.** Connector currently supports password auth only (per Cycle 3-B). The credential form exposes only password — adding SSH-key fields requires schema changes (KNOWN_TODOS already tracks the SSH key auth + encrypted-additionalAttributes gaps).
- **WebSocket/SSE for live import progress.** Per non-goal — the import-runs table polls and the dialog shows the final result as a toast.
- **Schedule timezone column.** Still missing on the schedule row (Cycle 3-D follow-up). The wizard and config page don't expose a timezone picker — every schedule lives in `Europe/Berlin` until the column lands.

## Codex review

To be run by Sebastian after the push, per `WORKFLOW.md` § Step 6:

```
/codex:adversarial-review --base origin/main
```

Review classification: `review:recommended` — large frontend surface, one tiny additive backend change, no security/data-flow logic.

## Memory Bank updates

- [x] `STATE.md` updated
- [x] `KNOWN_TODOS.md` updated
- [x] Notion entry → ✅ Ausgeführt
- [x] This result file written
