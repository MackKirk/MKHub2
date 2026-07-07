"""
Fix employee-review form template field types using a legacy employee_answers.json export.

Matches template fields to legacy rows by question label (with fuzzy yes/no fallback),
then sets field types to scale_1_5 / yes_no_na / long_text as in the legacy export.

Usage (repo root, PYTHONPATH / .env like other scripts):
  python scripts/fix_employee_review_template_types_from_legacy.py --list
  python scripts/fix_employee_review_template_types_from_legacy.py \\
    --legacy-json "%USERPROFILE%\\Desktop\\employee_answers.json" \\
    --template-name "Your Template Name" \\
    --dry-run
  python scripts/fix_employee_review_template_types_from_legacy.py \\
    --legacy-json path/to/answers.json --template-id UUID --apply
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO))

try:
    from dotenv import load_dotenv

    load_dotenv()
except Exception:
    pass

try:
    from app.db import SessionLocal
    from app.models.models import FormTemplate
    from app.routes.form_templates import _normalize_definition, EMPLOYEE_REVIEW_CATEGORY
    from app.services.legacy_review_import import detect_definition_type_fixes, patch_definition_field_types
except ImportError as e:
    print(f"ERROR: {e}", file=sys.stderr)
    sys.exit(1)

DEFAULT_LEGACY = Path.home() / "Desktop" / "employee_answers.json"


def _load_legacy(path: Path) -> list[dict]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(raw, list):
        raise SystemExit("legacy JSON must be an array")
    return raw


def _resolve_template(db, template_id: str | None, template_name: str | None) -> FormTemplate:
    q = db.query(FormTemplate).filter(FormTemplate.category == EMPLOYEE_REVIEW_CATEGORY)
    if template_id:
        t = q.filter(FormTemplate.id == template_id).first()
        if not t:
            raise SystemExit(f"No employee_review template with id {template_id}")
        return t
    if template_name:
        t = q.filter(FormTemplate.name == template_name).first()
        if not t:
            raise SystemExit(f"No employee_review template named {template_name!r}")
        return t
    raise SystemExit("Pass --template-id or --template-name")


def main() -> None:
    p = argparse.ArgumentParser(description="Fix employee review template field types from legacy JSON")
    p.add_argument("--legacy-json", type=Path, default=DEFAULT_LEGACY, help="Path to employee_answers.json")
    p.add_argument("--template-id", help="Form template UUID")
    p.add_argument("--template-name", help="Form template name (employee_review category)")
    p.add_argument("--list", action="store_true", help="List employee_review templates and exit")
    p.add_argument("--dry-run", action="store_true", help="Show changes only (default if --apply omitted)")
    p.add_argument("--apply", action="store_true", help="Write patched definition to database")
    args = p.parse_args()

    db = SessionLocal()
    try:
        if args.list:
            rows = (
                db.query(FormTemplate)
                .filter(FormTemplate.category == EMPLOYEE_REVIEW_CATEGORY)
                .order_by(FormTemplate.name.asc())
                .all()
            )
            if not rows:
                print("No employee_review templates found.")
                return
            for t in rows:
                vl = (t.version_label or "").strip()
                extra = f" — {vl}" if vl else ""
                print(f"{t.id}  {t.name}{extra}  [{t.status}]")
            return

        if not args.legacy_json.is_file():
            raise SystemExit(f"Legacy JSON not found: {args.legacy_json}")

        legacy_items = _load_legacy(args.legacy_json)
        tpl = _resolve_template(db, args.template_id, args.template_name)
        definition = _normalize_definition(tpl.definition if isinstance(tpl.definition, dict) else {})
        patches, notes = detect_definition_type_fixes(definition, legacy_items)

        print(f"Template: {tpl.name} ({tpl.id})")
        print(f"Legacy rows: {len(legacy_items)}")
        if not patches:
            print("No field type fixes needed.")
            return

        print(f"\n{len(patches)} field(s) to update:")
        for line in notes:
            print(f"  • {line}")

        if not args.apply:
            print("\nDry run — pass --apply to save.")
            return

        tpl.definition = patch_definition_field_types(definition, patches)
        tpl.updated_at = datetime.now(timezone.utc)
        db.commit()
        print(f"\nSaved {len(patches)} type fix(es) to template {tpl.name!r}.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
