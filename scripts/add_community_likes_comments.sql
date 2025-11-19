-- Migration script to add community_post_likes and community_post_comments tables

DO $$ BEGIN
    -- Create community_post_likes table if it doesn't exist
    IF NOT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'community_post_likes') THEN
        CREATE TABLE community_post_likes (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            post_id UUID NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            liked_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
            CONSTRAINT uq_post_user_like UNIQUE (post_id, user_id)
        );

        CREATE INDEX idx_community_post_likes_post_id ON community_post_likes(post_id);
        CREATE INDEX idx_community_post_likes_user_id ON community_post_likes(user_id);
        CREATE INDEX idx_community_post_likes_liked_at ON community_post_likes(liked_at);
    END IF;

    -- Create community_post_comments table if it doesn't exist
    IF NOT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'community_post_comments') THEN
        CREATE TABLE community_post_comments (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            post_id UUID NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            content TEXT NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE,
            CONSTRAINT fk_comment_post FOREIGN KEY (post_id) REFERENCES community_posts(id) ON DELETE CASCADE,
            CONSTRAINT fk_comment_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE INDEX idx_community_post_comments_post_id ON community_post_comments(post_id);
        CREATE INDEX idx_community_post_comments_user_id ON community_post_comments(user_id);
        CREATE INDEX idx_community_post_comments_created_at ON community_post_comments(created_at);
    END IF;
END $$;

