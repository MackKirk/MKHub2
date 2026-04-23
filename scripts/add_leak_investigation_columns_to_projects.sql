-- Leak investigations (R&M): special project rows + optional link from opportunities (PostgreSQL)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS is_leak_investigation BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS related_leak_investigation_id UUID NULL REFERENCES projects(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_projects_is_leak_investigation ON projects(is_leak_investigation);
CREATE INDEX IF NOT EXISTS idx_projects_related_leak_investigation_id ON projects(related_leak_investigation_id);
