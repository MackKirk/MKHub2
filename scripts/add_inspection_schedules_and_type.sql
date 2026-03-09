-- Migration: inspection_schedules table + fleet_inspections.inspection_type, inspection_schedule_id
-- Run manually on PostgreSQL if needed.

-- New table: inspection_schedules
CREATE TABLE IF NOT EXISTS inspection_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fleet_asset_id UUID NOT NULL REFERENCES fleet_assets(id) ON DELETE CASCADE,
    scheduled_at TIMESTAMPTZ NOT NULL,
    urgency VARCHAR(20) NOT NULL DEFAULT 'normal',
    category VARCHAR(50) NOT NULL DEFAULT 'inspection',
    notes TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'scheduled',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_inspection_schedule_asset_date ON inspection_schedules (fleet_asset_id, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_inspection_schedule_status ON inspection_schedules (status);
CREATE INDEX IF NOT EXISTS idx_inspection_schedule_fleet_asset ON inspection_schedules (fleet_asset_id);
CREATE INDEX IF NOT EXISTS idx_inspection_schedule_scheduled_at ON inspection_schedules (scheduled_at);

-- Add columns to fleet_inspections (idempotent)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fleet_inspections' AND column_name = 'inspection_type') THEN
        ALTER TABLE fleet_inspections ADD COLUMN inspection_type VARCHAR(50) NOT NULL DEFAULT 'mechanical';
        RAISE NOTICE 'Column inspection_type added to fleet_inspections';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fleet_inspections' AND column_name = 'inspection_schedule_id') THEN
        ALTER TABLE fleet_inspections ADD COLUMN inspection_schedule_id UUID REFERENCES inspection_schedules(id) ON DELETE SET NULL;
        RAISE NOTICE 'Column inspection_schedule_id added to fleet_inspections';
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_inspection_type ON fleet_inspections (inspection_type);
CREATE INDEX IF NOT EXISTS idx_inspection_schedule_id ON fleet_inspections (inspection_schedule_id) WHERE inspection_schedule_id IS NOT NULL;
