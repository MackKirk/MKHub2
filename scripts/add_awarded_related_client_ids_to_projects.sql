-- Multiple awarded related customers (JSON array of client UUID strings); optional empty
-- PostgreSQL (production): also applied automatically on app startup via app/main.py
ALTER TABLE projects ADD COLUMN IF NOT EXISTS awarded_related_client_ids JSON NULL;
