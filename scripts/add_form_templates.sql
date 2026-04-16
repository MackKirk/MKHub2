-- Form templates (Safety) + version snapshots; link project_safety_inspections to a version.
-- Run on PostgreSQL when deploying MVP.

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'form_templates') THEN
        CREATE TABLE form_templates (
            id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
            name VARCHAR(255) NOT NULL,
            description TEXT,
            category VARCHAR(100) NOT NULL DEFAULT 'inspection',
            status VARCHAR(20) NOT NULL DEFAULT 'active',
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE,
            created_by UUID REFERENCES users(id) ON DELETE SET NULL
        );
        CREATE INDEX ix_form_templates_status ON form_templates(status);
        CREATE INDEX ix_form_templates_category ON form_templates(category);
        RAISE NOTICE 'Table form_templates created';
    ELSE
        RAISE NOTICE 'Table form_templates already exists';
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'form_template_versions') THEN
        CREATE TABLE form_template_versions (
            id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
            form_template_id UUID NOT NULL REFERENCES form_templates(id) ON DELETE CASCADE,
            version INTEGER NOT NULL,
            definition JSONB NOT NULL DEFAULT '{}'::jsonb,
            is_published BOOLEAN NOT NULL DEFAULT FALSE,
            published_at TIMESTAMP WITH TIME ZONE,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
            created_by UUID REFERENCES users(id) ON DELETE SET NULL,
            CONSTRAINT uq_form_template_version UNIQUE (form_template_id, version)
        );
        CREATE INDEX ix_form_template_versions_template ON form_template_versions(form_template_id);
        CREATE INDEX ix_form_template_versions_published ON form_template_versions(form_template_id, is_published);
        RAISE NOTICE 'Table form_template_versions created';
    ELSE
        RAISE NOTICE 'Table form_template_versions already exists';
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'project_safety_inspections' AND column_name = 'form_template_version_id'
    ) THEN
        ALTER TABLE project_safety_inspections
            ADD COLUMN form_template_version_id UUID REFERENCES form_template_versions(id) ON DELETE SET NULL;
        CREATE INDEX ix_project_safety_inspections_template_version ON project_safety_inspections(form_template_version_id);
        RAISE NOTICE 'Column form_template_version_id added';
    ELSE
        RAISE NOTICE 'Column form_template_version_id already exists';
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'project_safety_inspections' AND column_name = 'assigned_user_id'
    ) THEN
        ALTER TABLE project_safety_inspections
            ADD COLUMN assigned_user_id UUID REFERENCES users(id) ON DELETE SET NULL;
        CREATE INDEX ix_project_safety_inspections_assigned_user ON project_safety_inspections(assigned_user_id);
        RAISE NOTICE 'Column assigned_user_id added';
    ELSE
        RAISE NOTICE 'Column assigned_user_id already exists';
    END IF;
END $$;
