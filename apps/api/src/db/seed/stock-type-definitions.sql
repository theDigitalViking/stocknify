-- System default stock type definitions.
-- tenant_id = NULL marks these as system-wide defaults visible to all tenants.
-- Safe to run multiple times — ON CONFLICT DO NOTHING is idempotent.

INSERT INTO stock_type_definitions (id, tenant_id, key, label, description, is_system, color, sort_order, created_at, updated_at)
VALUES
  (gen_random_uuid(), NULL, 'available',   'Available',   'Stock ready for sale or fulfillment',                         true, '#22c55e', 1, now(), now()),
  (gen_random_uuid(), NULL, 'physical',    'Physical',    'Total physical units on hand (may include reserved stock)',    true, '#3b82f6', 2, now(), now()),
  (gen_random_uuid(), NULL, 'reserved',    'Reserved',    'Stock committed to open orders but not yet shipped',          true, '#f59e0b', 3, now(), now()),
  (gen_random_uuid(), NULL, 'blocked',     'Blocked',     'Stock held back from fulfillment (quality hold, etc.)',       true, '#ef4444', 4, now(), now()),
  (gen_random_uuid(), NULL, 'in_transit',  'In Transit',  'Stock in transit between locations',                          true, '#8b5cf6', 5, now(), now()),
  (gen_random_uuid(), NULL, 'pre_transit', 'Pre-transit', 'Stock confirmed for shipment but not yet collected',          true, '#a78bfa', 6, now(), now()),
  (gen_random_uuid(), NULL, 'damaged',     'Damaged',     'Units that are damaged and cannot be sold as new',            true, '#f97316', 7, now(), now()),
  (gen_random_uuid(), NULL, 'expired',     'Expired',     'Units past their minimum shelf life / expiry date',           true, '#6b7280', 8, now(), now())
ON CONFLICT (tenant_id, key) DO NOTHING;
