-- Migration: Client Notes / Communication Log
-- Idempotent — safe to run multiple times.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables WHERE table_name = 'client_notes'
    ) THEN
        CREATE TABLE client_notes (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
            project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
            title VARCHAR(255),
            category_id VARCHAR(100),
            description TEXT,
            images JSONB,
            status VARCHAR(100),
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            created_by UUID REFERENCES users(id) ON DELETE SET NULL,
            updated_at TIMESTAMPTZ,
            updated_by UUID REFERENCES users(id) ON DELETE SET NULL
        );
        CREATE INDEX ix_client_notes_client_id ON client_notes(client_id);
        CREATE INDEX ix_client_notes_client_created ON client_notes(client_id, created_at);
        CREATE INDEX ix_client_notes_project_id ON client_notes(project_id);
        RAISE NOTICE 'Created client_notes';
    END IF;
END $$;
