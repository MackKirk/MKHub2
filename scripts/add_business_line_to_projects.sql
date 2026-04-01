-- Construction vs Repairs & Maintenance (run on PostgreSQL; app startup also applies this idempotently)
-- Only touches projects.* — does not change setting_items or permission_definitions ids.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS business_line VARCHAR(50) NULL;
CREATE INDEX IF NOT EXISTS idx_projects_business_line ON projects(business_line);
-- Backfill: default construction; R&M mapping uses existing SettingItem UUIDs (see app.services.business_line.backfill).
