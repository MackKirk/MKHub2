"""Apply subcontractor_attendance break_minutes + hr_status columns (idempotent)."""
import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from sqlalchemy import text

from app.db import engine


def main() -> None:
    sql_path = Path(__file__).resolve().parent / "add_subcontractor_attendance_break_hr.sql"
    raw = sql_path.read_text(encoding="utf-8")
    statements = []
    for line in raw.splitlines():
        s = line.strip()
        if not s or s.startswith("--"):
            continue
        statements.append(s)
    blob = " ".join(statements)
    parts = [p.strip() for p in blob.split(";") if p.strip()]
    with engine.begin() as conn:
        for stmt in parts:
            conn.execute(text(stmt))
    print("OK:", len(parts), "statement(s) executed")


if __name__ == "__main__":
    main()
