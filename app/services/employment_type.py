"""Map free-text employment types onto the profile select options."""
from __future__ import annotations

from typing import Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

# Must match the Employment Type options in the employee profile.
EMPLOYMENT_TYPE_OPTIONS = ("Full-time", "Hourly", "Part-time", "Salary")

_ALIASES = {
    "salary": "Salary",
    "salaried": "Salary",
    "hourly": "Hourly",
    "hour": "Hourly",
    "hours": "Hourly",
    "full-time": "Full-time",
    "full time": "Full-time",
    "fulltime": "Full-time",
    "part-time": "Part-time",
    "part time": "Part-time",
    "parttime": "Part-time",
}


def _alias_key(raw: str) -> str:
    return " ".join(raw.strip().lower().replace("_", " ").replace("/", " ").split())


def canonical_employment_type(raw: Optional[str]) -> Optional[str]:
    """Return the select option for a known label, or None when it does not match."""
    text_value = str(raw or "").strip()
    if not text_value:
        return None
    if text_value in EMPLOYMENT_TYPE_OPTIONS:
        return text_value
    key = _alias_key(text_value)
    return _ALIASES.get(key) or _ALIASES.get(key.replace(" ", "-"))


def employment_type_for_storage(raw: Optional[str]) -> Optional[str]:
    """Store the option value when we recognize it. Keep unknown text as written."""
    text_value = str(raw or "").strip()
    if not text_value:
        return None
    return canonical_employment_type(text_value) or text_value


def backfill_employment_type_aliases(db: Session) -> int:
    """Rewrite legacy lowercase labels so they match the select options."""
    updated = 0
    for table, id_col in (("employee_profiles", "user_id"), ("invites", "id")):
        rows = db.execute(
            text(
                f"SELECT {id_col} AS row_id, employment_type FROM {table} "
                "WHERE employment_type IS NOT NULL AND btrim(employment_type) <> ''"
            )
        ).fetchall()
        for row in rows:
            raw = row.employment_type
            stored = employment_type_for_storage(raw)
            if stored and stored != raw:
                db.execute(
                    text(f"UPDATE {table} SET employment_type = :val WHERE {id_col} = :row_id"),
                    {"val": stored, "row_id": row.row_id},
                )
                updated += 1
    return updated
