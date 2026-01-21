-- Add Change Order columns to proposals table
-- This allows proposals to track Change Orders (versions) of proposals

-- Add is_change_order column (boolean, default false)
ALTER TABLE proposals 
ADD COLUMN IF NOT EXISTS is_change_order BOOLEAN DEFAULT FALSE;

-- Add change_order_number column (integer, nullable)
ALTER TABLE proposals 
ADD COLUMN IF NOT EXISTS change_order_number INTEGER;

-- Add parent_proposal_id column (UUID, nullable, foreign key to proposals.id)
ALTER TABLE proposals 
ADD COLUMN IF NOT EXISTS parent_proposal_id UUID;

-- Add approved_report_id column (UUID, nullable, foreign key to project_reports.id)
ALTER TABLE proposals 
ADD COLUMN IF NOT EXISTS approved_report_id UUID;

-- Add foreign key constraint for parent_proposal_id
-- This ensures that parent_proposal_id references a valid proposal
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'fk_proposals_parent_proposal_id'
    ) THEN
        ALTER TABLE proposals 
        ADD CONSTRAINT fk_proposals_parent_proposal_id 
        FOREIGN KEY (parent_proposal_id) 
        REFERENCES proposals(id) 
        ON DELETE SET NULL;
    END IF;
END $$;

-- Add foreign key constraint for approved_report_id
-- This ensures that approved_report_id references a valid report
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'fk_proposals_approved_report_id'
    ) THEN
        ALTER TABLE proposals 
        ADD CONSTRAINT fk_proposals_approved_report_id 
        FOREIGN KEY (approved_report_id) 
        REFERENCES project_reports(id) 
        ON DELETE SET NULL;
    END IF;
END $$;

-- Create index on is_change_order for better query performance
CREATE INDEX IF NOT EXISTS idx_proposals_is_change_order ON proposals(is_change_order);

-- Create index on change_order_number for better query performance
CREATE INDEX IF NOT EXISTS idx_proposals_change_order_number ON proposals(change_order_number);

-- Create index on parent_proposal_id for better query performance
CREATE INDEX IF NOT EXISTS idx_proposals_parent_proposal_id ON proposals(parent_proposal_id);

-- Create index on approved_report_id for better query performance
CREATE INDEX IF NOT EXISTS idx_proposals_approved_report_id ON proposals(approved_report_id);
