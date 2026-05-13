-- Links HR reports (employee_reports) to subcontractor workers (same table as internal users).
-- Run once per PostgreSQL database.

ALTER TABLE employee_reports
  ADD COLUMN IF NOT EXISTS subcontractor_worker_id UUID NULL
  REFERENCES subcontractor_workers (id) ON DELETE CASCADE;

ALTER TABLE employee_reports
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE employee_reports
  DROP CONSTRAINT IF EXISTS employee_report_subject_xor;

ALTER TABLE employee_reports
  ADD CONSTRAINT employee_report_subject_xor CHECK (
    (user_id IS NOT NULL AND subcontractor_worker_id IS NULL)
    OR (user_id IS NULL AND subcontractor_worker_id IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS ix_employee_reports_subcontractor_worker_id
  ON employee_reports (subcontractor_worker_id);

CREATE INDEX IF NOT EXISTS ix_employee_reports_worker_occurrence
  ON employee_reports (subcontractor_worker_id, occurrence_date);
