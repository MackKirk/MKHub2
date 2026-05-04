-- Adds audience targeting by specific employees (community_posts.target_user_ids).
-- Safe to run once; ignores if column already exists (PostgreSQL).

ALTER TABLE community_posts
ADD COLUMN IF NOT EXISTS target_user_ids JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN community_posts.target_user_ids IS 'When target_type=users: list of user id strings who receive the post';
