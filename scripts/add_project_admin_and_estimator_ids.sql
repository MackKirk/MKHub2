-- Add estimator_ids and project_admin_id columns to projects table
-- This migration adds support for multiple estimators per project and a project admin field

-- For PostgreSQL
ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS estimator_ids JSONB NULL;

ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS project_admin_id UUID NULL;

-- For SQLite (run these separately if using SQLite)
-- ALTER TABLE projects ADD COLUMN estimator_ids TEXT NULL;
-- ALTER TABLE projects ADD COLUMN project_admin_id TEXT NULL;

-- Optional: Create index on project_admin_id for better query performance
CREATE INDEX IF NOT EXISTS idx_projects_project_admin_id ON projects(project_admin_id);

