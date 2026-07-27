-- Migration: Project Warranties module tables
-- Idempotent — safe to run multiple times.

-- project_warranties
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables WHERE table_name = 'project_warranties'
    ) THEN
        CREATE TABLE project_warranties (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            name VARCHAR(255) NOT NULL,
            warranty_type VARCHAR(50) NOT NULL DEFAULT 'workmanship',
            provider_type VARCHAR(50) NOT NULL DEFAULT 'other',
            provider_name VARCHAR(255),
            status VARCHAR(50) NOT NULL DEFAULT 'draft',
            certificate_or_registration_number VARCHAR(255),
            internal_responsible_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
            provider_contact_name VARCHAR(255),
            provider_contact_email VARCHAR(255),
            provider_contact_phone VARCHAR(100),
            notes TEXT,
            supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
            subcontractor_company_id UUID REFERENCES subcontractor_companies(id) ON DELETE SET NULL,
            coverage_type VARCHAR(50) NOT NULL DEFAULT 'entire_project',
            covered_division_ids JSONB,
            covered_scope_ids JSONB,
            coverage_description TEXT,
            exclusions TEXT,
            special_conditions TEXT,
            maximum_coverage_amount NUMERIC(14, 2),
            start_date DATE,
            duration_value INTEGER,
            duration_unit VARCHAR(20),
            end_date DATE,
            start_date_basis VARCHAR(50),
            issue_date DATE,
            activation_date DATE,
            maintenance_required BOOLEAN NOT NULL DEFAULT FALSE,
            maintenance_frequency VARCHAR(50),
            maintenance_interval_value INTEGER,
            maintenance_interval_unit VARCHAR(20),
            first_maintenance_due_date DATE,
            next_maintenance_due_date DATE,
            maintenance_instructions TEXT,
            maintenance_responsible_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
            consequence_if_missed TEXT,
            last_maintenance_completed_at TIMESTAMPTZ,
            last_maintenance_completed_by UUID REFERENCES users(id) ON DELETE SET NULL,
            document_required BOOLEAN NOT NULL DEFAULT FALSE,
            registration_required BOOLEAN NOT NULL DEFAULT FALSE,
            voided_at TIMESTAMPTZ,
            voided_reason TEXT,
            voided_notes TEXT,
            cancelled_at TIMESTAMPTZ,
            cancelled_reason TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            created_by UUID REFERENCES users(id) ON DELETE SET NULL,
            updated_at TIMESTAMPTZ,
            updated_by UUID REFERENCES users(id) ON DELETE SET NULL
        );
        CREATE INDEX ix_project_warranties_project_id ON project_warranties(project_id);
        CREATE INDEX ix_project_warranties_project_status ON project_warranties(project_id, status);
        CREATE INDEX ix_project_warranties_end_date ON project_warranties(end_date);
        CREATE INDEX ix_project_warranties_next_maint ON project_warranties(next_maintenance_due_date);
        RAISE NOTICE 'Created project_warranties';
    END IF;
END $$;

-- warranty_maintenances
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables WHERE table_name = 'warranty_maintenances'
    ) THEN
        CREATE TABLE warranty_maintenances (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            warranty_id UUID NOT NULL REFERENCES project_warranties(id) ON DELETE CASCADE,
            project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            completed_at TIMESTAMPTZ NOT NULL,
            completed_by UUID REFERENCES users(id) ON DELETE SET NULL,
            notes TEXT,
            next_due_date_snapshot DATE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            created_by UUID REFERENCES users(id) ON DELETE SET NULL
        );
        CREATE INDEX ix_warranty_maintenances_warranty ON warranty_maintenances(warranty_id, completed_at DESC);
        RAISE NOTICE 'Created warranty_maintenances';
    END IF;
END $$;

-- warranty_claims
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables WHERE table_name = 'warranty_claims'
    ) THEN
        CREATE TABLE warranty_claims (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            warranty_id UUID REFERENCES project_warranties(id) ON DELETE SET NULL,
            claim_number VARCHAR(50) NOT NULL,
            reported_date DATE NOT NULL,
            reported_by_name VARCHAR(255),
            reported_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
            customer_contact_name VARCHAR(255),
            customer_contact_email VARCHAR(255),
            customer_contact_phone VARCHAR(100),
            issue_location VARCHAR(500),
            description TEXT NOT NULL,
            severity VARCHAR(20) NOT NULL DEFAULT 'medium',
            assigned_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
            status VARCHAR(50) NOT NULL DEFAULT 'reported',
            coverage_decision VARCHAR(50) NOT NULL DEFAULT 'pending_assessment',
            assessment_notes TEXT,
            decision_date DATE,
            decision_made_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
            customer_notified_date DATE,
            denial_reason TEXT,
            follow_up_required BOOLEAN NOT NULL DEFAULT FALSE,
            follow_up_date DATE,
            root_cause TEXT,
            work_performed TEXT,
            resolution_notes TEXT,
            completion_date DATE,
            resolved_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
            customer_confirmation BOOLEAN,
            labour_cost NUMERIC(14, 2),
            material_cost NUMERIC(14, 2),
            subcontractor_cost NUMERIC(14, 2),
            other_cost NUMERIC(14, 2),
            total_internal_cost NUMERIC(14, 2),
            amount_charged_to_customer NUMERIC(14, 2),
            recoverable_amount NUMERIC(14, 2),
            cost_responsibility VARCHAR(50),
            cancelled_at TIMESTAMPTZ,
            cancelled_reason TEXT,
            cancelled_by UUID REFERENCES users(id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            created_by UUID REFERENCES users(id) ON DELETE SET NULL,
            updated_at TIMESTAMPTZ,
            updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
            UNIQUE (project_id, claim_number)
        );
        CREATE INDEX ix_warranty_claims_project_status ON warranty_claims(project_id, status);
        CREATE INDEX ix_warranty_claims_warranty ON warranty_claims(warranty_id);
        CREATE INDEX ix_warranty_claims_assigned ON warranty_claims(assigned_user_id);
        CREATE INDEX ix_warranty_claims_follow_up ON warranty_claims(follow_up_date);
        RAISE NOTICE 'Created warranty_claims';
    END IF;
END $$;

-- warranty_activity_logs
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables WHERE table_name = 'warranty_activity_logs'
    ) THEN
        CREATE TABLE warranty_activity_logs (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            warranty_id UUID REFERENCES project_warranties(id) ON DELETE SET NULL,
            claim_id UUID REFERENCES warranty_claims(id) ON DELETE SET NULL,
            action VARCHAR(80) NOT NULL,
            details JSONB,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            created_by UUID REFERENCES users(id) ON DELETE SET NULL
        );
        CREATE INDEX ix_warranty_activity_project ON warranty_activity_logs(project_id, created_at DESC);
        RAISE NOTICE 'Created warranty_activity_logs';
    END IF;
END $$;

-- warranty_alert_events
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables WHERE table_name = 'warranty_alert_events'
    ) THEN
        CREATE TABLE warranty_alert_events (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            entity_type VARCHAR(20) NOT NULL,
            entity_id UUID NOT NULL,
            alert_key VARCHAR(80) NOT NULL,
            sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (entity_type, entity_id, alert_key)
        );
        CREATE INDEX ix_warranty_alert_events_entity ON warranty_alert_events(entity_type, entity_id);
        RAISE NOTICE 'Created warranty_alert_events';
    END IF;
END $$;

-- client_files warranty links
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'client_files' AND column_name = 'related_warranty_id'
    ) THEN
        ALTER TABLE client_files
            ADD COLUMN related_warranty_id UUID REFERENCES project_warranties(id) ON DELETE SET NULL;
        RAISE NOTICE 'Added client_files.related_warranty_id';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'client_files' AND column_name = 'related_warranty_claim_id'
    ) THEN
        ALTER TABLE client_files
            ADD COLUMN related_warranty_claim_id UUID REFERENCES warranty_claims(id) ON DELETE SET NULL;
        RAISE NOTICE 'Added client_files.related_warranty_claim_id';
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_client_files_related_warranty
    ON client_files(related_warranty_id) WHERE related_warranty_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_client_files_warranty_category
    ON client_files(category) WHERE category = 'warranty';
