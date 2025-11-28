-- Add parent_id column to setting_items table for hierarchical divisions
ALTER TABLE setting_items 
ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES setting_items(id) ON DELETE CASCADE;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_setting_items_parent_id ON setting_items(parent_id);

