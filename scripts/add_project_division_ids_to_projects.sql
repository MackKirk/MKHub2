-- Add project_division_ids column to projects table for project divisions
ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS project_division_ids JSONB;

-- Create index for better query performance (using GIN index for JSONB)
CREATE INDEX IF NOT EXISTS idx_projects_project_division_ids ON projects USING GIN (project_division_ids);

