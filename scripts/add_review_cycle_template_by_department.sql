-- Add template_by_department to review_cycles (division name -> template_id string)
-- Used to select which template applies per employee division when filling reviews

ALTER TABLE review_cycles
ADD COLUMN IF NOT EXISTS template_by_department JSONB;

COMMENT ON COLUMN review_cycles.template_by_department IS 'Optional map: division name (string) -> template_id (UUID string). If reviewee division matches a key, that template is used; else cycle template_id is used.';
