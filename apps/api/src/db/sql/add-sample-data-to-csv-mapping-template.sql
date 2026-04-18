-- Adds sample_data column to csv_mapping_templates for preview persistence.
-- Idempotent: DO block checks column existence before adding.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'csv_mapping_templates'
      AND column_name = 'sample_data'
  ) THEN
    ALTER TABLE "csv_mapping_templates" ADD COLUMN "sample_data" JSONB;
  END IF;
END
$$;
