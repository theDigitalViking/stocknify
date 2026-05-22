# PROMPT: Cycle 5-C — File-Handling (success archive/delete + failed retry/cleanup)

**Phase:** Phase 4
**Area:** Backend + Frontend (Schema + Connector + Worker + Manual-Import + Edit-Page)
**Type:** Feature
**Review:** review:mandatory
**Notion:** https://www.notion.so/36824fe1d88a81779f2afe60a5ce1fd2

---

## Context

Today every SFTP/FTP import — successful or failed — leaves the source CSV on the remote server. On a recurring schedule pulling the same file from the same directory, the worker either:
- silently re-imports the same data the next cron tick (success case — defensible because Stocknify's stock upserts are idempotent, but stock_movements still appends a row per identical-quantity import, so growth is real); or
- re-tries the same broken file forever (failed case — no automatic give-up, file accumulates retry noise in operator dashboards).

Sebastian's batch-5 triage (S22) and the follow-up planning discussion formalised the desired behaviour into two clean halves:

**Successful imports** (`status === 'success' || 'partial'`):
- Per-integration toggle: **delete** the source file, or **archive** it (move to `<source-dir>/<archiveSubdir>/<YYYY-MM>/<filename>`).
- Default: archive. Default subdir name: `archive`.

**Failed imports** (`status === 'failed'`):
- Scheduled imports retry the same file across cron ticks up to `maxImportRetries` times (0–10, default 3).
- After max retries reached: cleanup runs the **failed-action** (delete or move to `<source-dir>/<failedSubdir>/<YYYY-MM>/<filename>`).
- Default: archive. Default subdir name: `failed`.
- **Manual imports** (`POST /v1/integrations/:id/import-now`, triggered from the "Jetzt importieren"-button on the Edit-Page) behave as if `maxImportRetries === 0`: a single failed attempt runs the failed-cleanup immediately. The retry concept doesn't apply because manual imports are operator-driven one-shots — there's no scheduler to "try again later". UI states this explicitly so the operator isn't surprised.

The retry counter is derived from `ImportRun` history (failed runs for the same filename since the last successful run), not stored as a separate counter column — keeps schema minimal and makes the counter naturally reset when a success lands.

**Counter scope:** every `ImportRun` row (manual + scheduled) counts toward the audit-trail history. But the cleanup decision branches by trigger:
- Scheduled failed → check counter, conditionally cleanup
- Manual failed → cleanup immediately (effective retries=0)

This means the worker's pre-import path doesn't need to query the counter — it always processes the file. The post-import path (after status finalises) decides whether to cleanup based on (a) status, (b) trigger, and (c) for scheduled-failed: counter.

This is Batch 5's Phase-1 third cycle. After 5-A.5 (Integration-as-config-anchor) and 5-B (Schedule Builder polish), the schema slot for the five new fields is obvious — they all land on `Integration` next to `credentialId` / `csvMappingTemplateId` / `postImportAction` (wait — `postImportAction` is one of this cycle's NEW fields, not a previous cycle's).

## Non-goals

- **No operator-defined archive path templates (token expansion like `<YYYY>` / `<filename>`).** This cycle's `archiveSubdir` and `failedSubdir` are plain folder names; the full path is hardcoded `<source-dir>/<subdir>/<YYYY-MM>/<filename>`. Token-driven custom paths are a follow-up TODO.
- **No `Integration.importPath` support.** The source directory is still `credential.remotePath`. Cycle 5-E introduces `Integration.importPath`; 5-C's archive/failed path derivation uses `path.dirname(sourceFilePath)` so it works transparently after 5-E.
- **No retry of the cleanup operation itself.** If the move/delete operation throws, log + append to `ImportRun.errorSummary`, move on. The file may stay on the server; the next cron tick will pick it up again and the loop will retry (or hit the failed-retry counter again).
- **No FTPS-specific cleanup logic.** FTPS uses the FTP wrappers with `secure: true`.
- **No `maxImportRetries` of more than 10.** Hard cap at 10 — beyond that, the operator's data hygiene is more concerning than the retry policy.
- **No skip-cleanup body override on `POST /import-now`.** Manual triggers honour the integration's configuration as-is. If an operator wants to keep a file after a failed manual import, they should switch the failed-action to "archive" globally rather than per-call.
- **No `lastProcessedFilename` / hash-based dedupe guard.** Already in scope as a known follow-up; this cycle does not add it. The cleanup-failure case (file stays, gets re-imported) is documented as an explicit edge that the counter naturally handles — eventually max retries kicks in and the file is moved out anyway.

## Files involved

**Backend (modified):**
- `apps/api/src/db/schema.prisma` — `Integration` gains five fields (see R0).
- `apps/api/src/db/migrations/<timestamp>_integration_post_import_handling/migration.sql` — column adds, all with defaults.
- `apps/api/src/integrations/sftp-client.ts` — three new primitives: `moveSftpFile`, `deleteSftpFile`, `ensureSftpDirectory`.
- `apps/api/src/integrations/ftp-client.ts` — symmetric three for FTP/FTPS.
- `apps/api/src/jobs/sftp-import.worker.ts` — post-import cleanup branching on status + trigger + (for scheduled-failed) counter.
- `apps/api/src/routes/integrations/sftp-import.ts` — manual-import cleanup (effective `maxRetries === 0` for failed).
- `apps/api/src/routes/integrations/index.ts` — `PATCH /v1/integrations/:id` accepts the five new fields.
- `apps/api/src/services/integrations/post-import-action.ts` — **new file**, shared service module used by both the worker and the manual-import route.
- Test files for each touched surface.

**Frontend (modified):**
- `apps/web/src/app/(dashboard)/integrations/automatic/[id]/page.tsx` — new section "Nach-Import-Verhalten" between Mapping and Schedule, with two sub-blocks (success / failed).
- `apps/web/src/lib/api/use-integrations.ts` — `UpdateIntegrationInput` + `IntegrationDetail` extended with the five new fields.
- `apps/web/src/components/integrations/setup-wizard.tsx` — Step 5 summary gains two new rows (success-handling, failed-handling).
- `apps/web/src/components/integrations/import-runs-table.tsx` — the "Jetzt importieren" dialog gains a hint about no-auto-retry.
- `apps/web/messages/en.json` + `apps/web/messages/de.json` — i18n.

**Read for reference (no changes):**
- `apps/api/src/lib/marketplace-catalog.ts` — confirms `INTERNAL_INTEGRATIONS` shape.

## Pre-flight check (mandatory — do this FIRST, before writing any code)

> **TRANSITIONAL** — this section stays in every prompt until the memory bank has stabilized. See WORKFLOW.md § Pre-flight policy.

1. **Schema state.** Confirm `Integration` has `credentialId` + `csvMappingTemplateId` from Cycle 5-A.5 but none of the five fields this cycle adds (`postImportAction`, `archiveSubdir`, `maxImportRetries`, `failedAction`, `failedSubdir`). If any of those already exist — stop and flag.
2. **Connector state.** Confirm `sftp-client.ts` and `ftp-client.ts` have `list*Directory` + `stream*File` from Cycle 3-C but no move/delete/ensure-dir. If any helper already exists — flag.
3. **Worker shape.** Confirm `processSftpImportJob` resolves `filePath` via `joinRemotePath(dir, newest.name)` and finalises via `markScheduleAndHealth`. The cleanup branch is added AFTER that call.
4. **Manual-import shape.** Confirm `apps/api/src/routes/integrations/sftp-import.ts` has the symmetric flow and currently does no cleanup.
5. **PATCH integration shape.** Confirm `updateIntegrationSchema` exists and accepts at least `name`, `credentialId`, `csvMappingTemplateId`, `isEnabled` (Cycle 5-A.5).
6. **Frontend Edit-Page shape.** Confirm the section order: Header → Health → Credentials → Directory → Mapping → Schedule → Import history. The new section lands between Mapping and Schedule.
7. **Classify** as already-done / partially-done / not-done.

## Requirements

### R0 — Schema migration

`apps/api/src/db/schema.prisma`, `model Integration` block, add **five new fields**:

```prisma
model Integration {
  // ... existing fields including credentialId, csvMappingTemplateId (Cycle 5-A.5) ...

  // Cycle 5-C: post-import cleanup. Five fields total — success branch + failed branch.
  // Success cleanup runs whenever status ∈ {'success', 'partial'}.
  // Failed cleanup runs (a) immediately for manual triggers, (b) after `maxImportRetries`
  // consecutive scheduled-failed runs of the same filename (since last success).
  postImportAction   String  @default("archive")  @map("post_import_action")
  archiveSubdir      String  @default("archive")  @map("archive_subdir")
  maxImportRetries   Int     @default(3)          @map("max_import_retries")
  failedAction       String  @default("archive")  @map("failed_action")
  failedSubdir       String  @default("failed")   @map("failed_subdir")

  // ... rest of existing fields and relations ...
}
```

Constraints enforced at the API + service layer (Zod), not at the DB level:
- `postImportAction` ∈ {`'delete'`, `'archive'`}
- `failedAction` ∈ {`'delete'`, `'archive'`}
- `maxImportRetries` ∈ `[0, 10]`
- `archiveSubdir` and `failedSubdir`: non-empty strings, no `/`, no leading dot. Max length 64.

Migration SQL (`apps/api/src/db/migrations/<timestamp>_integration_post_import_handling/migration.sql`):

```sql
ALTER TABLE "integrations"
  ADD COLUMN "post_import_action" TEXT NOT NULL DEFAULT 'archive',
  ADD COLUMN "archive_subdir"     TEXT NOT NULL DEFAULT 'archive',
  ADD COLUMN "max_import_retries" INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN "failed_action"      TEXT NOT NULL DEFAULT 'archive',
  ADD COLUMN "failed_subdir"      TEXT NOT NULL DEFAULT 'failed';
```

All five columns are `NOT NULL DEFAULT …` — existing rows inherit the defaults on the same migration tick, no separate UPDATE needed.

### R1 — SFTP connector primitives

In `apps/api/src/integrations/sftp-client.ts`, add three exported async helpers. Each opens its own client, runs one op, closes. Symmetric with existing `list*` / `stream*`:

```ts
const OP_TIMEOUT_MS = 30_000

export async function ensureSftpDirectory(
  config: SftpTestConfig,
  remotePath: string,
): Promise<void> {
  const client = await connectSftp(config)
  try {
    // ssh2-sftp-client: mkdir(path, recursive). Recursive flag = true skips
    // intermediate-exists errors AND the final-segment-exists error.
    await withTimeout(client.mkdir(remotePath, true), OP_TIMEOUT_MS)
  } finally {
    try { await client.end() } catch { /* ignore */ }
  }
}

export async function moveSftpFile(
  config: SftpTestConfig,
  sourcePath: string,
  destPath: string,
): Promise<void> {
  const client = await connectSftp(config)
  try {
    await withTimeout(client.rename(sourcePath, destPath), OP_TIMEOUT_MS)
  } finally {
    try { await client.end() } catch { /* ignore */ }
  }
}

export async function deleteSftpFile(
  config: SftpTestConfig,
  remotePath: string,
): Promise<void> {
  const client = await connectSftp(config)
  try {
    await withTimeout(client.delete(remotePath), OP_TIMEOUT_MS)
  } finally {
    try { await client.end() } catch { /* ignore */ }
  }
}
```

### R2 — FTP connector primitives

In `apps/api/src/integrations/ftp-client.ts`, mirror the three above using `basic-ftp`. Library API: `ensureDir(path)` (recursive), `rename(src, dest)`, `remove(path)`. Wrap each in the existing `withTimeout` + `sanitizeConnectionError` pattern. Match the shape of the existing list/stream helpers.

### R3 — Shared service module

Create new file `apps/api/src/services/integrations/post-import-action.ts`. Exports one function that both the worker and the manual-import route call:

```ts
import type { PrismaClient } from '@prisma/client'

export interface PostImportActionArgs {
  db: PrismaClient
  log: {
    info: (...a: unknown[]) => void
    warn: (...a: unknown[]) => void
    error: (...a: unknown[]) => void
  }
  integration: {
    id: string
    tenantId: string
    postImportAction: string
    archiveSubdir: string
    maxImportRetries: number
    failedAction: string
    failedSubdir: string
    lastSuccessfulSyncAt: Date | null
  }
  credentialType: string  // 'sftp' | 'ftp' | 'ftps'
  remoteConfig: {
    host: string
    port: number
    username: string
    password?: string
  }
  sourceFilePath: string  // full remote path of the imported file
  importRunStatus: 'success' | 'partial' | 'failed'
  importRunId: string
  trigger: 'scheduled' | 'manual'
}

export async function applyPostImportAction(args: PostImportActionArgs): Promise<void>
```

**Logic:**

```ts
export async function applyPostImportAction(args: PostImportActionArgs): Promise<void> {
  const { importRunStatus, trigger, integration } = args

  // Success path — always cleanup per postImportAction (delete or archive).
  if (importRunStatus === 'success' || importRunStatus === 'partial') {
    await runCleanup({
      ...args,
      action: integration.postImportAction,
      subdir: integration.archiveSubdir,
      label: 'success-cleanup',
    })
    return
  }

  // Failed path — branch on trigger.
  if (trigger === 'manual') {
    // Manual = effective retries 0 → cleanup immediately.
    await runCleanup({
      ...args,
      action: integration.failedAction,
      subdir: integration.failedSubdir,
      label: 'failed-cleanup-manual',
    })
    return
  }

  // Scheduled-failed: count prior failed runs for the same filename since the
  // last success. The current (just-finalised) run is included.
  const fileName = baseName(args.sourceFilePath)
  const since = integration.lastSuccessfulSyncAt
  const failedCount = await args.db.importRun.count({
    where: {
      integrationId: integration.id,
      fileName,
      status: 'failed',
      ...(since ? { createdAt: { gt: since } } : {}),
    },
  })

  if (failedCount > integration.maxImportRetries) {
    await runCleanup({
      ...args,
      action: integration.failedAction,
      subdir: integration.failedSubdir,
      label: 'failed-cleanup-scheduled',
    })
  } else {
    args.log.info(
      `Scheduled-failed: ${String(failedCount)} of ${String(integration.maxImportRetries + 1)} attempts — keeping file for next cron tick`,
    )
  }
}

interface RunCleanupArgs extends PostImportActionArgs {
  action: string  // 'delete' | 'archive'
  subdir: string
  label: string  // for logging context
}

async function runCleanup(args: RunCleanupArgs): Promise<void> {
  if (args.action !== 'delete' && args.action !== 'archive') {
    args.log.warn(`Unknown action "${args.action}" — skipping ${args.label}`)
    return
  }

  try {
    if (args.action === 'delete') {
      await deleteRemoteFile(args.credentialType, args.remoteConfig, args.sourceFilePath)
      args.log.info(`${args.label}: deleted ${args.sourceFilePath}`)
      return
    }

    // 'archive' — move to <source-dir>/<subdir>/<YYYY-MM>/<basename>
    const sourceDir = dirName(args.sourceFilePath)
    const file = baseName(args.sourceFilePath)
    const now = new Date()
    const yearMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
    const archiveDir = joinRemotePath(joinRemotePath(sourceDir, args.subdir), yearMonth)
    const destPath = joinRemotePath(archiveDir, file)

    await ensureRemoteDirectory(args.credentialType, args.remoteConfig, archiveDir)
    await moveRemoteFile(args.credentialType, args.remoteConfig, args.sourceFilePath, destPath)
    args.log.info(`${args.label}: moved ${args.sourceFilePath} → ${destPath}`)
  } catch (err) {
    const message =
      err instanceof Error
        ? `${args.label} failed: ${err.message.slice(0, 200)}`
        : `${args.label} failed`
    args.log.warn(message)

    // Read-modify-write — append to existing errorSummary so partial-import
    // context is preserved alongside the cleanup-failure note.
    const existing = await args.db.importRun.findUnique({
      where: { id: args.importRunId },
      select: { errorSummary: true },
    })
    const combined = existing?.errorSummary ? `${existing.errorSummary} | ${message}` : message
    await args.db.importRun.update({
      where: { id: args.importRunId },
      data: { errorSummary: combined },
    })
  }
}
```

**Helper functions** (`deleteRemoteFile`, `moveRemoteFile`, `ensureRemoteDirectory`, `joinRemotePath`, `dirName`, `baseName`) — define at module scope. `joinRemotePath` already exists in `sftp-import.worker.ts`; either copy here, or extract to a shared `apps/api/src/lib/remote-path.ts`. **Pick extraction** — it's clearly shared territory now. The worker imports from there too post-refactor.

The three remote-op helpers delegate to SFTP or FTP variants based on `credentialType`:

```ts
async function deleteRemoteFile(
  type: string,
  cfg: { host: string; port: number; username: string; password?: string },
  remotePath: string,
): Promise<void> {
  if (type === 'sftp') return deleteSftpFile(buildSftpConfig(cfg), remotePath)
  if (type === 'ftp' || type === 'ftps') {
    return deleteFtpFile(buildFtpConfig(cfg, type === 'ftps'), remotePath)
  }
  throw new Error(`Unsupported credential type: ${type}`)
}
```

`buildSftpConfig` / `buildFtpConfig` already exist in the worker — extract to the shared module or inline (preference: inline for simplicity in this cycle, the worker's existing copy stays as-is).

### R4 — Worker integration

In `apps/api/src/jobs/sftp-import.worker.ts`:

1. **Extend the schedule loader's `include`** to pull the five new fields on integration (they're scalars, included by default — verify the include statement doesn't have a restrictive `select` filtering them out).
2. **After `markScheduleAndHealth`** in both the success-path return and the catch-block path, call `applyPostImportAction`:

```ts
// Success-path (existing, before final return):
await markScheduleAndHealth(/* ... */, status, /* ... */)

await applyPostImportAction({
  db,
  log,
  integration: {
    id: integration.id,
    tenantId: schedule.tenantId,
    postImportAction: integration.postImportAction,
    archiveSubdir: integration.archiveSubdir,
    maxImportRetries: integration.maxImportRetries,
    failedAction: integration.failedAction,
    failedSubdir: integration.failedSubdir,
    lastSuccessfulSyncAt: integration.lastSuccessfulSyncAt,
  },
  credentialType: credential.credentialType,
  remoteConfig: cfg,
  sourceFilePath: filePath,
  importRunStatus: status,
  importRunId: importRun.id,
  trigger: 'scheduled',
})

return { status, importRunId: importRun.id }
```

```ts
// Catch-path (the existing catch-all at the bottom). After
// finalizeFailedRun + markScheduleAndHealth:

await applyPostImportAction({
  // … same shape as above …
  importRunStatus: 'failed',
  sourceFilePath: filePath ?? '<unknown>',  // may not have been resolved if connector threw early
  trigger: 'scheduled',
})

throw err  // existing re-throw for BullMQ retry tracking
```

**Edge case:** if the connector threw before `filePath` was resolved (e.g. connection failed during `listRemote`), `filePath` is `undefined`. In that case, **do NOT call `applyPostImportAction`** — there's no file to clean up. The failed-counter still ticks (because the `ImportRun` is finalised as `failed`), so the next cron tick that DOES manage to resolve the filename will see the counter and cleanup if applicable. Guard with `if (filePath !== undefined) { … }`.

The BullMQ retry semantics interact subtly with the failed-counter: each retry attempt creates a fresh `ImportRun` (wait — verify; if a single cron tick reuses the same ImportRun across BullMQ retries, the counter logic changes). Read the existing worker carefully to confirm. From Cycle 3-D: each retry creates a NEW ImportRun row, but `Incident` and `consecutiveFailures` only bump on `isFinalAttempt`. So three BullMQ retries within one cron tick = three failed `ImportRun` rows for the same filename. The counter would tick to 3 in one tick.

**This needs handling.** Options:
- (a) Count only `isFinalAttempt` failures (the last try of each BullMQ retry burst). Add a column `was_final_attempt` to `ImportRun` and filter on it in the counter query. Cleaner but more schema.
- (b) Count distinct `(scheduleId, integrationId, fileName, cronTick)` — but "cronTick" isn't a concept.
- (c) Only apply cleanup on `isFinalAttempt`. The worker function already knows `isFinalAttempt` via `opts.isFinalAttempt`. Call `applyPostImportAction` only when `isFinalAttempt === true` for the failed-path. Success-path always calls (no retry concept for success).

**Pick option (c).** It's the simplest, doesn't change the schema, and aligns with the existing pattern where `Incident` / `consecutiveFailures` already gate on `isFinalAttempt`. The counter query then sees one failed run per cron tick (the final attempt), and the math works out.

Update the worker's call site:

```ts
if (importRunStatus === 'success' || importRunStatus === 'partial' || isFinalAttempt) {
  await applyPostImportAction({ /* ... */ })
}
```

### R5 — Manual-import integration

In `apps/api/src/routes/integrations/sftp-import.ts`, the `POST /v1/integrations/:id/import-now` handler currently finalises the `ImportRun` and returns. After the finalise step:

```ts
await applyPostImportAction({
  db: request.db,
  log: request.log,
  integration: {
    id: integration.id,
    tenantId: integration.tenantId,
    postImportAction: integration.postImportAction,
    archiveSubdir: integration.archiveSubdir,
    maxImportRetries: integration.maxImportRetries,
    failedAction: integration.failedAction,
    failedSubdir: integration.failedSubdir,
    lastSuccessfulSyncAt: integration.lastSuccessfulSyncAt,
  },
  credentialType: credential.credentialType,
  remoteConfig: cfg,
  sourceFilePath: filePath,
  importRunStatus: status,
  importRunId: importRun.id,
  trigger: 'manual',  // <-- the key bit
})
```

`trigger: 'manual'` is what tells the service module: ignore the counter, cleanup immediately on failed.

**Confirm the integration row fetched at the route entry includes the five new fields** — extend the `select` or `include` if needed.

### R6 — PATCH /v1/integrations/:id accepts the new fields

In `apps/api/src/routes/integrations/index.ts`, extend `updateIntegrationSchema`:

```ts
const SUBDIR_PATTERN = /^[A-Za-z0-9_\-]+$/  // no slashes, no dots, alphanumeric + dash + underscore

const updateIntegrationSchema = z.object({
  name: z.string().min(1).max(/* existing cap */).optional(),
  isEnabled: z.boolean().optional(),
  credentialId: z.string().uuid().nullable().optional(),
  csvMappingTemplateId: z.string().uuid().nullable().optional(),
  postImportAction: z.enum(['delete', 'archive']).optional(),
  archiveSubdir: z.string().min(1).max(64).regex(SUBDIR_PATTERN).optional(),
  maxImportRetries: z.number().int().min(0).max(10).optional(),
  failedAction: z.enum(['delete', 'archive']).optional(),
  failedSubdir: z.string().min(1).max(64).regex(SUBDIR_PATTERN).optional(),
})
```

The `SUBDIR_PATTERN` rejects path-traversal attempts (`../`, `./`) and slashes (which would let the operator place archive elsewhere — out of scope for this cycle, the subdir is a folder name only).

Persist via the existing `prisma.integration.update` call site.

### R7 — Frontend: "Nach-Import-Verhalten" section

In `apps/web/src/app/(dashboard)/integrations/automatic/[id]/page.tsx`, add a new section between Mapping and Schedule. Match the existing `<section className="rounded-lg border border-border bg-card p-4 space-y-3">` shell.

**Layout:**

```tsx
<section className="rounded-lg border border-border bg-card p-4 space-y-4">
  <h2 className="text-sm font-semibold text-foreground">{t('postImportActionSection')}</h2>

  {/* Sub-block 1: Erfolgreiche Imports */}
  <div className="space-y-2">
    <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
      {t('postImportSuccessSubsection')}
    </h3>
    <RadioGroup
      value={integration.postImportAction}
      onValueChange={(next) => handleUpdate({ postImportAction: next as 'delete' | 'archive' })}
    >
      <div className="flex items-center gap-3 text-sm">
        <RadioGroupItem value="archive" id="success-action-archive" />
        <Label htmlFor="success-action-archive">{t('actionArchive')}</Label>
      </div>
      <div className="flex items-center gap-3 text-sm">
        <RadioGroupItem value="delete" id="success-action-delete" />
        <Label htmlFor="success-action-delete">{t('actionDelete')}</Label>
      </div>
    </RadioGroup>
    {integration.postImportAction === 'archive' ? (
      <div className="space-y-1">
        <Label htmlFor="archive-subdir" className="text-xs">{t('archiveSubdirLabel')}</Label>
        <Input
          id="archive-subdir"
          value={archiveSubdirDraft}
          onChange={(e) => setArchiveSubdirDraft(e.target.value)}
          onBlur={() => {
            if (archiveSubdirDraft !== integration.archiveSubdir) {
              handleUpdate({ archiveSubdir: archiveSubdirDraft })
            }
          }}
          className="w-48 text-sm"
        />
        <p className="text-xs text-muted-foreground">
          {t('archivePathHint', { subdir: archiveSubdirDraft || 'archive' })}
        </p>
      </div>
    ) : null}
  </div>

  {/* Sub-block 2: Fehlgeschlagene Imports */}
  <div className="space-y-2 pt-3 border-t border-border">
    <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
      {t('postImportFailedSubsection')}
    </h3>
    <div className="space-y-1">
      <Label htmlFor="max-retries" className="text-xs">{t('maxRetriesLabel')}</Label>
      <Input
        id="max-retries"
        type="number"
        min={0}
        max={10}
        value={maxRetriesDraft}
        onChange={(e) => setMaxRetriesDraft(e.target.value)}
        onBlur={() => {
          const n = Number.parseInt(maxRetriesDraft, 10)
          if (Number.isFinite(n) && n >= 0 && n <= 10 && n !== integration.maxImportRetries) {
            handleUpdate({ maxImportRetries: n })
          }
        }}
        className="w-24 text-sm"
      />
      <p className="text-xs text-muted-foreground">{t('maxRetriesHint')}</p>
      <p className="text-xs text-muted-foreground italic">{t('manualRetryNote')}</p>
    </div>
    <RadioGroup
      value={integration.failedAction}
      onValueChange={(next) => handleUpdate({ failedAction: next as 'delete' | 'archive' })}
    >
      <div className="flex items-center gap-3 text-sm">
        <RadioGroupItem value="archive" id="failed-action-archive" />
        <Label htmlFor="failed-action-archive">{t('actionArchive')}</Label>
      </div>
      <div className="flex items-center gap-3 text-sm">
        <RadioGroupItem value="delete" id="failed-action-delete" />
        <Label htmlFor="failed-action-delete">{t('actionDelete')}</Label>
      </div>
    </RadioGroup>
    {integration.failedAction === 'archive' ? (
      <div className="space-y-1">
        <Label htmlFor="failed-subdir" className="text-xs">{t('failedSubdirLabel')}</Label>
        <Input
          id="failed-subdir"
          value={failedSubdirDraft}
          onChange={(e) => setFailedSubdirDraft(e.target.value)}
          onBlur={() => {
            if (failedSubdirDraft !== integration.failedSubdir) {
              handleUpdate({ failedSubdir: failedSubdirDraft })
            }
          }}
          className="w-48 text-sm"
        />
        <p className="text-xs text-muted-foreground">
          {t('failedPathHint', { subdir: failedSubdirDraft || 'failed' })}
        </p>
      </div>
    ) : null}
  </div>
</section>
```

**State management:**
- The subdir inputs are draft-then-blur (text-input pattern from 5-A.5's directory path edit — save on blur if changed).
- The retry count is also draft-then-blur with int parsing.
- Radio changes auto-save immediately (analog to 5-A.5's credential/mapping pattern).
- The `handleUpdate` helper wraps `useUpdateIntegration` with subtle success/error toasts (`t('saved')` / `t('saveFailed')`).
- `archiveSubdirDraft`, `failedSubdirDraft`, `maxRetriesDraft` are local `useState` strings, seeded from the integration row on mount + on integration query refetch.

**Conditional rendering:** subdir input only shows when the corresponding action is `'archive'`. Switching to `'delete'` hides it but doesn't reset the stored value — the operator can switch back without re-typing.

### R8 — Frontend: wizard summary rows

In `apps/web/src/components/integrations/setup-wizard.tsx`, `Step5Summary` gains two new `SummaryRow`s:

```tsx
<SummaryRow
  label={tConfig('postImportSuccessSubsection')}
  value={tConfig(state.scheduleEnabled ? 'actionArchive' : 'actionArchive')}  // default for new installs
/>
<SummaryRow
  label={tConfig('postImportFailedSubsection')}
  value={`${tConfig('actionArchive')} (${tConfig('maxRetriesLabel')}: 3)`}  // default for new installs
/>
```

The wizard doesn't change these fields — new installs inherit the schema defaults. The summary exists for transparency. Pull `tConfig = useTranslations('integrations.sftp.config')`.

### R9 — Frontend: "Jetzt importieren" dialog hint

In `apps/web/src/components/integrations/import-runs-table.tsx`, the dialog body gains a hint paragraph:

```tsx
<p className="text-xs text-muted-foreground italic">
  {t('manualImportNoRetryNote')}
</p>
```

Hint text (en): *"Manual imports do not retry automatically. If the import fails, the source file is handled immediately according to the failed-import setting."*

DE: *"Manuelle Imports werden nicht automatisch wiederholt. Schlägt der Import fehl, wird die Quelldatei sofort gemäß der Failed-Import-Einstellung verarbeitet."*

Place above the confirm button, below the existing description.

### R10 — `useUpdateIntegration` + `IntegrationDetail` extension

In `apps/web/src/lib/api/use-integrations.ts`:

```ts
export interface UpdateIntegrationInput {
  id: string
  name?: string
  isEnabled?: boolean
  credentialId?: string | null
  csvMappingTemplateId?: string | null
  postImportAction?: 'delete' | 'archive'
  archiveSubdir?: string
  maxImportRetries?: number
  failedAction?: 'delete' | 'archive'
  failedSubdir?: string
}

export interface IntegrationDetail {
  // ... existing fields ...
  postImportAction: 'delete' | 'archive'
  archiveSubdir: string
  maxImportRetries: number
  failedAction: 'delete' | 'archive'
  failedSubdir: string
}
```

### R11 — i18n

Add to **both** `en.json` and `de.json` under `integrations.sftp.config`:

| Key | EN | DE |
|-----|----|----|
| `postImportActionSection` | "After import" | "Nach dem Import" |
| `postImportSuccessSubsection` | "Successful imports" | "Erfolgreiche Imports" |
| `postImportFailedSubsection` | "Failed imports" | "Fehlgeschlagene Imports" |
| `actionArchive` | "Archive" | "Archivieren" |
| `actionDelete` | "Delete" | "Löschen" |
| `archiveSubdirLabel` | "Archive folder name" | "Archiv-Ordnername" |
| `failedSubdirLabel` | "Failed-import folder name" | "Fehler-Ordnername" |
| `archivePathHint` | "Files will be moved to `<remotePath>/{subdir}/<YYYY-MM>/`." | "Dateien werden nach `<remotePath>/{subdir}/<YYYY-MM>/` verschoben." |
| `failedPathHint` | "Failed files will be moved to `<remotePath>/{subdir}/<YYYY-MM>/`." | "Fehlerhafte Dateien werden nach `<remotePath>/{subdir}/<YYYY-MM>/` verschoben." |
| `maxRetriesLabel` | "Retry attempts" | "Wiederholungen" |
| `maxRetriesHint` | "How often a failed file is retried by the scheduler before the failed-action runs (0–10)." | "Wie oft eine fehlgeschlagene Datei vom Scheduler erneut versucht wird, bevor die Failed-Aktion greift (0–10)." |
| `manualRetryNote` | "Manual imports always run with retries=0 — the failed-action applies immediately on failure." | "Manuelle Imports laufen immer mit Wiederholungen=0 — die Failed-Aktion greift sofort beim Fehlschlag." |
| `saved` | "Saved" | "Gespeichert" |
| `saveFailed` | "Could not save" | "Speichern fehlgeschlagen" |

Add under `integrations.sftp.list` (for the "Jetzt importieren" dialog):

| Key | EN | DE |
|-----|----|----|
| `manualImportNoRetryNote` | "Manual imports do not retry automatically. If the import fails, the source file is handled immediately according to the failed-import setting." | "Manuelle Imports werden nicht automatisch wiederholt. Schlägt der Import fehl, wird die Quelldatei sofort gemäß der Failed-Import-Einstellung verarbeitet." |

### R12 — Tests

Backend test additions:

**Connector primitives smoke** (new `apps/api/src/integrations/__tests__/file-operations.test.ts`): mock the libraries, assert `moveSftpFile` / `deleteSftpFile` / `ensureSftpDirectory` call the right library methods with the right arguments. Same for FTP three.

**Service module tests** (new `apps/api/src/services/integrations/__tests__/post-import-action.test.ts`):
- Success + archive: assert ensure+move helpers called with `<dir>/<archive-subdir>/<YYYY-MM>/<file>`.
- Success + delete: assert delete called, no archive helpers.
- Partial + archive: same as success + archive (treated identically).
- Manual + failed + archive: ensure+move called with `<failed-subdir>` immediately, no counter lookup.
- Manual + failed + delete: delete called immediately.
- Scheduled + failed + counter below threshold: NO cleanup helpers called.
- Scheduled + failed + counter above threshold: cleanup runs.
- Scheduled + failed + counter at threshold exactly: NO cleanup (`failedCount > maxRetries` is the condition, not `≥`).
- Counter resets after a success: seed a success run, then a failed run, then check counter is 1 (not "1 + prior failed runs from before the success").
- Cleanup throws: assert errorSummary appended, no exception thrown to caller, original errorSummary context preserved if any.
- Unknown action ('foo' injected): logs warning, no helper called, no throw.

**Worker integration tests** (extend `sftp-import.worker.test.ts`):
- Worker success-path calls `applyPostImportAction` with `trigger: 'scheduled'`.
- Worker catch-path on `isFinalAttempt: true` calls `applyPostImportAction`; on `isFinalAttempt: false` does NOT (matching the existing `Incident` gating).
- Worker catch-path with `filePath` unresolved (connector threw early): does NOT call `applyPostImportAction`.

**Manual-import test** (extend `sftp-import.test.ts`):
- Successful import calls `applyPostImportAction` with `trigger: 'manual'`.
- Failed import calls it with `trigger: 'manual'`.

**PATCH integration tests** (extend the relevant file from Cycle 5-A.5):
- PATCH each of the five new fields with valid values → 200, persists.
- PATCH `postImportAction: 'invalid'` → 400.
- PATCH `archiveSubdir: '../escape'` → 400 (pattern rejection).
- PATCH `archiveSubdir: 'with spaces'` → 400.
- PATCH `archiveSubdir: 'valid_name-01'` → 200.
- PATCH `maxImportRetries: 11` → 400.
- PATCH `maxImportRetries: -1` → 400.
- PATCH `maxImportRetries: 0` → 200.
- PATCH `maxImportRetries: 10` → 200.

Target backend suite: ≥ 130 (from 111).

## Acceptance Criteria

- [ ] Schema migration adds five `NOT NULL DEFAULT …` columns to `integrations`.
- [ ] Six new connector primitives exist (3 SFTP + 3 FTP/FTPS).
- [ ] Shared service module `apps/api/src/services/integrations/post-import-action.ts` exports `applyPostImportAction`.
- [ ] Worker calls the service for both success and failed paths (failed gated on `isFinalAttempt` for retry-burst safety).
- [ ] Manual-import calls the service with `trigger: 'manual'`.
- [ ] Manual-failed imports run cleanup immediately, regardless of `maxImportRetries`.
- [ ] Scheduled-failed cleanup runs only when failed-count for the same filename (since last success) > `maxImportRetries`.
- [ ] Cleanup failures append to `ImportRun.errorSummary`, preserve existing context, do NOT downgrade status or throw.
- [ ] `PATCH /v1/integrations/:id` accepts all five fields with validation (enum + range + pattern).
- [ ] Edit-Page section has Success + Failed sub-blocks with conditional subdir inputs.
- [ ] Edit-Page section shows the manual-no-retry note inline.
- [ ] "Jetzt importieren" dialog shows the no-auto-retry note.
- [ ] Wizard Step 5 summary shows both Success and Failed default-handling lines.
- [ ] All i18n keys present in en + de.
- [ ] Backend test suite ≥ 130 tests, all green.
- [ ] `pnpm -C apps/api typecheck` + `lint` + `build` clean.
- [ ] `pnpm -C apps/web typecheck` + `build` clean.

## Memory Bank update (mandatory — do this LAST, before pushing)

1. **`prompts/_state/STATE.md`** — Cycle 5-C entry detailing the five schema columns, the six connector primitives, the shared service module, the worker + manual-import wiring, the PATCH surface, the Edit-Page section structure (Success + Failed sub-blocks), the wizard summary rows, the "Jetzt importieren" dialog hint, and the test count delta.
2. **`prompts/_state/KNOWN_TODOS.md`** — add:
   - "Operator-defined archive/failed path templates" (token expansion like `<YYYY>`, `<filename>`, `<integration-name>` in the subdir/path strings). Currently only the `<YYYY-MM>` bucket is hardcoded.
   - "Re-import guard via `lastProcessedFilename`" (still pending — the counter logic mitigates but doesn't eliminate; if cleanup-of-failed itself fails, the same file could re-run and re-fail in a loop).
   - Cross-reference the existing "stock_movements row growth from identical-quantity uploads" entry — Cycle 5-C's archive default partially mitigates because successful imports move the file out of the next-tick selection window.
3. **`prompts/_state/NEXT.md`** — mark S22 ✅, Cycle 5-C status `✅ Done`. Next cycle is 5-D (Functional test).
4. Result file: `prompts/results/RESULT_5-C_FILE_HANDLING.md`.
5. **Notion entry status** → ✅ Ausgeführt after Codex passes.

## Push (mandatory final step on `develop`)

```
git push origin develop
```

## Codex review

`review:mandatory` — worker logic, schema migration with five columns, six new external-effect primitives, multi-tenant data path, retry-counter semantics that could go subtly wrong under BullMQ retry bursts. After push:

```
/codex:adversarial-review --base origin/main
```

Classify findings per DECISIONS 2026-04-16. Fix ACTIONABLE in-session. Document in `prompts/results/REVIEW_5-C_FILE_HANDLING.md`.

## Reminders

- **Branch is `develop`.** Verify with `git rev-parse --abbrev-ref HEAD`.
- **Do not push to `main`.**
- The shared service module is the right destination for cleanup logic — worker and manual-import both call it. Don't inline the logic twice.
- `path.dirname` / `path.join` work on POSIX-style remote paths because SFTP/FTP use forward slashes regardless of server OS. The custom `joinRemotePath` / `dirName` / `baseName` helpers handle edge cases (root path, missing slashes) more reliably than Node's `path` module against remote conventions — extract to `apps/api/src/lib/remote-path.ts` and import everywhere.
- Archive date bucketing uses UTC (`getUTCFullYear`, `getUTCMonth`). Operators in different timezones get the same bucket name regardless of when they look.
- The retry-counter query uses `lastSuccessfulSyncAt` as the lower bound. If an integration has never had a successful sync, the query falls through to "all failed runs of this filename ever" — that's the correct behaviour (counter is monotonic until the first success resets it).
- BullMQ retry-burst interaction: when the worker's connector throws and BullMQ schedules a retry, each retry creates a new `ImportRun` row. To avoid the counter spiking by 3 in one cron tick from BullMQ's 3-retry policy, the worker gates `applyPostImportAction` on `isFinalAttempt` for the failed path. The success/partial path doesn't have this concern (those statuses come from a successful library invocation that won't retry).
- The `applyPostImportAction` flow does NOT update `ImportRun.fileName` — keep the field as the original source filename for audit clarity. A new field for "where did it end up" is a future addition if operators ask.
- The subdir validator pattern (`[A-Za-z0-9_\-]+`, length ≤ 64) is intentionally strict. If operators ask for spaces / dots / paths, that's the "operator-defined templates" TODO, not a quick fix to this pattern.
- The migration only adds columns with defaults — backfill is automatic. No `UPDATE` query needed.
- `lastSuccessfulSyncAt` is already maintained by `markScheduleAndHealth` on success-path. Confirm it's `Date | null` typed in Prisma and TypeScript both — the counter query's conditional spread (`since ? { createdAt: { gt: since } } : {}`) depends on null being the absence sentinel.
