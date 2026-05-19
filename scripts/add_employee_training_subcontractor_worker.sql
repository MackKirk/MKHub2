-- Links HR training / matrix rows to subcontractor workers (same table as internal users).
-- Run once per PostgreSQL database.

ALTER TABLE employee_training_records
  ADD COLUMN IF NOT EXISTS subcontractor_worker_id UUID NULL
  REFERENCES subcontractor_workers (id) ON DELETE CASCADE;

ALTER TABLE employee_training_records
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE employee_training_records
  DROP CONSTRAINT IF EXISTS employee_training_subject_xor;

ALTER TABLE employee_training_records
  ADD CONSTRAINT employee_training_subject_xor CHECK (
    (user_id IS NOT NULL AND subcontractor_worker_id IS NULL)
    OR (user_id IS NULL AND subcontractor_worker_id IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS ix_employee_training_records_subcontractor_worker_id
  ON employee_training_records (subcontractor_worker_id);
