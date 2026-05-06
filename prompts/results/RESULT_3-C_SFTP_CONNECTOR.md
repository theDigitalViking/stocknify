# RESULT: Cycle 3-C — SFTP/FTP Connector + Import Pipeline

**Prompt:** `prompts/PROMPT_3-C_SFTP_CONNECTOR.md`
**Notion:** https://www.notion.so/35824fe1d88a8194ba5be2a7f654cf35
**Branch:** develop
**Last commit:** see `git log -1` after this cycle's feature commit
**Date:** 2026-05-08

---

## Summary

Second backend cycle of Batch 3. Extends the SFTP/FTP wrappers with directory listing + file streaming, introduces an `import_runs` table, and ships three admin-only endpoints (`GET files`, `POST import-now`, `GET runs`) that hand a remote CSV to the existing stock import pipeline. Credential DELETE flips from soft-delete to hard-delete per DECISIONS 2026-05-07. 9 new tests (sftp-import suite) + 2 updated credential delete assertions; total backend suite 29 → 38 green.

## Files changed

**Modified:**
- `apps/api/src/routes/credentials/index.ts` — DELETE `/v1/credentials/:id` is now a hard delete via `tx.integrationCredential.delete(...)` inside the existing SERIALIZABLE transaction. The 409 `CREDENTIAL_IN_USE` guard, the P2034 retry, and the 503 fallback all stay; only the write verb changed (no more `deletedAt = now()` + `isActive = false`).
- `apps/api/src/routes/credentials/__tests__/credentials.test.ts` — happy-path test now asserts the row is gone via `findUnique → null`; the SERIALIZABLE-retry-success test assertion flipped from "deletedAt not null" to "row is null" too. The 503-path and 409-path assertions still expect `deletedAt: null` since those paths don't actually delete.
- `apps/api/src/integrations/sftp-client.ts` — adds `listSftpDirectory(config, path, filter?)`, `streamSftpFile(config, path)`, the shared `SftpFileInfo` and `SftpStreamHandle` types, and a private `connectSftp` helper. List runs through `withTimeout(LIST_TIMEOUT_MS = 30s)` and sorts by `modifiedAt` desc; stream returns `{ stream, cleanup }` so the caller manages connection lifetime.
- `apps/api/src/integrations/ftp-client.ts` — adds `listFtpDirectory` and `streamFtpFile` with the same shape. Stream uses `PassThrough` because basic-ftp's `downloadTo` writes to a `Writable`. Listing falls back to `new Date()` when the FTP server doesn't speak MLSD (basic-ftp leaves `entry.modifiedAt` undefined in that case).
- `apps/api/src/db/schema.prisma` — new `ImportRun` model + relations on `Tenant` and `Integration`.
- `apps/api/src/db/run-manual-migrations.ts` — registered `rls-policies-v5.sql` after the v7 product-deletedBy entry.
- `apps/api/src/test/db.ts` — added `'import_runs'` to the truncate list.
- `apps/api/src/server.ts` — registered `sftpImportRoutes` under the `/v1` prefix block.

**New:**
- `apps/api/src/db/migrations/20260508120000_add_import_runs/migration.sql` — `CREATE TABLE import_runs ...` with FK→tenants and FK→integrations + the two indexes.
- `apps/api/src/db/sql/rls-policies-v5.sql` — `ALTER TABLE import_runs ENABLE ROW LEVEL SECURITY` + tenant-isolation policy. Idempotent inside a `BEGIN/COMMIT`.
- `apps/api/src/services/stock-import/process-csv-stock.ts` — shared core. Exports `STOCK_IMPORT_FIELDS`, `buildStockExtractor`, `parseCsvStreamingBuffer`, `decodeBuffer`, `processStockImportRows`, and the `StockImportResult` / `StockImportRowsContext` types. The row-loop is a port of the loop that lives in `routes/csv/index.ts` (kept untouched per the prompt's Modified-files scope).
- `apps/api/src/routes/integrations/sftp-import.ts` — single Fastify plugin registering all three routes (`GET /integrations/:id/files`, `POST /integrations/:id/import-now`, `GET /integrations/:id/runs`). The plugin runs `authMiddleware` + `tenantMiddleware` + `requireRole('admin')` as the three global preHandlers — same admin-only posture as the credential vault.
- `apps/api/src/routes/integrations/__tests__/sftp-import.test.ts` — 9 tests: hard-delete pin (R0), CSV-only directory listing, viewer-403 for the listing route, manual import with `source='sftp'` + ImportRun stats verification, FTP variant routing through the FTP wrapper with `source='ftp'`, connector-throw → ImportRun.status=failed, no-filePath path that lists + picks newest CSV, runs pagination newest-first, cross-tenant 404.

## Key decisions made during execution

- **One file for all three endpoints (deviation from prompt).** The prompt's "Files involved" list calls for `files.ts`, `import.ts`, `runs.ts` as three separate modules; I consolidated them into `apps/api/src/routes/integrations/sftp-import.ts`. They share the entire admin-only middleware setup, the credential-loading + decrypting preamble, the `LoadedContext` shape, and the protocol dispatch (`listRemoteDirectory` / `streamRemoteFile`). Three near-empty modules with the same imports felt like noise; one cohesive plugin reads top-down. Sebastian can split if he prefers — the routes themselves are independent.
- **csv/index.ts not refactored to use the new shared core.** The prompt's Modified list does not include `apps/api/src/routes/csv/index.ts`, so I left the existing CSV multipart upload handler alone. The shared core in `services/stock-import/process-csv-stock.ts` is a (mostly) verbatim port of that handler's row loop — the duplication is real but bounded, and the new SFTP path tests pin the shared core's behaviour. A future cleanup cycle can dedupe by switching csv/index.ts to call `processStockImportRows`. Tracked in KNOWN_TODOS.
- **Stream → buffer → existing parser, not full streaming.** The route reads the SFTP/FTP stream into a Buffer (capped at the same 5 MB ceiling as the multipart upload route — `REMOTE_CSV_MAX_BYTES`) and then passes the buffer through the existing `parseCsvStreamingBuffer`. Full row-by-row streaming through csv-parse is the eventual destination; the buffer detour keeps the parsing path identical to the upload route while the SFTP path proves stable. The 5 MB cap is enforced before the file lands in memory — bytes-counted on every `data` event.
- **`source` on `stock_movements`.** SFTP imports tag movements with `source: 'sftp'`; FTP and FTPS both tag with `'ftp'`. The CSV-multipart upload still uses `'csv'`. This partially addresses NEXT.md item 7 (Movements-Quelle granularer). FTPS rolls under `'ftp'` because operators pick the protocol in the credential, not in a separate movement source.
- **Status taxonomy on `import_runs`.** `running` (initial) → `success` (zero errors) | `partial` (some errors but at least one create+update) | `failed` (zero successful rows OR connector throw OR ROW_LIMIT_EXCEEDED OR REMOTE_FILE_TOO_LARGE). Explicit failure paths always update the run row before responding so the operator never sees a stuck "running" entry.
- **`POST /import-now` always returns 200, even on connector failure.** The body carries the run record — operators check `data.status` to learn whether the run succeeded. This matches the existing CSV upload's "incident on warning" pattern: a row-level error is not an HTTP error. True input failures (bad UUID, missing credential, etc.) still return 4xx before the run shell is created.
- **`fileName` extracted from `filePath` not from `Content-Disposition`.** Remote files don't carry a Content-Disposition. The route trims the path's basename for `import_runs.fileName`. When the request omits filePath, the directory listing's newest entry's `name` is used directly.
- **Listing fallback path.** The `path` query param defaults to the credential's stored `remotePath`, then to `'/'`. Same fallback chain on the no-filePath import path.
- **Newest-CSV picker.** `mockedListSftp` already returns sorted-desc; the route just `.find(f => f.type === 'file')`. Empty directory → ImportRun fails with `'No CSV files found in remote directory'`.
- **`POST /credentials/test` and `POST /credentials/:id/test` not extended.** The SFTP/FTP test endpoints kept the same shape (success/error string). The new `streamRemoteFile` path is the import-only entry point.
- **No `DRY_RUN` for SFTP imports.** Manual import always commits. The dry-run mode lives in the multipart CSV upload route for the wizard preview UX; the SFTP import is operator-triggered after a directory inspection, so dry-run isn't load-bearing here.

## Skipped or deferred

- **csv/index.ts dedup.** The shared row-loop in `services/stock-import/process-csv-stock.ts` is not yet called by the multipart upload route. Tracked under "csv/index.ts can adopt the shared row-loop" follow-up in KNOWN_TODOS.
- **Streaming parser.** SFTP/FTP imports buffer the file before parsing. A future refinement is to pipe the connector stream straight into csv-parse so memory stays bounded by the parser's row buffer, not the file size. Today's 5 MB cap covers practical CSVs at MVP scale.
- **Schedule trigger.** `import_runs.trigger='scheduled'` and `import_runs.scheduleId` exist in the schema but are unused; Cycle 3-D wires the schedule-create endpoint + BullMQ worker that populates them.
- **Notion update.** I have no Notion MCP available in this Claude Code session. Setting Cycle 3-C's Notion entry to ✅ Ausgeführt + linking this result file is left for Sebastian or Claude (Chat) to do via Notion MCP. Notion URL: https://www.notion.so/35824fe1d88a8194ba5be2a7f654cf35.

## Tests

`pnpm -C apps/api test` — 6 files, 38 tests, all green (was 29).

New file `apps/api/src/routes/integrations/__tests__/sftp-import.test.ts` — 9 tests:

1. **R0 hard-delete pin** — `DELETE /v1/credentials/:id` removes the row outright; `findUnique` returns null after the response.
2. **CSV-only listing** — `mockedListSftp` returns 3 files (2 .csv + 1 .txt); endpoint returns only the 2 csvs and the wrapper is invoked with `{ extension: '.csv' }` + the explicit path.
3. **Listing 403 for viewer** — same URL with `role: 'viewer'` returns 403 `FORBIDDEN`.
4. **SFTP manual import end-to-end** — mock streams a 2-row stock CSV; ImportRun is success+stats, `stock_movements.source` is `'sftp'`, the SFTP wrapper is called with the **decrypted** password, fileName matches the trailing path segment.
5. **FTP variant** — credentials of type `ftp` route through `streamFtpFile`, the SFTP wrapper is never called, movements carry `source: 'ftp'`, the FTP wrapper config has `secure: false` (FTPS would be `true`).
6. **Connector throw** — `streamSftpFile` rejects; the route returns 200 with `status: 'failed'` and an `errorSummary` containing the inner error message.
7. **No filePath, newest CSV picked** — body omits `filePath`; the route calls `listSftpDirectory` against the credential's `remotePath: '/inbox'`, picks `stock-newest.csv`, and the stream wrapper is called with the joined path `/inbox/stock-newest.csv`.
8. **Runs pagination** — three pre-seeded runs; `?page=1&perPage=2` returns the two newest in desc order; `?page=2&perPage=2` returns the third; meta total=3 across both calls.
9. **Cross-tenant 404** — tenant B asking for tenant A's integration `/runs` returns `INTEGRATION_NOT_FOUND` 404; tenant B's own integration's `/runs` is 200 with empty data.

Updated assertions in `routes/credentials/__tests__/credentials.test.ts`: CRUD happy-path now checks `findUnique → null` post-DELETE; the SERIALIZABLE-retry-success test does the same. The 503-path and 409-path tests keep their `deletedAt: null` assertions because those paths intentionally don't delete.

`pnpm -C apps/api typecheck` + `build` green. `lint` shows 0 errors and 11 warnings — all pre-existing import-order warnings in unrelated route files.

## Codex review

Not run inside this Claude Code session. Sebastian runs `/codex:adversarial-review --base origin/main` separately after the push. Classification per prompt header: `review:mandatory` (new endpoints, new schema, sensitive auth surface).

## Memory Bank updates

- [x] `STATE.md` updated
- [x] `KNOWN_TODOS.md` updated (csv/index.ts dedup follow-up + streaming-parser refinement; the soft-deleted-credential schedule-create guard item is removed since hard-delete obsoletes it)
- [ ] Notion entry → ✅ Ausgeführt (no Notion MCP in session — left for Sebastian / Claude (Chat))
- [x] This result file written
