-- Cycle 5-C — Post-import file handling on Integration
--
-- Five new columns drive the success/failed branch of the SFTP/FTP cleanup
-- pipeline. All are NOT NULL with defaults so existing rows pick up the
-- defaults on the same migration tick (no separate backfill UPDATE needed):
--
--   * post_import_action: 'archive' | 'delete' — what to do with the source
--     file when status ∈ {success, partial}.
--   * archive_subdir: plain folder name (no slashes/dots). Full path is
--     `<source-dir>/<archive_subdir>/<YYYY-MM>/<filename>`.
--   * max_import_retries: 0–10. Scheduled-failed runs keep the file across
--     cron ticks until the per-filename failed-run count (since last
--     success) exceeds this cap, then the failed-action fires.
--   * failed_action: 'archive' | 'delete' — what to do once the failed
--     cleanup triggers.
--   * failed_subdir: plain folder name; same path shape as archive_subdir.
--
-- Constraints are enforced at the API + service layer (Zod) rather than at
-- the DB level so the operator-facing error messages stay precise and the
-- migration ships with zero data-validation logic.

ALTER TABLE "integrations"
  ADD COLUMN "post_import_action" TEXT NOT NULL DEFAULT 'archive',
  ADD COLUMN "archive_subdir"     TEXT NOT NULL DEFAULT 'archive',
  ADD COLUMN "max_import_retries" INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN "failed_action"      TEXT NOT NULL DEFAULT 'archive',
  ADD COLUMN "failed_subdir"      TEXT NOT NULL DEFAULT 'failed';
