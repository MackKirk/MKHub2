#!/usr/bin/env python3
"""Run migrate_equipment_status_to_fleet.sql using the app's DATABASE_URL."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def main():
    from sqlalchemy import text
    from app.db import engine
    from app.config import settings

    db_label = settings.database_url.split("@")[-1] if "@" in settings.database_url else settings.database_url
    print(f"Database: {db_label}")

    with engine.connect() as conn:
        before = conn.execute(
            text("SELECT status, COUNT(*) AS cnt FROM equipment GROUP BY status ORDER BY status")
        ).fetchall()
        total = conn.execute(text("SELECT COUNT(*) FROM equipment")).scalar()
        print(f"Total equipment rows: {total}")
        print("Status antes:")
        for status, cnt in before:
            print(f"  {status!r}: {cnt}")

    with engine.begin() as conn:
        r1 = conn.execute(
            text("UPDATE equipment SET status = 'active' WHERE status IN ('available', 'checked_out')")
        )
        r2 = conn.execute(
            text(
                "UPDATE equipment SET status = 'inactive' "
                "WHERE status NOT IN ('active', 'inactive', 'maintenance', 'retired')"
            )
        )
        print(f"Linhas atualizadas (available/checked_out -> active): {r1.rowcount}")
        print(f"Linhas atualizadas (outros -> inactive): {r2.rowcount}")

    with engine.connect() as conn:
        after = conn.execute(
            text("SELECT status, COUNT(*) AS cnt FROM equipment GROUP BY status ORDER BY status")
        ).fetchall()
        print("Status depois:")
        for status, cnt in after:
            print(f"  {status!r}: {cnt}")

    print("Migracao concluida. Nenhuma linha foi apagada — apenas UPDATE em status.")


if __name__ == "__main__":
    main()
