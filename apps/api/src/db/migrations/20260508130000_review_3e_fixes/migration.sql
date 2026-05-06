-- Cycle 3-E Codex stop-time review fixes.
--
-- 1. Add `timezone` column to `integration_schedules` so PATCH/toggle paths
--    re-register the BullMQ scheduler with the tenant's timezone instead of
--    silently falling back to the server default. Existing rows backfill to
--    'Europe/Berlin' (the prior implicit default).
-- 2. Add foreign keys for `import_runs.schedule_id` and
--    `import_runs.credential_id` (both nullable; ON DELETE SET NULL so an
--    import-run audit row survives a schedule soft-delete or a credential
--    hard-delete). Orphan-cleanup is a no-op today — the table is freshly
--    created in 20260508120000_add_import_runs and no orphan rows exist.

-- AlterTable
ALTER TABLE "integration_schedules"
  ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'Europe/Berlin';

-- AddForeignKey
ALTER TABLE "import_runs"
  ADD CONSTRAINT "import_runs_schedule_id_fkey"
    FOREIGN KEY ("schedule_id")
    REFERENCES "integration_schedules"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_runs"
  ADD CONSTRAINT "import_runs_credential_id_fkey"
    FOREIGN KEY ("credential_id")
    REFERENCES "integration_credentials"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
