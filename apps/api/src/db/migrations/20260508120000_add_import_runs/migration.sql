-- Cycle 3-C — import_runs table for SFTP/FTP import history.
-- Captures final stats, status, and timing for every manual or scheduled
-- import attempt. RLS policy lives in apps/api/src/db/sql/rls-policies-v5.sql.

-- CreateTable
CREATE TABLE "import_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "integration_id" UUID NOT NULL,
    "schedule_id" UUID,
    "credential_id" UUID,
    "trigger" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "file_name" TEXT,
    "file_size_bytes" INTEGER,
    "rows_total" INTEGER NOT NULL DEFAULT 0,
    "rows_created" INTEGER NOT NULL DEFAULT 0,
    "rows_updated" INTEGER NOT NULL DEFAULT 0,
    "rows_skipped" INTEGER NOT NULL DEFAULT 0,
    "rows_errored" INTEGER NOT NULL DEFAULT 0,
    "error_summary" TEXT,
    "started_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "import_runs_tenant_id_idx" ON "import_runs"("tenant_id");

-- CreateIndex
CREATE INDEX "import_runs_tenant_id_integration_id_idx" ON "import_runs"("tenant_id", "integration_id");

-- AddForeignKey
ALTER TABLE "import_runs" ADD CONSTRAINT "import_runs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_runs" ADD CONSTRAINT "import_runs_integration_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "integrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
