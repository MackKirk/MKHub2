-- Migration: Document Creator tables (document_templates, user_documents)
-- Run manually on your database if needed.

-- Create document_templates table
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables WHERE table_name = 'document_templates'
    ) THEN
        CREATE TABLE document_templates (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name VARCHAR(255) NOT NULL,
            description VARCHAR(500),
            background_file_id UUID,
            areas_definition JSONB,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
            CONSTRAINT fk_document_template_background
                FOREIGN KEY (background_file_id) REFERENCES file_objects(id) ON DELETE SET NULL
        );
        CREATE INDEX ix_document_templates_background_file_id ON document_templates(background_file_id);
        RAISE NOTICE 'Table document_templates created';
    ELSE
        RAISE NOTICE 'Table document_templates already exists';
    END IF;
END $$;

-- Create user_documents table
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables WHERE table_name = 'user_documents'
    ) THEN
        CREATE TABLE user_documents (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            title VARCHAR(255) NOT NULL,
            document_type_id UUID,
            pages JSONB,
            created_by UUID,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE,
            CONSTRAINT fk_user_document_created_by
                FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
        );
        CREATE INDEX ix_user_documents_created_by ON user_documents(created_by);
        CREATE INDEX ix_user_documents_created_at ON user_documents(created_at);
        RAISE NOTICE 'Table user_documents created';
    ELSE
        RAISE NOTICE 'Table user_documents already exists';
    END IF;
END $$;
