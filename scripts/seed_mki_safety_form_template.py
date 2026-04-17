"""
Optional seed: form template with an MKI-aligned safety definition (subset).
Skips if a template named 'MKI Safety Inspection (seed)' already exists.

Run from repo root with PYTHONPATH set (same pattern as other scripts):
  python scripts/seed_mki_safety_form_template.py
"""
from __future__ import annotations

import os
import sys
import uuid

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    from dotenv import load_dotenv

    load_dotenv()
except Exception:
    pass

try:
    from app.db import SessionLocal
    from app.models.models import FormTemplate, User
except ImportError as e:
    print(f"ERROR: {e}")
    sys.exit(1)

SEED_NAME = "MKI Safety Inspection (seed)"


def mki_definition() -> dict:
    """Compact MKI-style definition (valid for ALLOWED_FIELD_TYPES + structure checks)."""
    s1 = str(uuid.uuid4())
    s2 = str(uuid.uuid4())
    return {
        "sections": [
            {
                "id": s1,
                "title": "1. General information",
                "order": 0,
                "fields": [
                    {
                        "id": str(uuid.uuid4()),
                        "key": "project_name",
                        "type": "short_text",
                        "label": "Project name",
                        "order": 0,
                        "required": False,
                    },
                    {
                        "id": str(uuid.uuid4()),
                        "key": "project_location",
                        "type": "short_text",
                        "label": "Project location",
                        "order": 1,
                        "required": False,
                    },
                    {
                        "id": str(uuid.uuid4()),
                        "key": "inspection_type",
                        "type": "short_text",
                        "label": "Type of inspection",
                        "order": 2,
                        "required": False,
                        "placeholder": "e.g. Daily",
                    },
                ],
            },
            {
                "id": s2,
                "title": "2. Hazard verification (sample)",
                "order": 1,
                "fields": [
                    {
                        "id": str(uuid.uuid4()),
                        "key": "hv_working_at_heights",
                        "type": "pass_fail_na",
                        "label": "Working at heights",
                        "order": 0,
                        "required": False,
                    },
                    {
                        "id": str(uuid.uuid4()),
                        "key": "hv_hot_work",
                        "type": "pass_fail_na",
                        "label": "Hot work",
                        "order": 1,
                        "required": False,
                    },
                    {
                        "id": str(uuid.uuid4()),
                        "key": "totals",
                        "type": "pass_fail_total",
                        "label": "Pass / Fail / NA totals",
                        "order": 2,
                        "required": False,
                        "settings": {"mode": "aggregate"},
                    },
                ],
            },
        ],
        "signature_policy": {"worker": {"required": True, "mode": "any"}},
    }


def seed() -> None:
    db = SessionLocal()
    try:
        existing = db.query(FormTemplate).filter(FormTemplate.name == SEED_NAME).first()
        if existing:
            print(f"Template '{SEED_NAME}' already exists (id={existing.id}), skipping.")
            return

        user = db.query(User).order_by(User.id.asc()).first()
        uid = user.id if user else None

        t = FormTemplate(
            name=SEED_NAME,
            description="Seeded subset aligned with legacy MKI safety topics; extend in Form Templates editor.",
            category="inspection",
            status="active",
            definition=mki_definition(),
            version_label="seed",
            created_by=uid,
        )
        db.add(t)
        db.commit()
        db.refresh(t)
        print(f"Created template '{SEED_NAME}' (id={t.id}).")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
