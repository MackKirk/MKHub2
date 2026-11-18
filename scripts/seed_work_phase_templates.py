"""
Seed job-progress phase templates (NOT system Tasks).

  python scripts/seed_work_phase_templates.py
  python scripts/seed_work_phase_templates.py --update
"""
from __future__ import annotations

import argparse
import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    from dotenv import load_dotenv

    load_dotenv()
except Exception:
    pass

from sqlalchemy import text

from app.db import SessionLocal, engine
from app.models.models import Base, WorkPhaseTemplate
from app.services.business_line import BUSINESS_LINE_CONSTRUCTION
from app.services.work_phases import normalize_template_phases


def ensure_schema() -> None:
    """Create work_phase_templates + project columns if missing (dev / pre-migrate)."""
    Base.metadata.create_all(bind=engine, tables=[WorkPhaseTemplate.__table__])
    with engine.begin() as conn:
        cols = {
            r[0]
            for r in conn.execute(
                text(
                    "SELECT column_name FROM information_schema.columns "
                    "WHERE table_name = 'projects'"
                )
            )
        }
        if "work_phases" not in cols:
            conn.execute(text("ALTER TABLE projects ADD COLUMN work_phases JSON NULL"))
        if "work_phase_template_id" not in cols:
            conn.execute(
                text(
                    "ALTER TABLE projects ADD COLUMN work_phase_template_id "
                    "UUID NULL REFERENCES work_phase_templates(id) ON DELETE SET NULL"
                )
            )

TEMPLATES = [
    {
        "name": "Production — Roofing job",
        "description": "Broad Production phases for roofing / exterior jobs. Apply on a project to build the progress map.",
        "business_line": BUSINESS_LINE_CONSTRUCTION,
        "sort_index": 10,
        "phases": [
            {"key": "prepare_foundation", "label": "Prepare foundation"},
            {"key": "replace_structure", "label": "Replace structure"},
            {"key": "add_roofing", "label": "Add roofing / tiles"},
            {"key": "flashings_edges", "label": "Flashings & edges"},
            {"key": "cleanup", "label": "Cleanup & debris removal"},
            {"key": "polishing", "label": "Polishing / finishing"},
        ],
    },
    {
        "name": "Production — General construction",
        "description": "Generic Production progress map for multi-trade jobs.",
        "business_line": BUSINESS_LINE_CONSTRUCTION,
        "sort_index": 20,
        "phases": [
            {"key": "mobilization", "label": "Mobilization & site setup"},
            {"key": "demo_prep", "label": "Demo / preparation"},
            {"key": "structure", "label": "Structure / framing"},
            {"key": "envelope", "label": "Envelope / weatherproofing"},
            {"key": "finishes", "label": "Finishes"},
            {"key": "punch_list", "label": "Punch list & close-out"},
        ],
    },
]


def upsert(*, update: bool) -> None:
    ensure_schema()
    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        for spec in TEMPLATES:
            name = spec["name"]
            phases = normalize_template_phases(spec["phases"])
            existing = db.query(WorkPhaseTemplate).filter(WorkPhaseTemplate.name == name).first()
            if existing and not update:
                print(f"SKIP  {name} (id={existing.id})")
                continue
            if existing and update:
                existing.description = spec["description"]
                existing.business_line = spec["business_line"]
                existing.phases = phases
                existing.is_active = True
                existing.sort_index = spec["sort_index"]
                existing.updated_at = now
                db.add(existing)
                db.commit()
                db.refresh(existing)
                print(f"UPDATE {name} (id={existing.id}, phases={len(phases)})")
                continue
            row = WorkPhaseTemplate(
                name=name,
                description=spec["description"],
                business_line=spec["business_line"],
                phases=phases,
                is_active=True,
                sort_index=spec["sort_index"],
                updated_at=now,
            )
            db.add(row)
            db.commit()
            db.refresh(row)
            print(f"CREATE {name} (id={row.id}, phases={len(phases)})")
    finally:
        db.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed work phase templates")
    parser.add_argument("--update", action="store_true")
    args = parser.parse_args()
    upsert(update=args.update)


if __name__ == "__main__":
    main()
