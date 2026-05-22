-- Cycle 5-A.5 — Integration as Konfig-Anker
--
-- Move credentialId + csvMappingTemplateId onto `integrations` as the
-- authoritative defaults. Schedules continue to carry the same FK columns
-- as optional overrides (schema preserves for future power-user UI), but
-- every cycle-5-A.5 surface and every backend default reads from the
-- Integration.
--
-- Backfill: copy credential_id + csv_mapping_template_id from the newest
-- active schedule per integration (DISTINCT ON, ordered by created_at DESC
-- for determinism when multiple active schedules exist).
--
-- Note: `integration_schedules.credential_id` is already nullable in this
-- repo's schema since the initial v3 migration — no ALTER needed.

-- 1. Add columns to integrations
ALTER TABLE "integrations"
  ADD COLUMN "credential_id" UUID,
  ADD COLUMN "csv_mapping_template_id" UUID;

-- 2. FK constraints (Restrict — application layer surfaces 409 first)
ALTER TABLE "integrations"
  ADD CONSTRAINT "integrations_credential_id_fkey"
    FOREIGN KEY ("credential_id") REFERENCES "integration_credentials"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "integrations_csv_mapping_template_id_fkey"
    FOREIGN KEY ("csv_mapping_template_id") REFERENCES "csv_mapping_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 3. Indexes for lookup performance
CREATE INDEX "integrations_credential_id_idx" ON "integrations"("credential_id");
CREATE INDEX "integrations_csv_mapping_template_id_idx" ON "integrations"("csv_mapping_template_id");

-- 4. Backfill from the newest active schedule per integration
UPDATE "integrations" i
SET
  "credential_id" = s.credential_id,
  "csv_mapping_template_id" = s.csv_mapping_template_id
FROM (
  SELECT DISTINCT ON (integration_id)
    integration_id,
    credential_id,
    csv_mapping_template_id
  FROM "integration_schedules"
  WHERE deleted_at IS NULL
  ORDER BY integration_id, created_at DESC
) s
WHERE i.id = s.integration_id
  AND i.deleted_at IS NULL;
