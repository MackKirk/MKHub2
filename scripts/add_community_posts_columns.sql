-- Migration script to add new columns to community_posts table and create community_post_read_confirmations table
-- Run this manually on your database if needed

-- Add photo_file_id column
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name='community_posts' AND column_name='photo_file_id'
    ) THEN
        ALTER TABLE community_posts ADD COLUMN photo_file_id UUID;
        CREATE INDEX IF NOT EXISTS ix_community_posts_photo_file_id ON community_posts(photo_file_id);
        RAISE NOTICE 'Column photo_file_id added to community_posts table';
    ELSE
        RAISE NOTICE 'Column photo_file_id already exists in community_posts table';
    END IF;
END $$;

-- Add requires_read_confirmation column
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name='community_posts' AND column_name='requires_read_confirmation'
    ) THEN
        ALTER TABLE community_posts ADD COLUMN requires_read_confirmation BOOLEAN DEFAULT FALSE;
        CREATE INDEX IF NOT EXISTS ix_community_posts_requires_read_confirmation ON community_posts(requires_read_confirmation);
        RAISE NOTICE 'Column requires_read_confirmation added to community_posts table';
    ELSE
        RAISE NOTICE 'Column requires_read_confirmation already exists in community_posts table';
    END IF;
END $$;

-- Add target_type column
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name='community_posts' AND column_name='target_type'
    ) THEN
        ALTER TABLE community_posts ADD COLUMN target_type VARCHAR(20) DEFAULT 'all';
        CREATE INDEX IF NOT EXISTS ix_community_posts_target_type ON community_posts(target_type);
        RAISE NOTICE 'Column target_type added to community_posts table';
    ELSE
        RAISE NOTICE 'Column target_type already exists in community_posts table';
    END IF;
END $$;

-- Add target_division_ids column
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name='community_posts' AND column_name='target_division_ids'
    ) THEN
        ALTER TABLE community_posts ADD COLUMN target_division_ids JSONB DEFAULT '[]'::jsonb;
        RAISE NOTICE 'Column target_division_ids added to community_posts table';
    ELSE
        RAISE NOTICE 'Column target_division_ids already exists in community_posts table';
    END IF;
END $$;

-- Create community_post_read_confirmations table
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.tables 
        WHERE table_name='community_post_read_confirmations'
    ) THEN
        CREATE TABLE community_post_read_confirmations (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            post_id UUID NOT NULL,
            user_id UUID NOT NULL,
            confirmed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
            CONSTRAINT fk_community_post_read_confirmation_post 
                FOREIGN KEY (post_id) 
                REFERENCES community_posts(id) 
                ON DELETE CASCADE,
            CONSTRAINT fk_community_post_read_confirmation_user 
                FOREIGN KEY (user_id) 
                REFERENCES users(id) 
                ON DELETE CASCADE,
            CONSTRAINT uq_post_user_confirmation 
                UNIQUE (post_id, user_id)
        );
        
        CREATE INDEX ix_community_post_read_confirmations_post_id ON community_post_read_confirmations(post_id);
        CREATE INDEX ix_community_post_read_confirmations_user_id ON community_post_read_confirmations(user_id);
        CREATE INDEX ix_community_post_read_confirmations_confirmed_at ON community_post_read_confirmations(confirmed_at);
        
        RAISE NOTICE 'Table community_post_read_confirmations created';
    ELSE
        RAISE NOTICE 'Table community_post_read_confirmations already exists';
    END IF;
END $$;

-- Create community_post_views table
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.tables 
        WHERE table_name='community_post_views'
    ) THEN
        CREATE TABLE community_post_views (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            post_id UUID NOT NULL,
            user_id UUID NOT NULL,
            viewed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
            CONSTRAINT fk_community_post_view_post 
                FOREIGN KEY (post_id) 
                REFERENCES community_posts(id) 
                ON DELETE CASCADE,
            CONSTRAINT fk_community_post_view_user 
                FOREIGN KEY (user_id) 
                REFERENCES users(id) 
                ON DELETE CASCADE,
            CONSTRAINT uq_post_user_view 
                UNIQUE (post_id, user_id)
        );
        
        CREATE INDEX ix_community_post_views_post_id ON community_post_views(post_id);
        CREATE INDEX ix_community_post_views_user_id ON community_post_views(user_id);
        CREATE INDEX ix_community_post_views_viewed_at ON community_post_views(viewed_at);
        
        RAISE NOTICE 'Table community_post_views created';
    ELSE
        RAISE NOTICE 'Table community_post_views already exists';
    END IF;
END $$;

