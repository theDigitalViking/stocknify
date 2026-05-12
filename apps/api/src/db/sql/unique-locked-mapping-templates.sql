-- Cycle 4-A Codex review fix — One locked mapping template per
-- (tenant_id, marketplace_key, name).
--
-- Without this constraint, two concurrent first installs of the same
-- marketplace key (now allowed under Cycle 4-A multi-install) could each
-- observe "no existing locked template", both create the catalog's fixed
-- templates, and double the operator's locked-template list.
--
-- The install handler also wraps the operation in a SERIALIZABLE
-- transaction (Prisma's TransactionIsolationLevel.Serializable) for the
-- primary race protection. This index is the DB-level safety net that
-- ensures correctness even if the isolation level is downgraded or the
-- handler logic regresses.
--
-- Idempotent: safe to re-run.
CREATE UNIQUE INDEX IF NOT EXISTS csv_mapping_templates_locked_unique
  ON csv_mapping_templates (tenant_id, marketplace_key, name)
  WHERE is_locked = true AND deleted_at IS NULL;
