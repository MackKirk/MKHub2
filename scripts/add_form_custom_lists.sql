-- Global reusable custom lists for safety form template dropdowns (up to 3 levels).
-- Run on PostgreSQL when you prefer a manual migration (idempotent: only CREATE IF NOT EXISTS; no DELETE/DROP of existing data).
-- The app also creates these tables on startup (PostgreSQL) via SQLAlchemy create_all — restart the API if tables are missing.

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'form_custom_lists') THEN
        CREATE TABLE form_custom_lists (
            id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
            name VARCHAR(255) NOT NULL,
            description TEXT,
            status VARCHAR(20) NOT NULL DEFAULT 'active',
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE,
            created_by UUID REFERENCES users(id) ON DELETE SET NULL
        );
        CREATE INDEX ix_form_custom_lists_status ON form_custom_lists(status);
        CREATE INDEX ix_form_custom_lists_updated_at ON form_custom_lists(updated_at);
        RAISE NOTICE 'Table form_custom_lists created';
    ELSE
        RAISE NOTICE 'Table form_custom_lists already exists';
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'form_custom_list_items') THEN
        CREATE TABLE form_custom_list_items (
            id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
            list_id UUID NOT NULL REFERENCES form_custom_lists(id) ON DELETE CASCADE,
            parent_id UUID REFERENCES form_custom_list_items(id) ON DELETE CASCADE,
            name VARCHAR(500) NOT NULL,
            sort_order INTEGER NOT NULL DEFAULT 0,
            depth SMALLINT NOT NULL,
            status VARCHAR(20) NOT NULL DEFAULT 'active',
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE,
            CONSTRAINT ck_form_custom_list_items_depth CHECK (depth >= 1 AND depth <= 3)
        );
        CREATE INDEX ix_form_custom_list_items_list ON form_custom_list_items(list_id);
        CREATE INDEX ix_form_custom_list_items_parent ON form_custom_list_items(parent_id);
        RAISE NOTICE 'Table form_custom_list_items created';
    ELSE
        RAISE NOTICE 'Table form_custom_list_items already exists';
    END IF;
END $$;
