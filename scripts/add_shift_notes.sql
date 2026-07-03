-- Migration script to add notes column to shifts table
-- Optional free-text notes on a scheduled shift (editable via Workload edit modal)
-- Run this script on your database

ALTER TABLE shifts ADD COLUMN IF NOT EXISTS notes TEXT;
