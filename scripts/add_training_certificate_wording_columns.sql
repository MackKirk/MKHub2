-- Certificate wording / instructor name for LMS diploma-style PDF (see pdf_certificate.py).
ALTER TABLE training_courses
  ADD COLUMN IF NOT EXISTS certificate_heading_primary VARCHAR(200) NULL;

ALTER TABLE training_courses
  ADD COLUMN IF NOT EXISTS certificate_heading_secondary VARCHAR(200) NULL;

ALTER TABLE training_courses
  ADD COLUMN IF NOT EXISTS certificate_body_template TEXT NULL;

ALTER TABLE training_courses
  ADD COLUMN IF NOT EXISTS certificate_instructor_name VARCHAR(255) NULL;
