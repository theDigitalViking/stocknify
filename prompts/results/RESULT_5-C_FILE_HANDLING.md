# RESULT: Cycle 5-C — File-Handling (success archive/delete + failed retry/cleanup)

**Prompt:** `prompts/PROMPT_5-C_FILE_HANDLING.md`
**Notion:** https://www.notion.so/36824fe1d88a81779f2afe60a5ce1fd2
**Branch:** develop
**Last commit:** (carry-over `cef625d` + this cycle's feature commit)
**Date:** 2026-05-22

---

## Summary

Cycle 5-C wires post-import file handling onto every SFTP/FTP import path. Five new columns on `Integration` (`postImportAction`, `archiveSubdir`, `maxImportRetries`, `failedAction`, `failedSubdir`) drive a shared service module (`applyPostImportAction`) that both the BullMQ worker and the manual-import route call after every finalised `ImportRun`. Successful imports (status ∈ {success, partial}) archive or delete the source CSV; scheduled-failed imports retry across cron ticks until the per-filename failed count exceeds `maxImportRetries` (counter derived from history, not stored); manual-failed imports cleanup immediately (effective retries=0). Six new connector primitives (3 SFTP + 3 FTP) supply `ensure-dir` / `move` / `delete`. The Edit-Page gains a "Nach-Import-Verhalten" section between Mapping and Schedule with Success + Failed sub-blocks and an inline manual-no-retry note; the Wizard Step 5 summary shows the default policy; the "Jetzt importieren" dialog surfaces the no-auto-retry contract.

## Files changed

**Backend — Schema + migration:**
- `apps/api/src/db/schema.prisma` — `Integration` gains 5 fields (`postImportAction`, `archiveSubdir`, `maxImportRetries`, `failedAction`, `failedSubdir`) with NOT NULL + defaults.
- `apps/api/src/db/migrations/20260522190000_integration_post_import_handling/migration.sql` — `ALTER TABLE integrations ADD COLUMN …` with defaults, no separate UPDATE needed.

**Backend — Connectors:**
- `apps/api/src/integrations/sftp-client.ts` — `ensureSftpDirectory` (recursive mkdir), `moveSftpFile` (rename), `deleteSftpFile`. `OP_TIMEOUT_MS = 30_000`. Errors funnel through `sanitizeConnectionError`.
- `apps/api/src/integrations/ftp-client.ts` — symmetric `ensureFtpDirectory` (`ensureDir`), `moveFtpFile` (`rename`), `deleteFtpFile` (`remove`). Same sanitiser pattern.

**Backend — Shared service + helpers:**
- `apps/api/src/lib/remote-path.ts` — **new** `joinRemotePath` / `baseName` / `dirName` extracted from the worker so both worker and service module share one helper module (was inline in `sftp-import.worker.ts`).
- `apps/api/src/services/integrations/post-import-action.ts` — **new** `applyPostImportAction` decision tree (success/partial → cleanup per `postImportAction`; manual + failed → immediate; scheduled + failed → counter > maxRetries). Archive destination: `<source-dir>/<subdir>/<YYYY-MM>/<filename>` (UTC bucket). Cleanup errors are appended to `ImportRun.errorSummary` and never thrown past the caller.

**Backend — Worker wiring:**
- `apps/api/src/jobs/sftp-import.worker.ts` — imports the shared `joinRemotePath`, imports `applyPostImportAction`. `filePath` hoisted to the wider scope so the catch path can pass it. New `runPostImportCleanup(status)` closure gates the failed branch on `isFinalAttempt` (BullMQ retry-burst safety) and the no-filePath path. Called after `markScheduleAndHealth` on the success path, the invalid-template early return, and the catch path.

**Backend — Manual-import wiring:**
- `apps/api/src/routes/integrations/sftp-import.ts` — `integrationDefaults` select extended with the 5 new fields + `tenantId` + `lastSuccessfulSyncAt`. `filePath` hoisted. New `runPostImportCleanupManual(status)` closure passes `trigger: 'manual'` so the service module branches into the failed-immediately path. Called on both the success-finalise path and the catch path. Response re-reads the `ImportRun` after cleanup so any appended `errorSummary` (cleanup-failure note) reaches the operator immediately.

**Backend — PATCH surface:**
- `apps/api/src/routes/integrations/index.ts` — `updateIntegrationSchema` accepts 5 new fields. Enum for actions, range 0–10 for retries, `SUBDIR_PATTERN = /^[A-Za-z0-9_-]+$/` for subdirs (rejects slashes, dots, whitespace → no path-traversal). Passed through to the Prisma update directly (no Zod-to-Prisma transform needed).

**Frontend — Edit page:**
- `apps/web/src/app/(dashboard)/integrations/automatic/[id]/page.tsx` — new section "Nach-Import-Verhalten" between Mapping and Schedule. Two sub-blocks (Success + Failed) with segmented-button radios (mirrors `credential-form.tsx`'s pattern; no Radix RadioGroup needed for two options). Draft-then-blur inputs for `archiveSubdir` / `failedSubdir` / `maxImportRetries`. Auto-save via `useUpdateIntegration` + subtle saved/saveFailed toasts. Inline `manualRetryNote` reminds operators that manual imports don't honour the retry counter.

**Frontend — Wizard + import dialog:**
- `apps/web/src/components/integrations/setup-wizard.tsx` — `Step5Summary` gains two new `SummaryRow`s (success-handling = "Archive", failed-handling = "Archive (Retries: 3)") sourced from `integrations.sftp.config`. New installs inherit the schema defaults; the wizard doesn't expose toggles, the Edit-Page does.
- `apps/web/src/components/integrations/import-runs-table.tsx` — `ImportNowDialog` body gains an italic `manualImportNoRetryNote` paragraph above the footer.

**Frontend — Hooks + i18n:**
- `apps/web/src/lib/api/use-integrations.ts` — `UpdateIntegrationInput` and `IntegrationDetail` extended with the 5 fields (typed enums for actions).
- `apps/web/messages/en.json` + `apps/web/messages/de.json` — 14 new keys under `integrations.sftp.config` + 1 new under `integrations.sftp.runs.importDialog`.

**Tests:**
- `apps/api/src/integrations/__tests__/file-operations.test.ts` — **new**, 6 smoke tests asserting each primitive invokes the right library method.
- `apps/api/src/services/integrations/__tests__/post-import-action.test.ts` — **new**, 11 tests covering success/partial cleanup, manual-failed cleanup, scheduled-failed counter (below threshold, exact threshold, above threshold), counter reset after success, cleanup-throw `errorSummary` append, unknown-action skip.
- `apps/api/src/jobs/__tests__/sftp-import.worker.test.ts` — extended with 3 cleanup-wiring tests (final-attempt invokes service, non-final-attempt does not, filePath-unresolved does not).
- `apps/api/src/routes/integrations/__tests__/sftp-import.test.ts` — extended with 2 manual-import cleanup tests (success → archive call, failed → delete called immediately).
- `apps/api/src/routes/integrations/__tests__/integration-config-anchor.test.ts` — extended with 7 PATCH cases (combined-set 200, enum-invalid 400, subdir-pattern 400 × 7 cases, subdir-valid 200, retries-out-of-range 400, retries-boundary 200).

## Key decisions made during execution

- **Carry-over commit scope:** the user's command listed `NEXT.md` + `PROMPT_5-C_FILE_HANDLING.md`, but the working tree also had unstaged changes on `DECISIONS.md` + `PROMPT_TEMPLATE.md` plus an untracked `REVIEW_TEMPLATE.md` — all clearly memory-bank carry-over from the prior chat session. Bundled all of them into the single `chore(memory-bank)` commit per WORKFLOW.md's carry-over whitelist. `PROMPT_5-C_FILE_HANDLING.md` was force-added because `prompts/*` is gitignored (only `_state/`, `_templates/`, and TEMPLATE_*.md unignored) — same pattern as the prior cycle's `bd8659a`.
- **Connector error sanitisation:** new primitives wrap each lib call in `try { await withTimeout(...) } catch { throw new Error(sanitizeConnectionError(err)) }` — symmetric with the existing list/stream helpers, so cleanup failures surface with the same redaction posture as connection failures. The service module's catch-block then truncates to 200 chars before appending to `errorSummary`.
- **Worker filePath hoisting:** the catch path needed access to `filePath`, which was previously scoped inside the try block. Hoisted to a `let filePath: string | undefined` and gated cleanup on `filePath !== undefined`. The "no CSV files in directory" early return preserves its existing behaviour (no cleanup — there's no file to clean) by leaving `filePath` undefined.
- **Cleanup gate option (c):** the prompt offered three options for handling BullMQ retry-burst interaction. Picked option (c) — gate cleanup on `isFinalAttempt` for the failed path, success path always runs. Cleanest, no schema change, aligned with the existing `Incident`/`consecutiveFailures` gating. Encoded in the `runPostImportCleanup` closure: `if (status === 'failed' && !isFinalAttempt) return`.
- **Manual-import response re-read:** added a `findUnique` after `runPostImportCleanupManual` so the response payload reflects any `errorSummary` mutation from the cleanup branch. Operators triggering a manual import see cleanup-failure notes in the same HTTP response instead of having to refresh the runs table.
- **Radio component:** the Edit-Page section uses the segmented-button pattern from `credential-form.tsx` rather than pulling in `@radix-ui/react-radio-group`. Two-option set per sub-block, matches the existing protocol radio's visual language, no extra dependency.
- **Subdir empty-on-blur:** when the operator blurs the subdir input with an empty string, the draft resets to the current persisted value (no PATCH fired). Same pattern for out-of-range retry values. Keeps the contract simple: no client-side validation messages, the input self-heals.
- **Invalid-template early return cleanup:** the worker's invalid-template path (mapping template has wrong `direction` / `resourceType`) was originally a failed early return WITHOUT cleanup. Wired `runPostImportCleanup('failed')` into that path too — `filePath` is already resolved at that point, the run is finalised as failed, and the counter logic should treat it identically to any other scheduled-failed run.
- **`SUBDIR_PATTERN` strict:** `[A-Za-z0-9_-]+`, length ≤ 64. Rejects dots (so `.hidden` and `../escape` both fail), slashes (so `archive/nested` fails), and whitespace. Future cycle that needs templated paths (`<YYYY>`, `<filename>` expansion) will need a separate validator — tracked in KNOWN_TODOS.

## Skipped or deferred

- **Operator-defined archive path templates** (token expansion `<YYYY>` / `<filename>` / `<integration-name>` in the subdir/path strings). Currently only the `<YYYY-MM>` bucket is hardcoded; subdirs are plain folder names. → KNOWN_TODOS.
- **Re-import guard via `lastProcessedFilename` / hash dedupe** — still pending. The counter logic mitigates but doesn't eliminate: if cleanup-of-failed itself fails on every cron tick, the same file gets re-imported and re-failed. The counter still ticks (because `ImportRun` rows finalise as failed), so eventually max retries kicks in and the file moves out anyway, but the window is non-zero. → KNOWN_TODOS (re-mention; was already there).
- **No frontend tests.** Per Testing Strategy (DECISIONS 2026-05-02), frontend test infra remains queued.
- **Service module unit tests for `dirName`/`baseName` edge cases.** The remote-path helpers are exercised via the integration test paths but not directly unit-tested for empty-path / no-slash inputs. Not load-bearing for this cycle.
- **Locked-template cleanup** on cleanup-failure: if `applyPostImportAction` throws repeatedly, the locked template column would never reach `failed` — but it can't (helpers are wrapped in try/catch internally). No DEFERRED finding.

## Tests

Backend suite **105 → 149** (target was ≥130). All 12 test files green, 0 failures.

Build verification:
- `pnpm -C apps/api typecheck` → clean (0 errors).
- `pnpm -C apps/api lint` → 0 errors, 11 pre-existing warnings on untouched files.
- `pnpm -C apps/api build` → clean.
- `pnpm -C apps/web typecheck` → clean.
- `pnpm -C apps/web build` → green. `/integrations/automatic/[id]` first-load JS 6.57 → 7.29 kB (new section + Label primitive); `/integrations/automatic` unchanged at 5.44 kB.
- `pnpm -C apps/web lint` → 0 errors, 3 pre-existing warnings on untouched files.

## Codex review

Queued after the post-implementation push. Classification is `review:mandatory` — backend logic + schema migration + worker logic + multi-tenant data path + retry-counter semantics. Findings will be dispositioned in `prompts/results/REVIEW_5-C_FILE_HANDLING.md`.

## Memory Bank updates

- [x] `STATE.md` updated
- [x] `KNOWN_TODOS.md` updated
- [x] `NEXT.md` updated (S22 closed, 5-C marked done, 5-D up next)
- [ ] Notion entry → ✅ Ausgeführt (after Codex passes)
- [x] This result file written
