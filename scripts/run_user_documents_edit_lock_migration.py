#!/usr/bin/env python3
"""Run add_user_documents_edit_lock.sql using the app's DATABASE_URL."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    from dotenv import load_dotenv
    load_dotenv()
except Exception:
    pass


def main():
    from sqlalchemy import text
    from app.db import engine

    dialect = engine.dialect.name
    sql_path = os.path.join(os.path.dirname(__file__), "add_user_documents_edit_lock.sql")
    with open(sql_path, "r", encoding="utf-8") as f:
        sql = f.read()

    if dialect == "sqlite":
        # SQLite has no DO $$ blocks / information_schema the same way — add columns if missing.
        from sqlalchemy import inspect

        insp = inspect(engine)
        if "user_documents" not in insp.get_table_names():
            print("Table user_documents does not exist — skip.")
            return
        existing = {c["name"] for c in insp.get_columns("user_documents")}
        with engine.begin() as conn:
            if "edit_lock_user_id" not in existing:
                conn.execute(text("ALTER TABLE user_documents ADD COLUMN edit_lock_user_id VARCHAR(36)"))
                print("Added user_documents.edit_lock_user_id")
            else:
                print("edit_lock_user_id already exists")
            if "edit_lock_session_id" not in existing:
                conn.execute(text("ALTER TABLE user_documents ADD COLUMN edit_lock_session_id VARCHAR(64)"))
                print("Added user_documents.edit_lock_session_id")
            else:
                print("edit_lock_session_id already exists")
            if "edit_lock_expires_at" not in existing:
                conn.execute(text("ALTER TABLE user_documents ADD COLUMN edit_lock_expires_at DATETIME"))
                print("Added user_documents.edit_lock_expires_at")
            else:
                print("edit_lock_expires_at already exists")
        print("Migration completed (SQLite).")
        return

    with engine.begin() as conn:
        conn.execute(text(sql))
    print("Migration completed: user_documents edit lock columns applied.")


if __name__ == "__main__":
    main()
