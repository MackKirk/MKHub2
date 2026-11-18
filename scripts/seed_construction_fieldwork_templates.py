"""
Seed Production (Construction) Fieldwork form templates:

  1. Site Assessment — Production Job Walk  (category=site_assessment)
  2. Work Report — Production Progress      (category=work_report)

Scoped via fieldwork_settings.business_lines = ["construction"] so they do not
appear on R&M projects (and R&M roofing templates stay R&M-only).

Idempotent by name: skips (or --update refreshes definition) if already present.

Run from repo root:
  python scripts/seed_construction_fieldwork_templates.py
  python scripts/seed_construction_fieldwork_templates.py --update
"""
from __future__ import annotations

import argparse
import os
import sys
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    from dotenv import load_dotenv

    load_dotenv()
except Exception:
    pass

from app.db import SessionLocal
from app.models.models import FormTemplate, User

SITE_NAME = "Site Assessment — Production Job Walk"
WORK_NAME = "Work Report — Production Progress"


def _fid() -> str:
    return str(uuid.uuid4())


def _field(
    *,
    key: str,
    type_: str,
    label: str,
    order: int,
    required: bool = False,
    require_comment: bool = False,
    require_image: bool = False,
    placeholder: Optional[str] = None,
    options: Optional[list[str]] = None,
    settings: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    out: dict[str, Any] = {
        "id": _fid(),
        "key": key,
        "type": type_,
        "label": label,
        "order": order,
        "required": required,
        "requireComment": require_comment,
        "requireImage": require_image,
    }
    if placeholder:
        out["placeholder"] = placeholder
    if options is not None:
        out["options"] = options
    if settings is not None:
        out["settings"] = settings
    return out


def _section(title: str, order: int, fields: list[dict[str, Any]]) -> dict[str, Any]:
    return {"id": _fid(), "title": title, "order": order, "fields": fields}


def site_assessment_definition() -> dict[str, Any]:
    """Production job walk for quoting (Opportunity → Proposal Photos)."""
    visit = _section(
        "Visit",
        0,
        [
            _field(key="prod_sa_visit_date", type_="date", label="Visit date", order=0, required=True),
            _field(
                key="prod_sa_visited_by",
                type_="short_text",
                label="Visited by",
                order=1,
                required=False,
                placeholder="Name / crew",
            ),
            _field(
                key="prod_sa_weather",
                type_="dropdown_single",
                label="Weather",
                order=2,
                required=False,
                options=["Clear", "Overcast", "Rain", "Snow", "Wind"],
            ),
            _field(
                key="prod_sa_access",
                type_="short_text",
                label="Site access",
                order=3,
                placeholder="Gate code, staging area, crane path, etc.",
            ),
        ],
    )
    scope = _section(
        "Scope & conditions",
        1,
        [
            _field(
                key="prod_sa_building_type",
                type_="dropdown_single",
                label="Building / structure type",
                order=0,
                required=False,
                options=["Commercial", "Industrial", "Multi-family", "Institutional", "Other"],
            ),
            _field(
                key="prod_sa_existing_conditions",
                type_="pass_fail_na",
                label="Existing conditions acceptable for proposed work",
                order=1,
                required=True,
                require_comment=True,
                require_image=True,
            ),
            _field(
                key="prod_sa_substrate_ready",
                type_="pass_fail_na",
                label="Substrate / deck ready",
                order=2,
                required=True,
                require_comment=True,
                require_image=True,
            ),
            _field(
                key="prod_sa_safety_hazards",
                type_="pass_fail_na",
                label="Safety hazards identified / mitigated",
                order=3,
                required=True,
                require_comment=True,
            ),
            _field(
                key="prod_sa_utilities_clear",
                type_="pass_fail_na",
                label="Utilities / penetrations clear for scope",
                order=4,
                required=False,
                require_comment=True,
            ),
        ],
    )
    measurements = _section(
        "Measurements & notes",
        2,
        [
            _field(
                key="prod_sa_approx_area",
                type_="short_text",
                label="Approx. area / quantity",
                order=0,
                placeholder="e.g. 12,400 SF, 18 squares",
            ),
            _field(
                key="prod_sa_pitch_height",
                type_="short_text",
                label="Pitch / height / exposure",
                order=1,
                placeholder="Pitch, stories, edge conditions",
            ),
            _field(
                key="prod_sa_materials_observed",
                type_="long_text",
                label="Existing materials observed",
                order=2,
                placeholder="Membrane, metal, insulation, flashings…",
            ),
            _field(
                key="prod_sa_quote_summary",
                type_="long_text",
                label="Quote-ready summary",
                order=3,
                required=False,
                placeholder="Summary for estimating / Document Creator. Use per-item comments and photos for detail.",
            ),
        ],
    )
    return {
        "sections": [visit, scope, measurements],
        "signature_policy": {"worker": {"required": False, "mode": "drawn"}},
        "fieldwork_settings": {
            "require_final_comments": False,
            "require_min_photos": 0,
            "default_pictures_folder": "Proposal Photos",
            "business_lines": ["construction"],
        },
    }


def work_report_definition() -> dict[str, Any]:
    """Production progress / completion evidence (Project → Invoice Photos)."""
    job = _section(
        "Job",
        0,
        [
            _field(key="prod_wr_work_date", type_="date", label="Work date", order=0, required=True),
            _field(
                key="prod_wr_crew_size",
                type_="number",
                label="Crew size",
                order=1,
                required=False,
                placeholder="Number of workers",
            ),
            _field(
                key="prod_wr_hours",
                type_="number",
                label="Hours on site",
                order=2,
                required=False,
            ),
            _field(
                key="prod_wr_phase",
                type_="dropdown_single",
                label="Phase",
                order=3,
                required=False,
                options=["Mobilization", "In progress", "Punch list", "Complete"],
            ),
        ],
    )
    progress = _section(
        "Progress checklist",
        1,
        [
            _field(
                key="prod_wr_scope_as_planned",
                type_="pass_fail_na",
                label="Work matches approved scope",
                order=0,
                required=True,
                require_comment=True,
            ),
            _field(
                key="prod_wr_quality_ok",
                type_="pass_fail_na",
                label="Quality / finish acceptable",
                order=1,
                required=True,
                require_comment=True,
                require_image=True,
            ),
            _field(
                key="prod_wr_cleanup_done",
                type_="pass_fail_na",
                label="Site cleaned / debris removed",
                order=2,
                required=True,
                require_comment=True,
            ),
            _field(
                key="prod_wr_safety_ok",
                type_="pass_fail_na",
                label="Safety compliance on site",
                order=3,
                required=True,
                require_comment=True,
            ),
        ],
    )
    closeout = _section(
        "Close-out",
        2,
        [
            _field(
                key="prod_wr_materials_used",
                type_="long_text",
                label="Materials used / waste",
                order=0,
                required=False,
            ),
            _field(
                key="prod_wr_follow_up",
                type_="long_text",
                label="Follow-up / punch items",
                order=1,
                required=False,
                placeholder="Anything the office or next crew should know.",
            ),
            _field(
                key="prod_wr_closeout_notes",
                type_="long_text",
                label="Close-out notes",
                order=2,
                required=False,
            ),
        ],
    )
    return {
        "sections": [job, progress, closeout],
        "signature_policy": {"worker": {"required": False, "mode": "drawn"}},
        "fieldwork_settings": {
            "require_final_comments": True,
            "require_min_photos": 0,
            "default_pictures_folder": "Invoice Photos",
            "business_lines": ["construction"],
        },
    }


TEMPLATES = [
    {
        "name": SITE_NAME,
        "description": (
            "Production job walk for quoting. Fail items require comment/photo. "
            "Default folder: Proposal Photos. Construction line only."
        ),
        "category": "site_assessment",
        "version_label": "v1",
        "definition": site_assessment_definition,
    },
    {
        "name": WORK_NAME,
        "description": (
            "Production progress / completion evidence for billing. "
            "Default folder: Invoice Photos. Construction line only."
        ),
        "category": "work_report",
        "version_label": "v1",
        "definition": work_report_definition,
    },
]


def upsert(db, *, update: bool) -> None:
    user = db.query(User).order_by(User.id.asc()).first()
    uid = user.id if user else None
    now = datetime.now(timezone.utc)

    for spec in TEMPLATES:
        name = spec["name"]
        existing = (
            db.query(FormTemplate)
            .filter(FormTemplate.name == name, FormTemplate.category == spec["category"])
            .first()
        )
        definition = spec["definition"]()
        if existing and not update:
            print(f"SKIP  {name} (id={existing.id}) — already exists. Pass --update to refresh.")
            continue
        if existing and update:
            existing.description = spec["description"]
            existing.status = "active"
            existing.definition = definition
            existing.version_label = spec["version_label"]
            existing.definition_version = int(existing.definition_version or 1) + 1
            existing.updated_at = now
            db.add(existing)
            db.commit()
            db.refresh(existing)
            print(f"UPDATE {name} (id={existing.id}, rev={existing.definition_version})")
            continue

        t = FormTemplate(
            name=name,
            description=spec["description"],
            category=spec["category"],
            status="active",
            definition=definition,
            version_label=spec["version_label"],
            definition_version=1,
            created_by=uid,
            updated_at=now,
        )
        db.add(t)
        db.commit()
        db.refresh(t)
        print(f"CREATE {name} (id={t.id})")


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed Production Fieldwork templates")
    parser.add_argument(
        "--update",
        action="store_true",
        help="Refresh definition if a template with the same name already exists",
    )
    args = parser.parse_args()
    db = SessionLocal()
    try:
        upsert(db, update=args.update)
    finally:
        db.close()


if __name__ == "__main__":
    main()
