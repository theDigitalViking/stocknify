-- v7 — deleted_by on products
-- Tracks which user soft-deleted a product. ON DELETE SET NULL so user removal
-- never cascades a product resurrection; the product stays soft-deleted with a
-- null attribution.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'deleted_by'
  ) THEN
    ALTER TABLE "products" ADD COLUMN "deleted_by" UUID REFERENCES "users"("id") ON DELETE SET NULL;
  END IF;
END
$$;
