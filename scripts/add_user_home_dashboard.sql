-- Migration: user_home_dashboard table for per-user home dashboard layout.
-- Optional: app startup also creates this table if missing (SQLite/Postgres).
-- Run manually on PostgreSQL if needed.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_name = 'user_home_dashboard'
    ) THEN
        CREATE TABLE user_home_dashboard (
            user_id UUID NOT NULL PRIMARY KEY,
            layout JSONB,
            widgets JSONB,
            updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
            CONSTRAINT fk_user_home_dashboard_user
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE INDEX ix_user_home_dashboard_user_id ON user_home_dashboard(user_id);
        RAISE NOTICE 'Table user_home_dashboard created';
    ELSE
        RAISE NOTICE 'Table user_home_dashboard already exists';
    END IF;
END $$;
