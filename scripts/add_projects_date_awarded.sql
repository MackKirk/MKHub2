-- Add date_awarded to projects (Awarded Date — set on opportunity→project conversion; editable via API)
--
-- PostgreSQL (production): also applied automatically on app startup via app/main.py
ALTER TABLE projects ADD COLUMN IF NOT EXISTS date_awarded TIMESTAMPTZ NULL;

-- SQLite (local dev only):
-- ALTER TABLE projects ADD COLUMN date_awarded DATETIME;
