#!/usr/bin/env python3
"""
Add project ACL schema:
- projects.created_by_user_id
- project_members table
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text

from app.db import engine


def run() -> None:
    dialect_name = engine.url.get_backend_name()
    is_postgres = dialect_name == "postgresql"

    with engine.begin() as conn:
        if is_postgres:
            conn.execute(
                text(
                    """
                    ALTER TABLE projects
                    ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL
                    """
                )
            )
            conn.execute(
                text(
                    """
                    CREATE INDEX IF NOT EXISTS idx_projects_created_by_user_id
                    ON projects(created_by_user_id)
                    """
                )
            )
            conn.execute(
                text(
                    """
                    CREATE TABLE IF NOT EXISTS project_members (
                        id UUID PRIMARY KEY,
                        project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                        member_role VARCHAR(50),
                        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                        added_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL
                    )
                    """
                )
            )
            conn.execute(
                text(
                    """
                    CREATE UNIQUE INDEX IF NOT EXISTS uq_project_members_project_user
                    ON project_members(project_id, user_id)
                    """
                )
            )
            conn.execute(
                text(
                    """
                    CREATE INDEX IF NOT EXISTS idx_project_members_project_id
                    ON project_members(project_id)
                    """
                )
            )
            conn.execute(
                text(
                    """
                    CREATE INDEX IF NOT EXISTS idx_project_members_user_id
                    ON project_members(user_id)
                    """
                )
            )
        else:
            # SQLite
            cols = conn.execute(
                text(
                    """
                    SELECT name FROM pragma_table_info('projects')
                    WHERE name = 'created_by_user_id'
                    """
                )
            ).fetchall()
            if not cols:
                conn.execute(text("ALTER TABLE projects ADD COLUMN created_by_user_id TEXT"))
            conn.execute(
                text(
                    """
                    CREATE INDEX IF NOT EXISTS idx_projects_created_by_user_id
                    ON projects(created_by_user_id)
                    """
                )
            )
            conn.execute(
                text(
                    """
                    CREATE TABLE IF NOT EXISTS project_members (
                        id TEXT PRIMARY KEY,
                        project_id TEXT NOT NULL,
                        user_id TEXT NOT NULL,
                        member_role TEXT,
                        created_at TEXT,
                        added_by_user_id TEXT
                    )
                    """
                )
            )
            conn.execute(
                text(
                    """
                    CREATE UNIQUE INDEX IF NOT EXISTS uq_project_members_project_user
                    ON project_members(project_id, user_id)
                    """
                )
            )
            conn.execute(
                text(
                    """
                    CREATE INDEX IF NOT EXISTS idx_project_members_project_id
                    ON project_members(project_id)
                    """
                )
            )
            conn.execute(
                text(
                    """
                    CREATE INDEX IF NOT EXISTS idx_project_members_user_id
                    ON project_members(user_id)
                    """
                )
            )

    print("Project ACL schema migration completed.")


if __name__ == "__main__":
    run()
