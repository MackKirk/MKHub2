-- Awarded related customer (set on opportunity → project conversion when related_customers exist; optional PATCH)
--
-- PostgreSQL (production): also applied automatically on app startup via app/main.py
ALTER TABLE projects ADD COLUMN IF NOT EXISTS awarded_related_client_id UUID NULL;

-- SQLite (local dev only):
-- ALTER TABLE projects ADD COLUMN awarded_related_client_id TEXT NULL;
