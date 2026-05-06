# RESULT: Cycle 3-B — Credential Vault Backend (CRUD, Encryption, Connection Test)

**Prompt:** `prompts/PROMPT_3-B_CREDENTIAL_VAULT.md`
**Notion:** https://www.notion.so/35824fe1d88a81ada391c7235352fc8a
**Branch:** develop
**Last commit:** see `git log -1` after this cycle's feature commit
**Date:** 2026-05-07

---

## Summary

First backend cycle of Batch 3. Built the `/v1/credentials` CRUD surface, AES-256-GCM encryption layer for sensitive fields, and SFTP/FTP connection-test endpoints (saved + unsaved). The `IntegrationCredential.integrationId` foreign key is now nullable so credentials can exist as standalone tenant-level entities reusable across multiple integrations (DECISIONS 2026-05-07). RLS policy was already in place from schema-v3; tests cover masking, soft-delete with in-use rejection, and cross-tenant isolation. 6 new tests, total backend suite 13 → 19 green.

## Files changed

**Schema + migration:**
- `apps/api/src/db/schema.prisma` — `IntegrationCredential.integrationId` is now `String?` and the `integration` relation is `Integration?`. `credentialType` comment extended with `'ftps'`. Tenant FK and other fields untouched.
- `apps/api/src/db/migrations/20260507120000_credential_integration_optional/migration.sql` — `ALTER TABLE integration_credentials ALTER COLUMN integration_id DROP NOT NULL`.

**New runtime files:**
- `apps/api/src/lib/encryption.ts` — `encrypt`/`decrypt` (key-injectable for testability), `encryptCredential`/`decryptCredential` (read key from `config.CREDENTIALS_ENCRYPTION_KEY`), and `MASKED_SECRET` constant (`'••••••••'`). Wire format: `iv_hex:authTag_hex:ciphertext_hex` with 12-byte IV + 16-byte tag. Format and lengths are validated on decrypt.
- `apps/api/src/integrations/connection-utils.ts` — `withTimeout` (10-s outer guard for libs that don't honour their own timeout), `sanitizeConnectionError` (newline-strip + 200-char cap + canned `'Connection failed'` fallback), `ConnectionTimeoutError` class, and shared `ConnectionTestResult` type.
- `apps/api/src/integrations/sftp-client.ts` — `testSftpConnection` thin wrapper around `ssh2-sftp-client` (`connect` → `end`, all errors funneled through `sanitizeConnectionError`). Exports the shape Cycle 3-C will extend with `listDirectory` / `streamFile`.
- `apps/api/src/integrations/ftp-client.ts` — `testFtpConnection` thin wrapper around `basic-ftp` (`access` → `close`); `secure: true` for FTPS routing.
- `apps/api/src/routes/credentials/index.ts` — full route file: `GET /credentials`, `POST /credentials`, `POST /credentials/test` (unsaved), `PATCH /credentials/:id`, `DELETE /credentials/:id`, `POST /credentials/:id/test` (saved). All routes go through `authMiddleware` + `tenantMiddleware`.

**Modified runtime files:**
- `apps/api/src/server.ts` — registered `credentialsRoutes` under the existing `/v1` prefix block.

**New test file:**
- `apps/api/src/routes/credentials/__tests__/credentials.test.ts` — 6 tests using the existing harness. `vi.mock` swaps the SFTP/FTP wrappers for vi.fn so no socket is opened.

**Dependencies:**
- `apps/api/package.json` — added `ssh2-sftp-client@^12.1.1`, `basic-ftp@^6.0.1`, dev-dep `@types/ssh2-sftp-client@^9.0.6`. (`ssh2-sftp-client` ships its own types in some versions but the `@types/` package is still useful for v12.)

## Key decisions made during execution

- **Stable `'••••••••'` mask, never decrypt-on-read.** The prompt offered "first-4-chars + ****" or `'••••••••'` as alternatives. I chose the constant mask — decrypting on every list response (a) burns CPU on a path that may be hit by inventory dashboards, (b) leaks secret length via the masked-prefix length, and (c) requires tests to assert the mask shape against decrypted-prefix output. The API returns `null` when a field isn't set and `MASKED_SECRET` when it is, so the UI can distinguish empty vs filled inputs without ever seeing plaintext.
- **PATCH-clear semantics via `null`.** `password: null` clears the field, `password: 'newpw'` re-encrypts and replaces, omitted leaves the existing ciphertext alone. This is a tri-state contract over the Zod `z.union([z.string().max(2048), z.null()]).optional()` — Prisma sees the explicit `null` in the update payload and writes `NULL` to the column.
- **Route-ordering note.** Registered `POST /credentials/test` before `POST /credentials/:id/test` even though Fastify's radix tree handles this correctly regardless of registration order — the literal-segment route is the more specific path and registering it first matches the established convention in other route files.
- **Encryption-key validation belt-and-suspenders.** Even though `config.ts` already enforces a 64-hex regex on `CREDENTIALS_ENCRYPTION_KEY`, `deriveKey` re-checks length + hex shape before each `createCipheriv` call. If a future cycle introduces a per-tenant key or a key-rotation path, the lib stays self-defending instead of trusting an unspecified caller.
- **Connection-test timeout: outer + inner.** `ssh2-sftp-client` accepts `readyTimeout` and honours it, but `basic-ftp` doesn't have a unified timeout knob. I wired the 10-second `withTimeout` outer race in addition to whatever the library's internal timeout is, so a misbehaving library can't hang a request. The route waits for `withTimeout` to settle, never the underlying connect promise.
- **Saved-credential connection-test missing-fields path.** If a saved credential has `host: null` or `username: null` (possible for `api_key`/`oauth` credential types stored in this same table later), the saved-test endpoint short-circuits with `400 CREDENTIAL_INCOMPLETE` instead of passing `null` to the connector. Today's POST schema requires `host` + `username` for the testable types, but the schema column is nullable so future credential types coexisting in this table won't accidentally be tested as SFTP.
- **Connection-test type guard.** The DB column accepts any string for `credentialType`; the route narrows to `'sftp' | 'ftp' | 'ftps'` via a runtime `isTestableType` predicate before calling the connector, returning `400 CREDENTIAL_TYPE_NOT_TESTABLE` for any other type. This keeps the route forward-compatible with the schema's other `credentialType` values (`api_key`/`oauth`/`webhook`/`basic_auth`) without risking a type-narrowing miss in TS.
- **`isActive: false` on soft-delete.** DELETE flips `deletedAt = now()` AND `isActive = false`. The `isActive` flag is otherwise unmanaged by these routes; setting it on soft-delete defends against any future query that filters on `isActive` instead of `deletedAt`.
- **`integrationId` validation on POST + PATCH.** When the body provides an `integrationId`, the route checks the integration belongs to the tenant before write — `404 INTEGRATION_NOT_FOUND` if not. PATCH also accepts `integrationId: null` (detach a credential from an integration) without further checks.

## Skipped or deferred

- **SSH key auth.** The schema has no dedicated `privateKey`/`publicKey` field. `ssh2-sftp-client` accepts a `privateKey` parameter, so the connector wrapper's `password` is the only auth mode wired today. Operators stay on password auth until a future cycle adds the schema column + form. Tracked in KNOWN_TODOS.
- **`additionalAttributes` is not encrypted.** The `additionalAttributes: Json` column is left as plain JSON. Today nothing writes to it, but if SSH-key auth is added there before a dedicated column exists, the values would land in plaintext. Tracked in KNOWN_TODOS.
- **Connection-test rate limiting.** No per-tenant or per-credential rate limit on the test endpoints; a malicious tenant could use them to scan their own remote-server fleet via Stocknify's IP. Out of scope for the credential vault cycle. Tracked in KNOWN_TODOS.
- **Encryption isolated unit tests.** The encryption helpers are exercised end-to-end through the routes (round-trip via `decryptCredential` in the CRUD happy-path test). Dedicated unit tests for tampered ciphertext / wrong key / invalid wire format / IV-length mismatch are deferred — covered next time a cycle touches the lib.
- **`PUT /v1/credentials/:id`.** Full-replace verb is intentionally not implemented; PATCH is sufficient for the Cycle 3-E UI flow.

## Tests

`pnpm -C apps/api test` — 5 files, 19 tests, all green (was 13). New: 6 in `routes/credentials/__tests__/credentials.test.ts`:

1. **CRUD happy path** — create returns masked password + 201, list shows masked + `usageCount: 0`, DB row holds an `iv:tag:ciphertext` blob that decrypts to the input plaintext, PATCH clears password (`null`) + sets token (string), DB token decrypts to new plaintext, DELETE returns `{ deleted: true }`, post-delete list is empty, post-delete PATCH 404s with `CREDENTIAL_NOT_FOUND`.
2. **Delete rejection** — credential referenced by an active `IntegrationSchedule` returns `409 CREDENTIAL_IN_USE`.
3. **Cross-tenant isolation** — tenant A creates a credential; tenant B's list is empty, PATCH/DELETE/test return 404 (no existence enumeration), tenant A's row remains intact in DB.
4. **Connection test (saved, success)** — `vi.mocked(testSftpConnection)` returns `{ success: true }`; route returns 200 + `{ success: true }`; the connector is called with the **decrypted** password; `lastVerifiedAt` is bumped.
5. **Connection test (saved, failure)** — mock returns `{ success: false, error: '...' }`; route returns 200 + payload; `lastVerifiedAt` stays `null`.
6. **Connection test (unsaved)** — `POST /credentials/test` with FTPS body routes through `testFtpConnection({ ..., secure: true })`, no DB write, no SFTP wrapper invocation.

`pnpm -C apps/api typecheck` + `build` + `lint` (0 errors) green. Pre-existing import-order warnings in unrelated route files left alone.

## Codex review

Not run for this cycle within Claude Code's session — Sebastian runs `/codex:adversarial-review --base origin/main` separately after the push. Classification per prompt header: `review:mandatory` (encryption + new endpoints + new auth-adjacent surface).

## Memory Bank updates

- [x] `STATE.md` updated
- [x] `KNOWN_TODOS.md` updated (SSH key auth, `additionalAttributes` encryption, connection-test rate limiting, encryption-lib unit tests)
- [x] Notion entry → ✅ Ausgeführt
- [x] This result file written
