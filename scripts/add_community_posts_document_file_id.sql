-- Add document_file_id column to community_posts table
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name='community_posts' 
        AND column_name='document_file_id'
    ) THEN
        ALTER TABLE community_posts
        ADD COLUMN document_file_id UUID,
        ADD CONSTRAINT fk_community_post_document_file 
            FOREIGN KEY (document_file_id) 
            REFERENCES file_objects(id) 
            ON DELETE SET NULL;
        
        CREATE INDEX IF NOT EXISTS ix_community_posts_document_file_id ON community_posts(document_file_id);
        
        RAISE NOTICE 'Column document_file_id added to community_posts table';
    ELSE
        RAISE NOTICE 'Column document_file_id already exists in community_posts table';
    END IF;
END $$;

