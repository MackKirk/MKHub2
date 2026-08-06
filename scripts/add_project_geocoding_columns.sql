-- Reversible migration: project geocoding metadata columns
-- Run manually on PostgreSQL if startup migration is skipped.

ALTER TABLE projects ADD COLUMN IF NOT EXISTS geocoded_address VARCHAR(500) NULL;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS geocoding_status VARCHAR(20) NULL;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS geocoded_at TIMESTAMPTZ NULL;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS geocoding_error VARCHAR(500) NULL;

CREATE INDEX IF NOT EXISTS ix_projects_lat_lng
  ON projects (lat, lng)
  WHERE lat IS NOT NULL AND lng IS NOT NULL AND deleted_at IS NULL;

-- Rollback:
-- DROP INDEX IF EXISTS ix_projects_lat_lng;
-- ALTER TABLE projects DROP COLUMN IF EXISTS geocoding_error;
-- ALTER TABLE projects DROP COLUMN IF EXISTS geocoded_at;
-- ALTER TABLE projects DROP COLUMN IF EXISTS geocoding_status;
-- ALTER TABLE projects DROP COLUMN IF EXISTS geocoded_address;
