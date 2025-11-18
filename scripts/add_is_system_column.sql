-- Migration script to add is_system column to clients table
-- Run this manually on your Render PostgreSQL database

-- Check if column exists, if not add it
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name='clients' AND column_name='is_system'
    ) THEN
        ALTER TABLE clients ADD COLUMN is_system BOOLEAN DEFAULT FALSE;
        CREATE INDEX IF NOT EXISTS idx_clients_is_system ON clients(is_system);
        RAISE NOTICE 'Column is_system added to clients table';
    ELSE
        RAISE NOTICE 'Column is_system already exists in clients table';
    END IF;
END $$;

