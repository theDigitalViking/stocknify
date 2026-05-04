-- DropIndex
DROP INDEX "external_references_tenant_id_integration_id_resource_type__idx";

-- DropIndex
DROP INDEX "integration_attribute_values_tenant_id_definition_id_resour_key";

-- DropIndex
DROP INDEX "notification_templates_tenant_id_locale_channel_type_rule_a_key";

-- AlterTable
ALTER TABLE "integration_attribute_values" DROP COLUMN "resource_type";

-- CreateIndex
CREATE UNIQUE INDEX "external_references_reverse_key" ON "external_references"("tenant_id", "integration_id", "resource_type", "external_id");

-- CreateIndex
CREATE UNIQUE INDEX "integration_attribute_definitions_tenant_id_id_key" ON "integration_attribute_definitions"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "integration_attribute_values_tenant_id_definition_id_resour_key" ON "integration_attribute_values"("tenant_id", "definition_id", "resource_id");

-- RenameIndex
ALTER INDEX "external_references_tenant_id_integration_id_resource_type__key" RENAME TO "external_references_forward_key";
