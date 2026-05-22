-- Cycle 5-E — Click-Through Directory Browser + Integration.importPath.
--
-- Adds a nullable sub-directory column to `integrations`. The worker and
-- manual-import join this onto `credential.remotePath` when listing files
-- so two integrations can share a credential while reading from disjoint
-- folders (e.g. /exports/incoming and /exports/processed). NULL preserves
-- the prior behaviour of listing the credential's remotePath directly.
--
-- No backfill: every existing integration starts with NULL, which is the
-- same effective listing path as before.

ALTER TABLE "integrations"
  ADD COLUMN "import_path" TEXT NULL;
