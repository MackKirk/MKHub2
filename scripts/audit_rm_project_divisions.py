"""
Read-only audit of R&M project division usage on opportunities and projects.

Usage (from repo root):
  python scripts/audit_rm_project_divisions.py
  python scripts/audit_rm_project_divisions.py --json out/rm_division_audit.json
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from collections import defaultdict
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_ROOT))

try:
    from dotenv import load_dotenv

    load_dotenv(_ROOT / ".env")
except Exception:
    pass

from app.db import SessionLocal
from app.models.models import Project, SettingItem, SettingList
from app.services.business_line import BUSINESS_LINE_REPAIRS_MAINTENANCE

# Labels that need migration attention (confirmed mapping targets in migrate v2)
LEGACY_LABELS = {
    "Commercial Service",
    "Repairs & Maintenance",
    "Bi-Annual Spring Roof Maintenance",
    "Bi-Annual Fall Roof Maintenance",
    "Spring Roof Maintenance",
    "Fall Roof Maintenance",
    "Roof Repairs and Maintenance",
    "Roof Inspection",
    "Preventive Maintenance",
}

# Exact subdivision label "Roof Maintenance" (old) — not the new parent of the same name
LEGACY_EXACT_SUBDIVISION_LABELS = {"Roof Maintenance"}


def _needs_migration(display: str) -> bool:
    # "Roof Maintenance / ..." is the new parent — only flag exact old subdivision leftover
    if display.endswith(" / Roof Maintenance") or display == "Roof Maintenance (parent-only)":
        return True
    if display.startswith("Roof Maintenance /"):
        return False
    return any(leg in display for leg in LEGACY_LABELS)


def _load_division_index(db) -> dict[str, dict]:
    """Map setting_item id -> {label, parent_label, is_top_level}."""
    divisions_list = db.query(SettingList).filter(SettingList.name == "project_divisions").first()
    if not divisions_list:
        return {}
    items = db.query(SettingItem).filter(SettingItem.list_id == divisions_list.id).all()
    by_id = {str(i.id): i for i in items}
    out: dict[str, dict] = {}
    for item in items:
        parent_label = None
        if item.parent_id is not None:
            parent = by_id.get(str(item.parent_id))
            parent_label = parent.label if parent else None
        out[str(item.id)] = {
            "id": str(item.id),
            "label": item.label,
            "parent_label": parent_label,
            "is_top_level": item.parent_id is None,
        }
    return out


def audit(*, json_path: str | None = None) -> dict:
    db = SessionLocal()
    try:
        index = _load_division_index(db)
        by_label: dict[str, dict] = defaultdict(
            lambda: {
                "opportunities": 0,
                "projects": 0,
                "sample_codes": [],
                "ids": set(),
                "parent_labels": set(),
            }
        )

        q = db.query(Project).filter(
            Project.deleted_at.is_(None),
            Project.business_line == BUSINESS_LINE_REPAIRS_MAINTENANCE,
        )
        for project in q.all():
            raw = getattr(project, "project_division_ids", None) or []
            if not isinstance(raw, list) or not raw:
                key = "(no project_division_ids)"
                bucket = by_label[key]
                if project.is_bidding:
                    bucket["opportunities"] += 1
                else:
                    bucket["projects"] += 1
                if len(bucket["sample_codes"]) < 10:
                    bucket["sample_codes"].append(project.code or str(project.id))
                continue

            for did in raw:
                sid = str(did) if did is not None else ""
                meta = index.get(sid)
                if meta:
                    label = meta["label"]
                    if meta["parent_label"]:
                        display = f"{meta['parent_label']} / {label}"
                    else:
                        display = f"{label} (parent-only)"
                    bucket = by_label[display]
                    bucket["ids"].add(sid)
                    if meta["parent_label"]:
                        bucket["parent_labels"].add(meta["parent_label"])
                    elif meta["is_top_level"]:
                        bucket["parent_labels"].add("(top-level)")
                else:
                    display = f"(unknown id {sid})"
                    bucket = by_label[display]

                if project.is_bidding:
                    bucket["opportunities"] += 1
                else:
                    bucket["projects"] += 1
                if len(bucket["sample_codes"]) < 10:
                    code = project.code or str(project.id)
                    if code not in bucket["sample_codes"]:
                        bucket["sample_codes"].append(code)

        rows = []
        for display, bucket in sorted(by_label.items(), key=lambda x: x[0].casefold()):
            rows.append(
                {
                    "division": display,
                    "opportunities": bucket["opportunities"],
                    "projects": bucket["projects"],
                    "total": bucket["opportunities"] + bucket["projects"],
                    "setting_item_ids": sorted(bucket["ids"]),
                    "sample_codes": bucket["sample_codes"],
                    "needs_migration": _needs_migration(display),
                }
            )

        report = {
            "rm_project_count": sum(1 for r in rows for _ in range(r["total"])),
            "unique_division_keys": len(rows),
            "rows": rows,
            "legacy_rows": [r for r in rows if r["needs_migration"]],
        }

        print("=== R&M project_division usage audit ===\n")
        print(f"{'Division':<55} {'Opp':>6} {'Proj':>6} {'Total':>6} Mig?")
        print("-" * 80)
        for r in rows:
            flag = "YES" if r["needs_migration"] else ""
            print(
                f"{r['division']:<55} {r['opportunities']:>6} {r['projects']:>6} {r['total']:>6} {flag}"
            )
        print("-" * 80)
        print(f"Legacy / mapped labels needing attention: {len(report['legacy_rows'])}")

        if json_path:
            Path(json_path).parent.mkdir(parents=True, exist_ok=True)
            serializable = {
                **report,
                "rows": [
                    {**r, "setting_item_ids": r["setting_item_ids"]}
                    for r in report["rows"]
                ],
            }
            with open(json_path, "w", encoding="utf-8") as f:
                json.dump(serializable, f, indent=2)
            print(f"\nWrote {json_path}")

        return report
    finally:
        db.close()


def main():
    parser = argparse.ArgumentParser(description="Audit R&M division usage (read-only)")
    parser.add_argument("--json", dest="json_path", default=None, help="Write report JSON path")
    args = parser.parse_args()
    if not os.getenv("DATABASE_URL"):
        print("No DATABASE_URL — set .env or environment", file=sys.stderr)
        sys.exit(1)
    audit(json_path=args.json_path)


if __name__ == "__main__":
    main()
