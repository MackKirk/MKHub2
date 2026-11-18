-- Migration: shifts.crew_group_id + crew_role (idempotent)

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables WHERE table_name = 'shifts'
    ) THEN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'shifts' AND column_name = 'crew_group_id'
        ) THEN
            ALTER TABLE shifts ADD COLUMN crew_group_id UUID;
            RAISE NOTICE 'Added shifts.crew_group_id';
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'shifts' AND column_name = 'crew_role'
        ) THEN
            ALTER TABLE shifts ADD COLUMN crew_role VARCHAR(20);
            RAISE NOTICE 'Added shifts.crew_role';
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM pg_indexes
            WHERE tablename = 'shifts' AND indexname = 'idx_shifts_crew_group_id'
        ) THEN
            CREATE INDEX idx_shifts_crew_group_id ON shifts(crew_group_id);
            RAISE NOTICE 'Created idx_shifts_crew_group_id';
        END IF;
    END IF;
END $$;
