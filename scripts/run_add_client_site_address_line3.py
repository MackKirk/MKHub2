"""One-off: add client_sites address line3 + complements if missing. Safe to re-run."""
from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine, text

ROOT = Path(__file__).resolve().parents[1]

COLS = (
    "site_address_line1_complement",
    "site_address_line2_complement",
    "site_address_line3",
    "site_address_line3_complement",
)


def main() -> None:
    load_dotenv(ROOT / ".env")
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise SystemExit("DATABASE_URL not set")
    if not url.startswith("postgresql"):
        raise SystemExit("This migration is for PostgreSQL only")
    engine = create_engine(url)
    with engine.begin() as conn:
        for col in COLS:
            conn.execute(
                text(f"ALTER TABLE client_sites ADD COLUMN IF NOT EXISTS {col} VARCHAR(255) NULL")
            )
    print("OK: client_sites address line3 / complements")


if __name__ == "__main__":
    main()
