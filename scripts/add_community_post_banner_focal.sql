-- Banner crop position for community_posts.photo_file_id (CSS object-position, 0–100).
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'community_posts' AND column_name = 'banner_focal_x'
    ) THEN
        ALTER TABLE community_posts ADD COLUMN banner_focal_x DOUBLE PRECISION NOT NULL DEFAULT 50;
        RAISE NOTICE 'Column banner_focal_x added to community_posts';
    END IF;
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'community_posts' AND column_name = 'banner_focal_y'
    ) THEN
        ALTER TABLE community_posts ADD COLUMN banner_focal_y DOUBLE PRECISION NOT NULL DEFAULT 50;
        RAISE NOTICE 'Column banner_focal_y added to community_posts';
    END IF;
END $$;
