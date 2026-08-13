-- Soft-lock columns for Document Creator exclusive editing.
-- Run manually on your database if needed.

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables WHERE table_name = 'user_documents'
    ) THEN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'user_documents' AND column_name = 'edit_lock_user_id'
        ) THEN
            ALTER TABLE user_documents
                ADD COLUMN edit_lock_user_id UUID REFERENCES users(id) ON DELETE SET NULL;
            RAISE NOTICE 'Added user_documents.edit_lock_user_id';
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'user_documents' AND column_name = 'edit_lock_session_id'
        ) THEN
            ALTER TABLE user_documents
                ADD COLUMN edit_lock_session_id VARCHAR(64);
            RAISE NOTICE 'Added user_documents.edit_lock_session_id';
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'user_documents' AND column_name = 'edit_lock_expires_at'
        ) THEN
            ALTER TABLE user_documents
                ADD COLUMN edit_lock_expires_at TIMESTAMP WITH TIME ZONE;
            RAISE NOTICE 'Added user_documents.edit_lock_expires_at';
        END IF;

        CREATE INDEX IF NOT EXISTS ix_user_documents_edit_lock_expires_at
            ON user_documents(edit_lock_expires_at);
    ELSE
        RAISE NOTICE 'Table user_documents does not exist — skip edit lock columns';
    END IF;
END $$;
