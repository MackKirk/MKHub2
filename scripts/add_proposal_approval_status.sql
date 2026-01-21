-- Add approval_status column to proposals table
-- This allows Change Orders to track their approval status

-- Add approval_status column (VARCHAR(50), nullable)
ALTER TABLE proposals 
ADD COLUMN IF NOT EXISTS approval_status VARCHAR(50);

-- Create index on approval_status for better query performance
CREATE INDEX IF NOT EXISTS idx_proposals_approval_status ON proposals(approval_status);
