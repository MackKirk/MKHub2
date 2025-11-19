-- Migration script to add new columns to fleet_assets table
-- Run this script directly on your PostgreSQL database

-- Add unit_number column
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'fleet_assets' AND column_name = 'unit_number'
    ) THEN
        ALTER TABLE fleet_assets ADD COLUMN unit_number VARCHAR(50);
        CREATE INDEX IF NOT EXISTS idx_fleet_asset_unit_number ON fleet_assets(unit_number);
    END IF;
END $$;

-- Add make column
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'fleet_assets' AND column_name = 'make'
    ) THEN
        ALTER TABLE fleet_assets ADD COLUMN make VARCHAR(100);
    END IF;
END $$;

-- Add condition column
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'fleet_assets' AND column_name = 'condition'
    ) THEN
        ALTER TABLE fleet_assets ADD COLUMN condition VARCHAR(50);
    END IF;
END $$;

-- Add body_style column
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'fleet_assets' AND column_name = 'body_style'
    ) THEN
        ALTER TABLE fleet_assets ADD COLUMN body_style VARCHAR(100);
    END IF;
END $$;

-- Add driver_id column (with foreign key)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'fleet_assets' AND column_name = 'driver_id'
    ) THEN
        ALTER TABLE fleet_assets ADD COLUMN driver_id UUID;
        ALTER TABLE fleet_assets ADD CONSTRAINT fk_fleet_asset_driver 
            FOREIGN KEY (driver_id) REFERENCES users(id) ON DELETE SET NULL;
        CREATE INDEX IF NOT EXISTS idx_fleet_asset_driver ON fleet_assets(driver_id);
    END IF;
END $$;

-- Add icbc_registration_no column
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'fleet_assets' AND column_name = 'icbc_registration_no'
    ) THEN
        ALTER TABLE fleet_assets ADD COLUMN icbc_registration_no VARCHAR(50);
    END IF;
END $$;

-- Add vancouver_decals column
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'fleet_assets' AND column_name = 'vancouver_decals'
    ) THEN
        ALTER TABLE fleet_assets ADD COLUMN vancouver_decals JSONB;
    END IF;
END $$;

-- Add ferry_length column
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'fleet_assets' AND column_name = 'ferry_length'
    ) THEN
        ALTER TABLE fleet_assets ADD COLUMN ferry_length VARCHAR(50);
    END IF;
END $$;

-- Add gvw_kg column
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'fleet_assets' AND column_name = 'gvw_kg'
    ) THEN
        ALTER TABLE fleet_assets ADD COLUMN gvw_kg INTEGER;
    END IF;
END $$;

-- Verify all columns were added
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'fleet_assets' 
ORDER BY ordinal_position;

