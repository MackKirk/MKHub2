#!/usr/bin/env python3
"""
Add margins and default_elements columns to document_templates.
Run from project root: python scripts/add_document_template_layout.py
"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    from dotenv import load_dotenv
    load_dotenv()
except Exception:
    pass

from sqlalchemy import text
from app.db import engine

def run():
    with engine.connect() as conn:
        for col in ("margins", "default_elements"):
            try:
                if engine.dialect.name == "postgresql":
                    conn.execute(text(f"ALTER TABLE document_templates ADD COLUMN IF NOT EXISTS {col} JSONB"))
                else:
                    conn.execute(text(f"ALTER TABLE document_templates ADD COLUMN {col} JSON"))
                conn.commit()
                print(f"Added column document_templates.{col}")
            except Exception as e:
                err = str(e).lower()
                if "duplicate" in err or "already exists" in err or "sqlite" in err and "duplicate" in err:
                    print(f"Column {col} already exists, skipping")
                else:
                    raise
    print("Done.")

if __name__ == "__main__":
    run()
