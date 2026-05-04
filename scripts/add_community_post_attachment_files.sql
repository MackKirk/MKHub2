-- Multiple community post attachments (JSON array of {file_id, name}).
-- PostgreSQL: run once against the app database.

ALTER TABLE community_posts
  ADD COLUMN IF NOT EXISTS attachment_files JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN community_posts.attachment_files IS 'List of {file_id, name} for downloadable attachments; document_file_id mirrors first for legacy.';
