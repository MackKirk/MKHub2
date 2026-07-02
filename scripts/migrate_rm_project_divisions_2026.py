"""
R&M project divisions restructure (2026):
- Reparent Leak Investigations under Commercial Service (preserve UUID)
- Migrate Preventive Maintenance projects → Roof Repairs and Maintenance (Roof Assessments)
- Delete top-level Preventive Maintenance setting item
- Run seed_project_divisions to upsert new subdivision tree

Usage (from repo root):
  python scripts/migrate_rm_project_divisions_2026.py
"""
from __future__ import annotations

import importlib.util
import os
import sys

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, _ROOT)

try:
    from dotenv import load_dotenv

    load_dotenv()
except Exception:
    pass

from sqlalchemy.orm.attributes import flag_modified

from app.db import SessionLocal
from app.models.models import Project, SettingItem, SettingList

COMMERCIAL_SERVICE_LABEL = "Commercial Service"
ROOF_ASSESSMENTS_LABEL = "Roof Assessments"
LEAK_INVESTIGATIONS_LABEL = "Leak Investigations"
PREVENTIVE_MAINTENANCE_LABEL = "Preventive Maintenance"
ROOF_REPAIRS_AND_MAINTENANCE_LABEL = "Roof Repairs and Maintenance"


def _load_seed_module():
    path = os.path.join(os.path.dirname(__file__), "seed_project_divisions.py")
    spec = importlib.util.spec_from_file_location("seed_project_divisions_impl", path)
    if spec is None or spec.loader is None:
        raise ImportError(f"Cannot load {path}")
    mod = importlib.util.module_from_spec(spec)
    sys.modules["seed_project_divisions_impl"] = mod
    spec.loader.exec_module(mod)
    return mod


def _get_divisions_list(db) -> SettingList | None:
    return db.query(SettingList).filter(SettingList.name == "project_divisions").first()


def _find_top_level(db, divisions_list: SettingList, label: str) -> SettingItem | None:
    return (
        db.query(SettingItem)
        .filter(
            SettingItem.list_id == divisions_list.id,
            SettingItem.parent_id.is_(None),
            SettingItem.label == label,
        )
        .first()
    )


def _find_subdivision(db, divisions_list: SettingList, parent: SettingItem, label: str) -> SettingItem | None:
    return (
        db.query(SettingItem)
        .filter(
            SettingItem.list_id == divisions_list.id,
            SettingItem.parent_id == parent.id,
            SettingItem.label == label,
        )
        .first()
    )


def _replace_division_id_on_projects(db, old_id: str, new_id: str) -> int:
    if not old_id or not new_id or old_id == new_id:
        return 0
    updated = 0
    rows = db.query(Project).filter(Project.deleted_at.is_(None)).all()
    for project in rows:
        raw = getattr(project, "project_division_ids", None)
        if not isinstance(raw, list) or not raw:
            continue
        changed = False
        next_ids: list = []
        for item in raw:
            sid = str(item)
            if sid == old_id:
                if new_id not in next_ids:
                    next_ids.append(new_id)
                changed = True
            else:
                next_ids.append(item)
        if changed:
            project.project_division_ids = next_ids or None
            flag_modified(project, "project_division_ids")
            updated += 1
    return updated


def _dedupe_leak_subdivisions(db, divisions_list: SettingList, commercial_service: SettingItem) -> None:
    """Keep one Leak Investigations child under Commercial Service; merge project refs from duplicates."""
    children = (
        db.query(SettingItem)
        .filter(
            SettingItem.list_id == divisions_list.id,
            SettingItem.parent_id == commercial_service.id,
            SettingItem.label == LEAK_INVESTIGATIONS_LABEL,
        )
        .order_by(SettingItem.sort_index.asc(), SettingItem.id.asc())
        .all()
    )
    if len(children) <= 1:
        return
    keeper = children[0]
    for duplicate in children[1:]:
        merged = _replace_division_id_on_projects(db, str(duplicate.id), str(keeper.id))
        db.delete(duplicate)
        print(
            f"Merged duplicate Leak Investigations [{duplicate.id}] into [{keeper.id}] ({merged} project(s))"
        )


def migrate_rm_project_divisions_2026(*, do_commit: bool = True) -> dict:
    db = SessionLocal()
    stats = {
        "leak_reparented": False,
        "pm_projects_migrated": 0,
        "pm_division_deleted": False,
    }
    try:
        divisions_list = _get_divisions_list(db)
        if not divisions_list:
            print("No project_divisions list — run seed first.")
            return stats

        commercial_service = _find_top_level(db, divisions_list, COMMERCIAL_SERVICE_LABEL)
        roof_assessments = _find_top_level(db, divisions_list, ROOF_ASSESSMENTS_LABEL)
        if not commercial_service:
            raise RuntimeError(f"Missing top-level division: {COMMERCIAL_SERVICE_LABEL}")
        if not roof_assessments:
            raise RuntimeError(f"Missing top-level division: {ROOF_ASSESSMENTS_LABEL}")

        # Step A: reparent top-level Leak Investigations → Commercial Service child
        leak_top = _find_top_level(db, divisions_list, LEAK_INVESTIGATIONS_LABEL)
        leak_child = _find_subdivision(db, divisions_list, commercial_service, LEAK_INVESTIGATIONS_LABEL)
        if leak_top and not leak_child:
            leak_top.parent_id = commercial_service.id
            leak_top.sort_index = 0
            stats["leak_reparented"] = True
            print(f"Reparented Leak Investigations [{leak_top.id}] under Commercial Service")
        elif leak_child:
            print(f"Leak Investigations already a subdivision [{leak_child.id}]")
            if leak_top and str(leak_top.id) != str(leak_child.id):
                merged = _replace_division_id_on_projects(db, str(leak_top.id), str(leak_child.id))
                stats["leak_duplicate_projects_merged"] = merged
                db.delete(leak_top)
                print(f"Removed duplicate top-level Leak Investigations [{leak_top.id}], merged {merged} project(s)")
        elif not leak_top and not leak_child:
            print("Warning: Leak Investigations not found — seed will create it")

        db.flush()

        # Step B: seed new subdivisions (Roof Repairs and Maintenance, etc.)
        seed_mod = _load_seed_module()
        print("\n=== Running seed_project_divisions ===")
        seed_mod.seed_project_divisions()

        # Refresh session after seed (seed uses its own session + commit)
        db.expire_all()
        divisions_list = _get_divisions_list(db)
        commercial_service = _find_top_level(db, divisions_list, COMMERCIAL_SERVICE_LABEL)
        roof_assessments = _find_top_level(db, divisions_list, ROOF_ASSESSMENTS_LABEL)
        if not commercial_service or not roof_assessments:
            raise RuntimeError("Commercial Service or Roof Assessments missing after seed")

        leak_child = _find_subdivision(db, divisions_list, commercial_service, LEAK_INVESTIGATIONS_LABEL)
        if not leak_child:
            raise RuntimeError("Leak Investigations subdivision missing under Commercial Service after migration")

        _dedupe_leak_subdivisions(db, divisions_list, commercial_service)
        db.flush()

        # Step C: migrate Preventive Maintenance → Roof Repairs and Maintenance (Roof Assessments)
        pm_top = _find_top_level(db, divisions_list, PREVENTIVE_MAINTENANCE_LABEL)
        rrm_ra = _find_subdivision(db, divisions_list, roof_assessments, ROOF_REPAIRS_AND_MAINTENANCE_LABEL)
        if not rrm_ra:
            raise RuntimeError(
                f"{ROOF_REPAIRS_AND_MAINTENANCE_LABEL} missing under {ROOF_ASSESSMENTS_LABEL} after seed"
            )

        if pm_top:
            pm_id = str(pm_top.id)
            rrm_id = str(rrm_ra.id)
            migrated = _replace_division_id_on_projects(db, pm_id, rrm_id)
            stats["pm_projects_migrated"] = migrated
            print(f"Migrated {migrated} project(s) from Preventive Maintenance to Roof Repairs and Maintenance (Roof Assessments)")

            remaining = _projects_referencing_division(db, pm_id)
            if remaining:
                raise RuntimeError(
                    f"{remaining} project(s) still reference Preventive Maintenance [{pm_id}] — aborting delete"
                )
            db.delete(pm_top)
            stats["pm_division_deleted"] = True
            print(f"Deleted top-level Preventive Maintenance [{pm_id}]")
        else:
            print("Preventive Maintenance top-level division not found (already removed)")

        # Step D: safety checks
        leak_top_after = _find_top_level(db, divisions_list, LEAK_INVESTIGATIONS_LABEL)
        if leak_top_after:
            raise RuntimeError("Leak Investigations still exists as top-level division after migration")

        leak_children = (
            db.query(SettingItem)
            .filter(
                SettingItem.list_id == divisions_list.id,
                SettingItem.label == LEAK_INVESTIGATIONS_LABEL,
                SettingItem.parent_id.isnot(None),
            )
            .all()
        )
        if len(leak_children) != 1:
            raise RuntimeError(f"Expected exactly one Leak Investigations subdivision, found {len(leak_children)}")

        if do_commit:
            db.commit()
        print("\nR&M project divisions migration completed.", stats)
        return stats
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def _projects_referencing_division(db, division_id: str) -> int:
    count = 0
    for project in db.query(Project).filter(Project.deleted_at.is_(None)).all():
        raw = getattr(project, "project_division_ids", None) or []
        if not isinstance(raw, list):
            continue
        if division_id in {str(x) for x in raw if x}:
            count += 1
    return count


def main():
    migrate_rm_project_divisions_2026(do_commit=True)


if __name__ == "__main__":
    main()
