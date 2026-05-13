-- Run once against the MKHub database (PostgreSQL).
ALTER TABLE subcontractor_attendance
  ADD COLUMN IF NOT EXISTS break_minutes INTEGER NULL;
ALTER TABLE subcontractor_attendance
  ADD COLUMN IF NOT EXISTS hr_status VARCHAR(20) NOT NULL DEFAULT 'approved';
