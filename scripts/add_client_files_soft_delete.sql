-- Soft-delete columns for client_files (project/opportunity file removals stay recoverable until admin purge)
ALTER TABLE client_files ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;
ALTER TABLE client_files ADD COLUMN IF NOT EXISTS deleted_by_id UUID NULL REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_client_files_deleted_at ON client_files(deleted_at);
