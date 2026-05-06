-- Cycle 3-B — make integration_credentials.integration_id nullable so
-- tenants can store standalone credentials reusable across multiple
-- integrations (DECISIONS 2026-05-07 — credential vault: reusable,
-- separate entity).

-- AlterTable
ALTER TABLE "integration_credentials" ALTER COLUMN "integration_id" DROP NOT NULL;
