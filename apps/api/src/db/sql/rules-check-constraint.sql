-- Check constraint ensuring rule condition fields are consistent with condition_type.
-- This must be applied manually after the initial Prisma migration.

ALTER TABLE rules ADD CONSTRAINT rules_condition_fields_check CHECK (
  (
    condition_type = 'stock_level'
    AND operator IS NOT NULL
    AND threshold IS NOT NULL
  )
  OR
  (
    condition_type = 'days_until_expiry'
    AND days_threshold IS NOT NULL
  )
  OR
  (
    condition_type = 'stock_type_transition'
  )
);
