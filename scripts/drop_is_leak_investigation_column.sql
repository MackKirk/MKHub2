-- Drop legacy is_leak_investigation column after:
--   1) migrate_leak_investigations_to_rm_projects.sql (GATE 1 = 0)
--   2) Code deploy removing ORM field and main.py auto-create

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM projects WHERE is_leak_investigation = true AND deleted_at IS NULL) > 0 THEN
    RAISE EXCEPTION 'Abort: rows still have is_leak_investigation=true';
  END IF;
END $$;

DROP INDEX IF EXISTS idx_projects_is_leak_investigation;
ALTER TABLE projects DROP COLUMN IF EXISTS is_leak_investigation;
