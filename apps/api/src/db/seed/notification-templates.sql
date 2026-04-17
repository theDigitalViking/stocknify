-- System default notification templates.
-- tenant_id = NULL + rule_action_id = NULL marks these as system-wide defaults
-- visible to all tenants. The partial unique index
-- (see apps/api/src/db/sql/unique-notification-templates.sql) allows at most
-- ONE template per (locale, channel_type) at the system-default level — so a
-- single template body must cover both stock_level and days_until_expiry
-- conditions via the shared `{{variable}}` placeholders defined in
-- PROJECT.md section 9. Rule-action-specific overrides can be inserted per
-- tenant later if a channel needs condition-differentiated wording.
--
-- IDEMPOTENCY:
-- Fixed UUIDs in the 10000001-... namespace make ON CONFLICT (id) DO NOTHING
-- safe to re-run.

INSERT INTO notification_templates (id, tenant_id, rule_action_id, locale, channel_type, subject, body, is_system, created_at, updated_at)
VALUES
  -- Email × English
  ('10000001-0000-0000-0000-000000000001', NULL, NULL, 'en', 'email',
   '⚠️ Stocknify alert: {{product.name}}',
   E'Hello,\n\nA rule in your Stocknify workspace has been triggered:\n\n• Product: {{product.name}} (SKU {{variant.sku}})\n• Location: {{location.name}}\n• Rule: {{rule.name}}\n• Current value: {{triggered.value}}\n• Threshold: {{rule.threshold}}\n• Triggered at: {{triggered.at}}\n\nReview and acknowledge this alert in your dashboard.\n\n— Stocknify',
   true, now(), now()),

  -- Email × German (Sie form)
  ('10000001-0000-0000-0000-000000000002', NULL, NULL, 'de', 'email',
   '⚠️ Stocknify-Warnung: {{product.name}}',
   E'Guten Tag,\n\neine Regel in Ihrem Stocknify-Konto wurde ausgelöst:\n\n• Produkt: {{product.name}} (SKU {{variant.sku}})\n• Lagerort: {{location.name}}\n• Regel: {{rule.name}}\n• Aktueller Wert: {{triggered.value}}\n• Schwellenwert: {{rule.threshold}}\n• Ausgelöst am: {{triggered.at}}\n\nPrüfen und bestätigen Sie diese Warnung in Ihrem Dashboard.\n\n— Ihr Stocknify-Team',
   true, now(), now()),

  -- Slack × English (no subject — Slack messages have no subject line)
  ('10000001-0000-0000-0000-000000000003', NULL, NULL, 'en', 'slack',
   NULL,
   E':warning: *Stock alert* — {{product.name}} (SKU {{variant.sku}})\nLocation: {{location.name}}\nRule: {{rule.name}}\nCurrent: {{triggered.value}} · Threshold: {{rule.threshold}}',
   true, now(), now()),

  -- Slack × German
  ('10000001-0000-0000-0000-000000000004', NULL, NULL, 'de', 'slack',
   NULL,
   E':warning: *Bestandswarnung* — {{product.name}} (SKU {{variant.sku}})\nLagerort: {{location.name}}\nRegel: {{rule.name}}\nAktuell: {{triggered.value}} · Schwellenwert: {{rule.threshold}}',
   true, now(), now()),

  -- In-app × English (no subject)
  ('10000001-0000-0000-0000-000000000005', NULL, NULL, 'en', 'in_app',
   NULL,
   E'{{product.name}} ({{variant.sku}}) at {{location.name}}: current {{triggered.value}} (threshold {{rule.threshold}}).',
   true, now(), now()),

  -- In-app × German
  ('10000001-0000-0000-0000-000000000006', NULL, NULL, 'de', 'in_app',
   NULL,
   E'{{product.name}} ({{variant.sku}}) bei {{location.name}}: aktuell {{triggered.value}} (Schwellenwert {{rule.threshold}}).',
   true, now(), now())
ON CONFLICT (id) DO NOTHING;
