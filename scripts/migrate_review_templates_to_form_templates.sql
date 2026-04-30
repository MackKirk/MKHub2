-- Employee review: review_cycles -> form_templates; drop legacy review_templates tables.
-- Safe when employee review was unused (no cycles or orphan data).

-- 1) review_assignments: snapshot column
ALTER TABLE review_assignments ADD COLUMN IF NOT EXISTS form_definition_snapshot JSONB NULL;

-- 2) review_cycles: add form_template_id if missing
ALTER TABLE review_cycles ADD COLUMN IF NOT EXISTS form_template_id UUID NULL;

-- 3) If old template_id exists, you must point cycles at a form_templates row before dropping.
-- When no cycles exist, leave form_template_id NULL here and fix in app, or insert a placeholder template first.

-- 4) Drop FK on template_id -> review_templates if present
ALTER TABLE review_cycles DROP CONSTRAINT IF EXISTS review_cycles_template_id_fkey;

-- 5) Drop old column template_id
ALTER TABLE review_cycles DROP COLUMN IF EXISTS template_id;

-- 6) Require form_template_id (fail if any row still NULL — fix data first)
-- ALTER TABLE review_cycles ALTER COLUMN form_template_id SET NOT NULL;
-- Uncomment NOT NULL after every cycle has a valid form_template_id UUID.

-- 7) FK to form_templates
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'review_cycles_form_template_id_fkey'
  ) THEN
    ALTER TABLE review_cycles
      ADD CONSTRAINT review_cycles_form_template_id_fkey
      FOREIGN KEY (form_template_id) REFERENCES form_templates(id) ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_review_cycles_form_template_id ON review_cycles(form_template_id);

-- 8) Legacy tables (unused)
DROP TABLE IF EXISTS review_template_questions CASCADE;
DROP TABLE IF EXISTS review_templates CASCADE;
