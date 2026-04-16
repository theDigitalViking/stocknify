-- Three partial unique indexes for notification_templates.
-- Replaces the broken @@unique([tenantId, locale, channelType, ruleActionId])
-- which cannot handle NULL values correctly in PostgreSQL.

-- 1. System-global defaults (tenant_id IS NULL, rule_action_id IS NULL)
CREATE UNIQUE INDEX IF NOT EXISTS uq_notif_tpl_system_global
  ON notification_templates (locale, channel_type)
  WHERE tenant_id IS NULL AND rule_action_id IS NULL;

-- 2. Tenant-global defaults (tenant_id set, rule_action_id IS NULL)
CREATE UNIQUE INDEX IF NOT EXISTS uq_notif_tpl_tenant_global
  ON notification_templates (tenant_id, locale, channel_type)
  WHERE tenant_id IS NOT NULL AND rule_action_id IS NULL;

-- 3. Tenant + rule_action specific (both set)
CREATE UNIQUE INDEX IF NOT EXISTS uq_notif_tpl_tenant_rule
  ON notification_templates (tenant_id, rule_action_id, locale, channel_type)
  WHERE tenant_id IS NOT NULL AND rule_action_id IS NOT NULL;

-- Forbid the (tenant_id IS NULL, rule_action_id IS NOT NULL) combination.
-- System-level templates (tenant_id IS NULL) are always global — they cannot
-- be scoped to a specific rule action. This closes the uncovered uniqueness bucket.
ALTER TABLE notification_templates
  ADD CONSTRAINT check_system_template_no_rule_action
  CHECK (tenant_id IS NOT NULL OR rule_action_id IS NULL);
