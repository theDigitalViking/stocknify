-- Check constraint ensuring rule condition fields are consistent with condition_type.
-- Also requires stock_type for stock_level conditions (not just operator + threshold).
--
-- Idempotent: wrapped in a DO block that checks pg_constraint before adding.
-- Safe to run multiple times and on partial rollback/retry.

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'rules_condition_fields_check'
      AND conrelid = 'rules'::regclass
  ) THEN
    ALTER TABLE rules ADD CONSTRAINT rules_condition_fields_check CHECK (
      (
        -- stock_level: requires stock_type, operator, and threshold
        condition_type = 'stock_level'
        AND stock_type IS NOT NULL
        AND operator IS NOT NULL
        AND threshold IS NOT NULL
        -- days_until_expiry fields must be absent
        AND days_threshold IS NULL
      )
      OR
      (
        -- days_until_expiry: requires days_threshold only
        condition_type = 'days_until_expiry'
        AND days_threshold IS NOT NULL
        -- stock_level fields must be absent
        AND stock_type IS NULL
        AND operator IS NULL
        AND threshold IS NULL
      )
      OR
      (
        -- stock_type_transition: no numeric condition fields required
        condition_type = 'stock_type_transition'
        AND operator IS NULL
        AND threshold IS NULL
        AND days_threshold IS NULL
      )
    );
  END IF;
END $$;
