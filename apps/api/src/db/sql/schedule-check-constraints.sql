-- Enforce that required fields are present for each schedule_type.
-- Prevents drifted state between UI fields and cron_expression.
-- Idempotent: safe to re-run on a DB that already has (old or new) constraints.

-- Drop all constraints first (idempotent — IF EXISTS prevents errors)
ALTER TABLE integration_schedules
  DROP CONSTRAINT IF EXISTS check_schedule_interval_minutes,
  DROP CONSTRAINT IF EXISTS check_schedule_interval_hours,
  DROP CONSTRAINT IF EXISTS check_schedule_daily,
  DROP CONSTRAINT IF EXISTS check_schedule_weekly,
  DROP CONSTRAINT IF EXISTS check_schedule_weekdays_domain,
  DROP CONSTRAINT IF EXISTS check_schedule_cron_not_empty;

-- Re-add with corrected logic
ALTER TABLE integration_schedules
  ADD CONSTRAINT check_schedule_interval_minutes
    CHECK (schedule_type != 'interval_minutes' OR interval_value IS NOT NULL),
  ADD CONSTRAINT check_schedule_interval_hours
    CHECK (schedule_type != 'interval_hours' OR interval_value IS NOT NULL),
  ADD CONSTRAINT check_schedule_daily
    CHECK (schedule_type != 'daily' OR time_of_day IS NOT NULL),
  ADD CONSTRAINT check_schedule_weekly
    CHECK (
      schedule_type != 'weekly'
      OR (
        time_of_day IS NOT NULL
        AND weekdays IS NOT NULL
        AND COALESCE(array_length(weekdays, 1), 0) > 0
      )
    ),
  ADD CONSTRAINT check_schedule_weekdays_domain
    CHECK (weekdays IS NULL OR weekdays <@ ARRAY[1,2,3,4,5,6,7]::integer[]),
  ADD CONSTRAINT check_schedule_cron_not_empty
    CHECK (LENGTH(BTRIM(cron_expression)) > 0);
