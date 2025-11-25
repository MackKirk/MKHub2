-- Migration script to add break_minutes column to attendance table
-- This column stores the break minutes deducted for shifts of 5 hours or more
-- Run this script on your database

-- For PostgreSQL (run this in psql or your database client):
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS break_minutes INTEGER;

-- If your PostgreSQL version doesn't support IF NOT EXISTS, use this instead:
-- DO $$
-- BEGIN
--     IF NOT EXISTS (
--         SELECT 1 
--         FROM information_schema.columns 
--         WHERE table_name='attendance' AND column_name='break_minutes'
--     ) THEN
--         ALTER TABLE attendance ADD COLUMN break_minutes INTEGER;
--         RAISE NOTICE 'Column break_minutes added to attendance table';
--     ELSE
--         RAISE NOTICE 'Column break_minutes already exists in attendance table';
--     END IF;
-- END $$;

-- For SQLite (run this if using SQLite):
-- ALTER TABLE attendance ADD COLUMN break_minutes INTEGER;
