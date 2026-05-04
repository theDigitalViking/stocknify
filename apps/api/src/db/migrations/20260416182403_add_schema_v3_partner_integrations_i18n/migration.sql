-- AlterTable
ALTER TABLE "integrations" ADD COLUMN     "sync_direction" TEXT NOT NULL DEFAULT 'shop_to_fulfiller';

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "billing_mode" TEXT NOT NULL DEFAULT 'direct',
ADD COLUMN     "discount_percent" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "onboarding_source" TEXT NOT NULL DEFAULT 'self_signup',
ADD COLUMN     "partner_id" UUID,
ADD COLUMN     "referral_code" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "locale" VARCHAR(10) NOT NULL DEFAULT 'en';

-- CreateTable
CREATE TABLE "partners" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "slug" VARCHAR(63) NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'other',
    "contact_name" TEXT,
    "contact_email" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "referral_code" TEXT NOT NULL,
    "default_billing_mode" TEXT NOT NULL DEFAULT 'direct_pays',
    "partner_pays_discount_percent" INTEGER NOT NULL DEFAULT 0,
    "direct_pays_discount_percent" INTEGER NOT NULL DEFAULT 0,
    "default_plan" TEXT NOT NULL DEFAULT 'growth',
    "stripe_customer_id" TEXT,
    "stripe_coupon_id_partner_pays" TEXT,
    "stripe_coupon_id_direct_pays" TEXT,
    "contract_notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "partners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "partner_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'viewer',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "partner_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_references" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "integration_id" UUID NOT NULL,
    "resource_type" TEXT NOT NULL,
    "resource_id" UUID NOT NULL,
    "external_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "external_references_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_credentials" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "integration_id" UUID NOT NULL,
    "credential_type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "host" TEXT,
    "port" INTEGER,
    "username" TEXT,
    "password" TEXT,
    "token" TEXT,
    "secret" TEXT,
    "remote_path" TEXT,
    "additional_attributes" JSONB NOT NULL DEFAULT '{}',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_verified_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "integration_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_attribute_definitions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "integration_id" UUID NOT NULL,
    "resource_type" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "data_type" TEXT NOT NULL,
    "options" JSONB,
    "is_required" BOOLEAN NOT NULL DEFAULT false,
    "validation_regex" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "integration_attribute_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_attribute_values" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "definition_id" UUID NOT NULL,
    "resource_type" TEXT NOT NULL,
    "resource_id" UUID NOT NULL,
    "value" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "integration_attribute_values_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "csv_mapping_templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "resource_type" TEXT NOT NULL,
    "delimiter" VARCHAR(1) NOT NULL DEFAULT ',',
    "encoding" TEXT NOT NULL DEFAULT 'utf-8',
    "has_header_row" BOOLEAN NOT NULL DEFAULT true,
    "column_mappings" JSONB NOT NULL,
    "default_values" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "csv_mapping_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_schedules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "integration_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "resource_type" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "schedule_type" TEXT NOT NULL,
    "interval_value" INTEGER,
    "time_of_day" VARCHAR(5),
    "weekdays" INTEGER[],
    "cron_expression" TEXT NOT NULL,
    "csv_mapping_template_id" UUID,
    "credential_id" UUID,
    "last_run_at" TIMESTAMPTZ,
    "last_run_status" TEXT,
    "last_run_error" TEXT,
    "next_run_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "integration_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID,
    "rule_action_id" UUID,
    "locale" VARCHAR(10) NOT NULL,
    "channel_type" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "notification_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "partners_slug_key" ON "partners"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "partners_referral_code_key" ON "partners"("referral_code");

-- CreateIndex
CREATE INDEX "partner_users_partner_id_idx" ON "partner_users"("partner_id");

-- CreateIndex
CREATE INDEX "partner_users_tenant_id_idx" ON "partner_users"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "partner_users_partner_id_user_id_key" ON "partner_users"("partner_id", "user_id");

-- CreateIndex
CREATE INDEX "external_references_tenant_id_integration_id_resource_type__idx" ON "external_references"("tenant_id", "integration_id", "resource_type", "external_id");

-- CreateIndex
CREATE INDEX "external_references_tenant_id_idx" ON "external_references"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "external_references_tenant_id_integration_id_resource_type__key" ON "external_references"("tenant_id", "integration_id", "resource_type", "resource_id");

-- CreateIndex
CREATE INDEX "integration_credentials_tenant_id_idx" ON "integration_credentials"("tenant_id");

-- CreateIndex
CREATE INDEX "integration_credentials_tenant_id_integration_id_idx" ON "integration_credentials"("tenant_id", "integration_id");

-- CreateIndex
CREATE INDEX "integration_attribute_definitions_tenant_id_idx" ON "integration_attribute_definitions"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "integration_attribute_definitions_tenant_id_integration_id__key" ON "integration_attribute_definitions"("tenant_id", "integration_id", "resource_type", "key");

-- CreateIndex
CREATE INDEX "integration_attribute_values_tenant_id_idx" ON "integration_attribute_values"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "integration_attribute_values_tenant_id_definition_id_resour_key" ON "integration_attribute_values"("tenant_id", "definition_id", "resource_type", "resource_id");

-- CreateIndex
CREATE INDEX "csv_mapping_templates_tenant_id_idx" ON "csv_mapping_templates"("tenant_id");

-- CreateIndex
CREATE INDEX "integration_schedules_tenant_id_idx" ON "integration_schedules"("tenant_id");

-- CreateIndex
CREATE INDEX "integration_schedules_tenant_id_integration_id_idx" ON "integration_schedules"("tenant_id", "integration_id");

-- CreateIndex
CREATE INDEX "notification_templates_tenant_id_idx" ON "notification_templates"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "notification_templates_tenant_id_locale_channel_type_rule_a_key" ON "notification_templates"("tenant_id", "locale", "channel_type", "rule_action_id");

-- AddForeignKey
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_users" ADD CONSTRAINT "partner_users_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_users" ADD CONSTRAINT "partner_users_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_users" ADD CONSTRAINT "partner_users_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_references" ADD CONSTRAINT "external_references_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_references" ADD CONSTRAINT "external_references_integration_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "integrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_credentials" ADD CONSTRAINT "integration_credentials_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_credentials" ADD CONSTRAINT "integration_credentials_integration_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "integrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_attribute_definitions" ADD CONSTRAINT "integration_attribute_definitions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_attribute_definitions" ADD CONSTRAINT "integration_attribute_definitions_integration_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "integrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_attribute_values" ADD CONSTRAINT "integration_attribute_values_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_attribute_values" ADD CONSTRAINT "integration_attribute_values_definition_id_fkey" FOREIGN KEY ("definition_id") REFERENCES "integration_attribute_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "csv_mapping_templates" ADD CONSTRAINT "csv_mapping_templates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_schedules" ADD CONSTRAINT "integration_schedules_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_schedules" ADD CONSTRAINT "integration_schedules_integration_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "integrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_schedules" ADD CONSTRAINT "integration_schedules_csv_mapping_template_id_fkey" FOREIGN KEY ("csv_mapping_template_id") REFERENCES "csv_mapping_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_schedules" ADD CONSTRAINT "integration_schedules_credential_id_fkey" FOREIGN KEY ("credential_id") REFERENCES "integration_credentials"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_templates" ADD CONSTRAINT "notification_templates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_templates" ADD CONSTRAINT "notification_templates_rule_action_id_fkey" FOREIGN KEY ("rule_action_id") REFERENCES "rule_actions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
