-- Atomic CHECK constraints for the incidents table.
-- Idempotent via DROP IF EXISTS before re-adding.

BEGIN;

ALTER TABLE incidents
  DROP CONSTRAINT IF EXISTS check_incident_severity,
  DROP CONSTRAINT IF EXISTS check_incident_source_type,
  DROP CONSTRAINT IF EXISTS check_incident_status;

ALTER TABLE incidents
  ADD CONSTRAINT check_incident_severity
    CHECK (severity IN ('info', 'warning', 'error', 'critical')),
  ADD CONSTRAINT check_incident_source_type
    CHECK (source_type IN ('job', 'api', 'webhook', 'rule_engine', 'system')),
  ADD CONSTRAINT check_incident_status
    CHECK (status IN ('open', 'acknowledged', 'resolved'));

COMMIT;

-- Integration health status CHECK (idempotent)
BEGIN;

ALTER TABLE integrations
  DROP CONSTRAINT IF EXISTS check_integration_health_status;

ALTER TABLE integrations
  ADD CONSTRAINT check_integration_health_status
    CHECK (health_status IN ('healthy', 'degraded', 'failing', 'paused', 'unknown'));

COMMIT;
