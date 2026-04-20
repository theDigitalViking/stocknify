-- v6 — marketplace fields on integrations + csv_mapping_templates
-- Idempotent: safe to re-run.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'csv_mapping_templates' AND column_name = 'is_locked'
  ) THEN
    ALTER TABLE "csv_mapping_templates" ADD COLUMN "is_locked" BOOLEAN NOT NULL DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'csv_mapping_templates' AND column_name = 'marketplace_key'
  ) THEN
    ALTER TABLE "csv_mapping_templates" ADD COLUMN "marketplace_key" TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'integrations' AND column_name = 'is_enabled'
  ) THEN
    ALTER TABLE "integrations" ADD COLUMN "is_enabled" BOOLEAN NOT NULL DEFAULT true;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'integrations' AND column_name = 'marketplace_key'
  ) THEN
    ALTER TABLE "integrations" ADD COLUMN "marketplace_key" TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'integrations' AND column_name = 'logo_url'
  ) THEN
    ALTER TABLE "integrations" ADD COLUMN "logo_url" TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'integrations' AND column_name = 'category'
  ) THEN
    ALTER TABLE "integrations" ADD COLUMN "category" TEXT;
  END IF;
END
$$;
