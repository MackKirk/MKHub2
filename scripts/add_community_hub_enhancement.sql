-- Community Module Enhancement: publication workflow, priority, related area, mentions, comment threading, notification idempotency
-- Safe to run multiple times (idempotent checks)

-- community_posts: status, publish_at, priority, related_area, notifications_sent_at
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='community_posts' AND column_name='status') THEN
        ALTER TABLE community_posts ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'published';
        CREATE INDEX IF NOT EXISTS ix_community_posts_status ON community_posts(status);
        RAISE NOTICE 'Column status added';
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='community_posts' AND column_name='publish_at') THEN
        ALTER TABLE community_posts ADD COLUMN publish_at TIMESTAMP WITH TIME ZONE;
        CREATE INDEX IF NOT EXISTS ix_community_posts_publish_at ON community_posts(publish_at);
        UPDATE community_posts SET publish_at = created_at WHERE publish_at IS NULL;
        RAISE NOTICE 'Column publish_at added';
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='community_posts' AND column_name='priority') THEN
        ALTER TABLE community_posts ADD COLUMN priority VARCHAR(20) NOT NULL DEFAULT 'normal';
        CREATE INDEX IF NOT EXISTS ix_community_posts_priority ON community_posts(priority);
        UPDATE community_posts SET priority = CASE WHEN is_urgent THEN 'urgent' ELSE 'normal' END;
        RAISE NOTICE 'Column priority added';
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='community_posts' AND column_name='related_area') THEN
        ALTER TABLE community_posts ADD COLUMN related_area VARCHAR(40) NOT NULL DEFAULT 'general';
        CREATE INDEX IF NOT EXISTS ix_community_posts_related_area ON community_posts(related_area);
        RAISE NOTICE 'Column related_area added';
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='community_posts' AND column_name='notifications_sent_at') THEN
        ALTER TABLE community_posts ADD COLUMN notifications_sent_at TIMESTAMP WITH TIME ZONE;
        RAISE NOTICE 'Column notifications_sent_at added';
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_community_posts_status_publish_at ON community_posts(status, publish_at);

-- Threaded comments
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='community_post_comments' AND column_name='parent_comment_id') THEN
        ALTER TABLE community_post_comments ADD COLUMN parent_comment_id UUID REFERENCES community_post_comments(id) ON DELETE SET NULL;
        CREATE INDEX IF NOT EXISTS ix_community_post_comments_parent ON community_post_comments(parent_comment_id);
        RAISE NOTICE 'Column parent_comment_id added to community_post_comments';
    END IF;
END $$;

-- Mentions (resolved targets from composer)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='community_mentions') THEN
        CREATE TABLE community_mentions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            post_id UUID REFERENCES community_posts(id) ON DELETE CASCADE,
            comment_id UUID REFERENCES community_post_comments(id) ON DELETE CASCADE,
            entity_type VARCHAR(32) NOT NULL,
            entity_id VARCHAR(64) NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
            CONSTRAINT chk_community_mention_source CHECK (
                (post_id IS NOT NULL AND comment_id IS NULL) OR (post_id IS NULL AND comment_id IS NOT NULL)
            )
        );
        CREATE INDEX ix_community_mentions_post ON community_mentions(post_id);
        CREATE INDEX ix_community_mentions_comment ON community_mentions(comment_id);
        RAISE NOTICE 'Table community_mentions created';
    END IF;
END $$;
