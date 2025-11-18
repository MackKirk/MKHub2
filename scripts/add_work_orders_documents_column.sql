-- Migration script to add documents column to work_orders table
-- Run this manually on your Render PostgreSQL database if needed

-- Check if column exists, if not add it
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name='work_orders' AND column_name='documents'
    ) THEN
        ALTER TABLE work_orders ADD COLUMN documents JSONB;
        RAISE NOTICE 'Column documents added to work_orders table';
    ELSE
        RAISE NOTICE 'Column documents already exists in work_orders table';
    END IF;
END $$;

