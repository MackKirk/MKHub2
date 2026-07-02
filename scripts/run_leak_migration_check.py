"""Validate leak investigation division placement (subdivision under Commercial Service)."""
from __future__ import annotations

import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine, text

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")

url = os.getenv("DATABASE_URL")
if not url:
    print("No DATABASE_URL", file=sys.stderr)
    sys.exit(1)

engine = create_engine(url)

DIV_SQL = text(
    """
    SELECT child.id::text
    FROM setting_lists sl
    JOIN setting_items parent ON parent.list_id = sl.id
      AND parent.label = 'Commercial Service'
      AND parent.parent_id IS NULL
    JOIN setting_items child ON child.list_id = sl.id
      AND child.parent_id = parent.id
      AND child.label = 'Leak Investigations'
    WHERE sl.name = 'project_divisions'
    LIMIT 1
    """
)
TOP_LEVEL_LEAK_SQL = text(
    """
    SELECT COUNT(*)
    FROM setting_lists sl
    JOIN setting_items si ON si.list_id = sl.id
    WHERE sl.name = 'project_divisions'
      AND si.label = 'Leak Investigations'
      AND si.parent_id IS NULL
    """
)
PM_TOP_LEVEL_SQL = text(
    """
    SELECT COUNT(*)
    FROM setting_lists sl
    JOIN setting_items si ON si.list_id = sl.id
    WHERE sl.name = 'project_divisions'
      AND si.label = 'Preventive Maintenance'
      AND si.parent_id IS NULL
    """
)
GATE1_SQL = text(
    """
    SELECT COUNT(*)
    FROM projects
    WHERE is_leak_investigation = true AND deleted_at IS NULL
    """
)


def gate2_sql(leak_div_id: str):
    return text(
        """
        SELECT COUNT(*)
        FROM projects p
        WHERE p.deleted_at IS NULL
          AND p.business_line = 'repairs_maintenance'
          AND p.is_bidding = false
          AND EXISTS (
            SELECT 1 FROM projects child
            WHERE child.related_leak_investigation_id = p.id
              AND child.deleted_at IS NULL
          )
          AND NOT (p.project_division_ids::text LIKE :leak_pattern)
        """
    ).bindparams(leak_pattern=f"%{leak_div_id}%")


def main() -> None:
    migrate_path = ROOT / "scripts" / "migrate_leak_investigations_to_rm_projects.sql"
    with engine.connect() as conn:
        leak_div_id = conn.execute(DIV_SQL).scalar()
        top_level_leak = conn.execute(TOP_LEVEL_LEAK_SQL).scalar()
        pm_top_level = conn.execute(PM_TOP_LEVEL_SQL).scalar()
        flags_before = conn.execute(GATE1_SQL).scalar()
        print(f"leak_subdiv_id (Commercial Service): {leak_div_id}")
        print(f"top-level Leak Investigations rows: {top_level_leak}")
        print(f"top-level Preventive Maintenance rows: {pm_top_level}")
        print(f"GATE 1 before: {flags_before}")

        if flags_before and flags_before > 0:
            print("Running migrate_leak_investigations_to_rm_projects.sql ...")
            sql = migrate_path.read_text(encoding="utf-8")
            conn.execute(text(sql))
            conn.commit()

        flags_after = conn.execute(GATE1_SQL).scalar()
        print(f"GATE 1 after: {flags_after}")

        if leak_div_id:
            gate2 = conn.execute(gate2_sql(leak_div_id)).scalar()
            print(f"GATE 2 (links without division): {gate2}")

        if top_level_leak and int(top_level_leak) > 0:
            print("FAIL: Leak Investigations still top-level — run migrate_rm_project_divisions_2026.py", file=sys.stderr)
            sys.exit(1)
        if pm_top_level and int(pm_top_level) > 0:
            print("FAIL: Preventive Maintenance still top-level — run migrate_rm_project_divisions_2026.py", file=sys.stderr)
            sys.exit(1)
        if not leak_div_id:
            print("FAIL: Leak Investigations subdivision not found under Commercial Service", file=sys.stderr)
            sys.exit(1)
        if flags_after != 0:
            print("FAIL: GATE 1 not zero", file=sys.stderr)
            sys.exit(1)
        print("OK: leak division structure gates passed")


if __name__ == "__main__":
    main()
