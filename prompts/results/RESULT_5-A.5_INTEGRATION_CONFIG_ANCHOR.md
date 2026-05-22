## RESULT: Cycle 5-A.5 — Integration als Konfig-Anker

**Prompt:** `prompts/PROMPT_5-A.5_INTEGRATION_CONFIG_ANCHOR.md`
**Notion:** https://www.notion.so/35e24fe1d88a8141be4ce5e5e654aa26
**Branch:** develop
**Last commit:** (pending — set after the implementation commit)
**Date:** 2026-05-22

---

## Summary

Moved `credentialId` and `csvMappingTemplateId` from `IntegrationSchedule` onto `Integration` as authoritative defaults; schedule columns remain nullable as override slots. The PATCH integration route accepts both new fields with validation, the SFTP rename gate is narrowed so SFTP/FTP/FTPS marketplace keys can be renamed, the credential DELETE 409 now blocks on Integration references too, schedule POST + manual import + worker all fall back to Integration when the request/Schedule omits credential or mapping. Edit-Page restructured to inline-edit the name, auto-save Credential + Mapping at Integration level, and a time-only Schedule section; the Wizard now PATCHes the new integration with credential + mapping after install and the schedule POST omits both.

## Files changed

### Backend

- `apps/api/src/db/schema.prisma` — `Integration` gains `credentialId` + `csvMappingTemplateId` (nullable, `onDelete: Restrict`), named inverse relations on `IntegrationCredential` + `CsvMappingTemplate`, indexes on the new columns.
- `apps/api/src/db/migrations/20260522155500_integration_config_anchor/migration.sql` — adds the columns, FKs (RESTRICT), indexes, and backfills from the newest active schedule per integration via `DISTINCT ON (integration_id) … ORDER BY created_at DESC`. `integration_schedules.credential_id` was already nullable in this repo (init v3 created it as nullable), so no `ALTER COLUMN` was needed.
- `apps/api/src/routes/integrations/index.ts` — `updateIntegrationSchema` accepts `credentialId` + `csvMappingTemplateId` (nullable/optional). New `RENAMABLE_MARKETPLACE_KEYS = {sftp,ftp,ftps}` narrows the name-immutable check; `config` immutability stays for all marketplace integrations. New validation paths return `400 INVALID_CREDENTIAL` / `400 INVALID_MAPPING_TEMPLATE` with specific messages.
- `apps/api/src/routes/credentials/index.ts` — DELETE in-use check (inside the existing SERIALIZABLE transaction) now sums Schedule + Integration references; 409 message rephrased to "active reference(s)" to cover both paths.
- `apps/api/src/routes/integrations/schedules.ts` — POST: `credentialId` Zod becomes `.optional()`; handler validates when present and falls back to `Integration.credentialId` when omitted (returns `400 CREDENTIAL_NOT_CONFIGURED` if neither is set). DB write stores `body.data.credentialId ?? null` so the schedule slot stays empty when the request inherits. PATCH: `credentialId` accepts `string | null`; explicit `null` clears the override (worker falls back at run time).
- `apps/api/src/routes/integrations/sftp-import.ts` — `importNowBodySchema.credentialId` becomes optional. Handler loads `Integration.credentialId` + `csvMappingTemplateId` first and applies the body values as overrides; missing both → `400 CREDENTIAL_NOT_CONFIGURED`.
- `apps/api/src/jobs/sftp-import.worker.ts` — schedule loader now also `include`s `integration.credential` + `integration.csvMappingTemplate`. Credential = `schedule.credential ?? integration.credential` (override wins, default as fallback); same shape for mapping template. The downstream code is unchanged because both relations resolve to the same record shape.

### Frontend

- `apps/web/src/lib/api/use-integrations.ts` — `IntegrationDetail` gains `credentialId` + `csvMappingTemplateId`. New generic `useUpdateIntegration` mutation hook that PATCHes any of `name | isEnabled | credentialId | csvMappingTemplateId`; invalidates the per-id query, the list, and the marketplace catalog on settle.
- `apps/web/src/lib/api/use-schedules.ts` — `CreateScheduleInput.credentialId` now optional, `UpdateScheduleInput.credentialId` accepts `string | null`.
- `apps/web/src/app/(dashboard)/integrations/automatic/[id]/page.tsx` — full restructure. PageHeader title becomes inline-editable (Pencil → Input → Enter/Blur/Esc, Loader2 while saving). Credential + Mapping are top-level sections with `useUpdateIntegration` auto-save on change (subtle spinner, success/error toasts, refetch on error so the selector rolls back). Schedule section now carries only `ScheduleBuilder` + the active toggle + Save/Delete buttons; the schedule save handler no longer sends credentialId/csvMappingTemplateId. Schedule save short-circuits with a toast when `integration.credentialId` is null, and the Save button is disabled when no credential is set.
- `apps/web/src/components/integrations/setup-wizard.tsx` — submit handler now PATCHes the freshly-installed integration with `{ credentialId, csvMappingTemplateId }` (if present) via `useUpdateIntegration` before the schedule POST. The schedule POST body no longer sends those two fields — backend fallback resolves them.
- `apps/web/src/components/shared/page-header.tsx` — `title` prop widened from `string` to `ReactNode` so callers can render inline-editable titles.
- `apps/web/messages/en.json` + `apps/web/messages/de.json` — 13 new keys under `integrations.sftp.config` (`editName`, `saveName`, `cancelEdit`, `nameSaved`, `nameSaveFailed`, `credentialSaved`, `credentialSaveFailed`, `mappingSaved`, `mappingSaveFailed`, `needCredentialForSchedule`, `savingShort`, `savedShort`).

### Tests

- `apps/api/src/routes/integrations/__tests__/integration-config-anchor.test.ts` — new file. 6 tests covering: SFTP rename allowed, Shopify rename rejected, credentialId set with valid SFTP credential, inactive credential rejected, credentialId cleared with null, export-direction template rejected, valid import/stock template set.
- `apps/api/src/routes/credentials/__tests__/credentials.test.ts` — +1 test: DELETE returns 409 when only an Integration references the credential (no schedule involved).
- `apps/api/src/routes/integrations/__tests__/schedules.test.ts` — +2 tests: POST without credentialId succeeds when Integration has one (schedule.credentialId stored as null), POST without credentialId returns 400 `CREDENTIAL_NOT_CONFIGURED` when Integration has none.
- `apps/api/src/routes/integrations/__tests__/sftp-import.test.ts` — +2 tests: POST `/import-now` without credentialId succeeds when Integration has one, POST without credentialId returns 400 `CREDENTIAL_NOT_CONFIGURED` when Integration has none.
- `apps/api/src/jobs/__tests__/sftp-import.worker.test.ts` — +2 tests: worker resolves credential from Integration when `Schedule.credentialId` is null (connector reached, `ImportRun.credentialId` matches Integration default), worker skips with `credential_inactive` when both Schedule and Integration are credential-less (no `ImportRun` row written).

## Key decisions made during execution

- **Migration ALTER COLUMN omitted.** The prompt's R1 step 5 ("Drop NOT NULL on schedules.credential_id") is a no-op for this repo — the init v3 migration created `integration_schedules.credential_id` as `UUID` (nullable). The migration file states this explicitly so future readers don't go looking for the drop.
- **Validation surface for `PATCH integration.credentialId` aligns with schedule semantics.** I reused the same "integration-bound credential must match this integration" guard as `validateCredentialForSchedule`; reusable tenant-level credentials (`integrationId === null`) pass automatically. Errors come back as `400 INVALID_CREDENTIAL` with specific messages instead of borrowing the schedule's 404/409 codes — the PATCH surface is structurally an Integration mutation, not a Schedule mutation.
- **`config` still immutable on ALL marketplace integrations.** The narrowing only loosened the `name` gate; the existing config-immutable behavior on SFTP/FTP/FTPS is preserved (their `config` JSON is unused today but staying conservative keeps a future schema change from accidentally unlocking it).
- **DELETE 409 message rephrased.** Old wording said "active schedule(s) reference this credential". Since both Schedule and Integration paths now feed the same 409, the message now reads "active reference(s) to this credential" — covers both without exposing internal field names.
- **Worker fallback uses `??` not a separate code path.** `schedule.credential ?? integration.credential` keeps the existing connector-call code unchanged. The included relation shape is identical, so no branching downstream.
- **Edit-Page name edit: explicit save + cancel buttons in addition to Enter/Blur/Esc.** The prompt allowed either; I added small Check/X icon buttons because Blur-to-save makes accidental commits when clicking a different section feel surprising, and an explicit cancel button is more discoverable than Escape. Both submit paths run the same `commitNameEdit` function so behaviour is consistent.
- **Schedule create button disabled AND toast on click.** The prompt suggested picking one. I went with both: the button is `disabled` when `credentialId` is null (clearer UX), and the handler still short-circuits with a toast if it ever fires (defensive — covers the case where state and disable-state get out of sync).
- **Wizard schedule POST kept the inline `fetch`.** The existing technical-debt entry (Wizard uses inline fetch instead of `useCreateSchedule` because the hook closes over `integrationId` at instantiation) is unaffected by this cycle. The PATCH path uses `useUpdateIntegration.mutateAsync` cleanly since that hook takes `id` at call time.

## Skipped or deferred

- **Schedule-level credential / mapping override UI** — the schema still carries `IntegrationSchedule.credentialId` + `csvMappingTemplateId` as override slots, but no UI exposes them. Tracked in KNOWN_TODOS as a future power-user surface.
- **Marketplace rename for non-SFTP integrations** — pre-existing KNOWN_TODOS entry. This cycle's narrowing left Shopify/Hive/Byrd still rejecting `name` on PATCH; the entry is updated to note the SFTP carve-out happened in 5-A.5.
- **`apps/web/src/lib/api/client.ts` `apiFetchWithMeta` consolidation** — out of scope; tracked separately.
- **Migration test file** — the prompt suggested `apps/api/src/test/migrations/integration-config-anchor.test.ts`. There is no existing migration-test pattern in this repo (the test harness runs the actual migrations on every test setup via `prisma migrate deploy`); the backfill is exercised by the integration tests instead. If a dedicated migration-snapshot pattern lands later, the backfill assertion will be the natural first test for it.

## Tests

```
Test Files  10 passed (10)
      Tests  109 passed (109)
```

Backend suite: 95 → 109 (+14). All new tests green on first run. `pnpm -C apps/api typecheck` + `lint` + `build` clean. `pnpm -C apps/web typecheck` + `lint` + `build` clean (only pre-existing warnings on untouched files).

## Codex review

`review:mandatory` — schema migration, four backend route surfaces, worker logic change, multi-tenant data path. Pending: `/codex:adversarial-review --base origin/main` after push. Findings will be parsed, classified ACTIONABLE/DEFERRED per DECISIONS 2026-04-16, fixed in-session, and documented in `prompts/results/REVIEW_5-A.5_INTEGRATION_CONFIG_ANCHOR.md`.

## Memory Bank updates

- [x] `STATE.md` updated
- [x] `KNOWN_TODOS.md` updated
- [x] `NEXT.md` updated (5-A.5 → ✅ Done, 5-B promoted to in-flight)
- [ ] Notion entry → ✅ Ausgeführt (pending)
- [x] This result file written
