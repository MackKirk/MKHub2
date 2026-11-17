"""
Seed two R&M Fieldwork form templates for roofing:

  1. Site Assessment — Roof Inspection  (category=site_assessment)
  2. Work Report — Roof Service Visit   (category=work_report)

Idempotent by name: skips (or --update refreshes definition) if already present.

Run from repo root:
  python scripts/seed_rm_roofing_fieldwork_templates.py
  python scripts/seed_rm_roofing_fieldwork_templates.py --update
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

SITE_NAME = "Site Assessment — Roof Inspection"
WORK_NAME = "Work Report — Roof Service Visit"


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
    """Roof inspection for quoting (Opportunity → Proposal Photos)."""
    visit = _section(
        "Visit",
        0,
        [
            _field(key="sa_visit_date", type_="date", label="Visit date", order=0, required=True),
            _field(
                key="sa_weather",
                type_="dropdown_single",
                label="Weather",
                order=1,
                required=False,
                options=["Clear", "Overcast", "Rain", "Snow", "Wind"],
            ),
            _field(
                key="sa_access_notes",
                type_="short_text",
                label="Access notes",
                order=2,
                placeholder="Ladder location, lockbox, roof hatch, etc.",
            ),
        ],
    )
    roof = _section(
        "Roof system",
        1,
        [
            _field(
                key="sa_roof_type",
                type_="dropdown_single",
                label="Primary roof type",
                order=0,
                required=True,
                options=[
                    "Asphalt Shingles",
                    "SBS",
                    "Vinyl Decking",
                    "Mixed",
                    "Other",
                ],
            ),
            _field(
                key="sa_areas_inspected",
                type_="short_text",
                label="Approx. areas inspected",
                order=1,
                required=True,
                placeholder="e.g. Main roof, lower west wing, canopy",
            ),
        ],
    )
    # Pass = OK; Fail = issue found (add comment + photo via field icons); N/A = not applicable.
    checklist_items = [
        ("sa_ck_membrane", "Membrane / shingles condition"),
        ("sa_ck_flashings", "Flashings"),
        ("sa_ck_drains_gutters", "Drains / gutters"),
        ("sa_ck_penetrations", "Penetrations (stacks / vents)"),
        ("sa_ck_safety", "Safety anchors / rooftop safety"),
        ("sa_ck_debris", "Debris / organic growth"),
        ("sa_ck_ponding", "Ponding water"),
    ]
    checklist_fields = [
        _field(
            key=key,
            type_="pass_fail_na",
            label=label,
            order=i,
            required=True,
            # Comment/image enforced only when answer is Fail (client validators).
            require_comment=True,
            require_image=True,
        )
        for i, (key, label) in enumerate(checklist_items)
    ]
    # Optional roll-up for supervisors scanning the report.
    checklist_fields.append(
        _field(
            key="sa_ck_totals",
            type_="pass_fail_total",
            label="Condition totals",
            order=len(checklist_items),
            required=False,
            settings={"mode": "aggregate"},
        )
    )
    checklist = _section("Condition checklist", 2, checklist_fields)
    observations = _section(
        "Observations",
        3,
        [
            _field(
                key="sa_overall_notes",
                type_="long_text",
                label="Overall inspection notes",
                order=0,
                required=False,
                placeholder="Summary for quoting. Use per-item comments and photos for phrase library text.",
            ),
        ],
    )
    return {
        "sections": [visit, roof, checklist, observations],
        "signature_policy": {"worker": {"required": False, "mode": "drawn"}},
        "fieldwork_settings": {
            "require_final_comments": False,
            "require_min_photos": 0,
            "default_pictures_folder": "Proposal Photos",
        },
    }


def work_report_definition() -> dict[str, Any]:
    """Service visit evidence (Project → Invoice Photos)."""
    job = _section(
        "Job",
        0,
        [
            _field(key="wr_job_date", type_="date", label="Work date", order=0, required=True),
            _field(
                key="wr_crew_size",
                type_="number",
                label="Crew size",
                order=1,
                required=False,
                placeholder="Number of workers",
            ),
            _field(
                key="wr_areas_worked",
                type_="short_text",
                label="Areas worked",
                order=2,
                required=True,
                placeholder="e.g. North slope, gutter line, drain #2",
            ),
        ],
    )
    scope_items = [
        ("wr_scope_debris", "Debris removal"),
        ("wr_scope_repairs", "Repairs (membrane / shingles)"),
        ("wr_scope_flashings", "Flashings"),
        ("wr_scope_drains", "Drains / gutters"),
        ("wr_scope_penetrations", "Penetrations"),
        ("wr_scope_safety", "Safety items"),
        ("wr_scope_other", "Other work"),
    ]
    scope_fields = [
        _field(
            key=key,
            type_="yes_no_na",
            label=label,
            order=i,
            required=True,
            require_comment=False,
            require_image=False,
        )
        for i, (key, label) in enumerate(scope_items)
    ]
    scope = _section("Scope completed", 1, scope_fields)
    materials = _section(
        "Materials / notes",
        2,
        [
            _field(
                key="wr_materials",
                type_="long_text",
                label="Materials used",
                order=0,
                placeholder="Membrane, mastic, fasteners, etc.",
            ),
            _field(
                key="wr_follow_up",
                type_="yes_no_na",
                label="Follow-up / leftover work needed",
                order=1,
                required=True,
                require_comment=True,
            ),
        ],
    )
    closeout = _section(
        "Close-out",
        3,
        [
            _field(
                key="wr_closeout_notes",
                type_="long_text",
                label="Close-out notes",
                order=0,
                required=False,
                placeholder="Anything the office should know. Additional Comments on submit still apply for Work Reports.",
            ),
        ],
    )
    return {
        "sections": [job, scope, materials, closeout],
        "signature_policy": {"worker": {"required": False, "mode": "drawn"}},
        "fieldwork_settings": {
            "require_final_comments": True,
            "require_min_photos": 0,
            "default_pictures_folder": "Invoice Photos",
        },
    }


TEMPLATES = [
    {
        "name": SITE_NAME,
        "description": (
            "Roof inspection for quoting. Use Observed Conditions phrases on item comments/photos. "
            "Default folder: Proposal Photos."
        ),
        "category": "site_assessment",
        "version_label": "v1",
        "definition": site_assessment_definition,
    },
    {
        "name": WORK_NAME,
        "description": (
            "Roof service visit evidence for billing. Work Performed phrases can be used when that catalog is filled. "
            "Default folder: Invoice Photos."
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
    parser = argparse.ArgumentParser(description="Seed R&M roofing Fieldwork templates")
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
