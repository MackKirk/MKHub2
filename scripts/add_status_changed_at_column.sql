-- Add status_changed_at column to projects table
-- This column tracks when the project/opportunity status was last changed

ALTER TABLE projects ADD COLUMN status_changed_at DATETIME;

-- For existing projects, set status_changed_at to created_at if they have a status
-- This provides a reasonable default for projects that already have a status
UPDATE projects 
SET status_changed_at = created_at 
WHERE status_label IS NOT NULL AND status_changed_at IS NULL;

