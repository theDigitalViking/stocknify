-- Cycle 5-C Codex review fix — failed-cleanup counter must reflect cron
-- ticks, not BullMQ retry attempts.
--
-- Before this column existed, `applyPostImportAction`'s counter query
-- counted every failed `ImportRun` row for the same filename since the
-- last successful sync — including the 1-2 non-final BullMQ retry rows
-- written within a single cron tick. With the default queue config of 3
-- attempts/tick and `maxImportRetries=3`, cleanup would fire after the
-- 2nd cron tick instead of the configured 4th.
--
-- Adding `was_final_attempt` with `DEFAULT TRUE` lets the counter filter
-- to one row per cron tick (only the final BullMQ attempt for scheduled
-- runs; every manual or success-path row is "final" by definition). The
-- column defaults to TRUE so existing audit rows are counted normally —
-- before this change the worker did not distinguish, so all prior rows
-- represent "final" outcomes for the audit trail.

ALTER TABLE "import_runs"
  ADD COLUMN "was_final_attempt" BOOLEAN NOT NULL DEFAULT TRUE;
