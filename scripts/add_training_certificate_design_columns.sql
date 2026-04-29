-- Optional certificate branding for LMS courses (background + logo on generated PDF).
-- PostgreSQL / compatible with IF NOT EXISTS.

ALTER TABLE training_courses
  ADD COLUMN IF NOT EXISTS certificate_background_file_id UUID NULL REFERENCES file_objects(id) ON DELETE SET NULL;

ALTER TABLE training_courses
  ADD COLUMN IF NOT EXISTS certificate_logo_file_id UUID NULL REFERENCES file_objects(id) ON DELETE SET NULL;

ALTER TABLE training_courses
  ADD COLUMN IF NOT EXISTS certificate_logo_setting_item_id UUID NULL REFERENCES setting_items(id) ON DELETE SET NULL;

ALTER TABLE training_courses
  ADD COLUMN IF NOT EXISTS certificate_background_setting_item_id UUID NULL REFERENCES setting_items(id) ON DELETE SET NULL;

ALTER TABLE training_courses
  ADD COLUMN IF NOT EXISTS certificate_layout JSON NULL;
