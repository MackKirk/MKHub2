-- Migration: link client_notes to client_contacts (contact_id + name snapshot)
-- Idempotent — safe to run multiple times.

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables WHERE table_name = 'client_notes'
    ) THEN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'client_notes' AND column_name = 'contact_id'
        ) THEN
            ALTER TABLE client_notes
                ADD COLUMN contact_id UUID REFERENCES client_contacts(id) ON DELETE SET NULL;
            RAISE NOTICE 'Added client_notes.contact_id';
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'client_notes' AND column_name = 'contact_name'
        ) THEN
            ALTER TABLE client_notes
                ADD COLUMN contact_name VARCHAR(255);
            RAISE NOTICE 'Added client_notes.contact_name';
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM pg_indexes
            WHERE tablename = 'client_notes' AND indexname = 'ix_client_notes_contact_id'
        ) THEN
            CREATE INDEX ix_client_notes_contact_id ON client_notes(contact_id);
            RAISE NOTICE 'Created ix_client_notes_contact_id';
        END IF;
    END IF;
END $$;
