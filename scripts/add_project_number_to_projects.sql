-- User-editable project reference number (distinct from auto-generated projects.code)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS project_number VARCHAR(100) NULL;
