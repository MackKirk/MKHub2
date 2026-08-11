"""
R&M project divisions restructure v2 (2026):
- Replace Commercial Service tree with Roof Maintenance + Roof Repairs
- Exclusive subdivisions under 4 parents
- Rename/merge legacy labels; reparent Leak Investigations -> Roof Assessments
- Never deletes Project rows - only remaps project_division_ids and related JSON refs

Usage (from repo root):
  python scripts/migrate_rm_project_divisions_2026_v2.py --dry-run
  python scripts/migrate_rm_project_divisions_2026_v2.py
"""
from __future__ import annotations

import argparse
import importlib.util
import os
import sys
from typing import Optional

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, _ROOT)

try:
    from dotenv import load_dotenv

    load_dotenv()
except Exception:
    pass

from sqlalchemy.orm.attributes import flag_modified

from app.db import SessionLocal
from app.models.models import EmployeeProfile, Project, Proposal, ProposalDraft, Quote, SettingItem, SettingList

# New parents
ROOF_MAINTENANCE = "Roof Maintenance"
ROOF_REPAIRS = "Roof Repairs"
WARRANTY_REPAIRS = "Warranty Repairs"
ROOF_ASSESSMENTS = "Roof Assessments"

# Legacy parents
COMMERCIAL_SERVICE = "Commercial Service"
LEGACY_RM = "Repairs & Maintenance"
PREVENTIVE_MAINTENANCE = "Preventive Maintenance"

GENERAL_ROOF_MAINTENANCE = "General Roof Maintenance"
BI_ANNUAL = "Bi-Annual Roof Maintenance"
ANNUAL = "Annual Roof Maintenance"
LEAK_INVESTIGATIONS = "Leak Investigations"
ROOF_LIFE_OPINION = "Roof Life Opinion Report"

# Labels that move to Roof Repairs unchanged
ROOF_REPAIR_SUBS = [
    "EPDM Repairs",
    "Gutter Repairs",
    "Skylight Replacement",
    "Metal Roof Repairs",
    "Parkade Repairs",
    "SBS Repairs",
    "TPO Repairs",
    "Waterproofing Repairs",
    "Sheet Metal Repairs",
    "Shingle Roof Repairs",
]


def _load_seed_module():
    path = os.path.join(os.path.dirname(__file__), "seed_project_divisions.py")
    spec = importlib.util.spec_from_file_location("seed_project_divisions_impl", path)
    if spec is None or spec.loader is None:
        raise ImportError(f"Cannot load {path}")
    mod = importlib.util.module_from_spec(spec)
    sys.modules["seed_project_divisions_impl"] = mod
    spec.loader.exec_module(mod)
    return mod


def _get_divisions_list(db) -> Optional[SettingList]:
    return db.query(SettingList).filter(SettingList.name == "project_divisions").first()


def _find_top_level(db, divisions_list: SettingList, label: str) -> Optional[SettingItem]:
    return (
        db.query(SettingItem)
        .filter(
            SettingItem.list_id == divisions_list.id,
            SettingItem.parent_id.is_(None),
            SettingItem.label == label,
        )
        .first()
    )


def _find_subdivision(db, divisions_list: SettingList, parent: SettingItem, label: str) -> Optional[SettingItem]:
    return (
        db.query(SettingItem)
        .filter(
            SettingItem.list_id == divisions_list.id,
            SettingItem.parent_id == parent.id,
            SettingItem.label == label,
        )
        .first()
    )


def _find_all_by_label(db, divisions_list: SettingList, label: str) -> list[SettingItem]:
    return (
        db.query(SettingItem)
        .filter(SettingItem.list_id == divisions_list.id, SettingItem.label == label)
        .order_by(SettingItem.sort_index.asc(), SettingItem.id.asc())
        .all()
    )


def _ensure_top_level(db, divisions_list: SettingList, label: str, sort_index: int) -> SettingItem:
    row = _find_top_level(db, divisions_list, label)
    if row:
        return row
    row = SettingItem(
        list_id=divisions_list.id,
        parent_id=None,
        label=label,
        value=label.lower().replace(" ", "_"),
        sort_index=sort_index,
        meta=None,
    )
    db.add(row)
    db.flush()
    print(f"  Created parent: {label} [{row.id}]")
    return row


def _ensure_subdivision(
    db, divisions_list: SettingList, parent: SettingItem, label: str, sort_index: int = 0
) -> SettingItem:
    row = _find_subdivision(db, divisions_list, parent, label)
    if row:
        return row
    row = SettingItem(
        list_id=divisions_list.id,
        parent_id=parent.id,
        label=label,
        value=label.lower().replace(" ", "_"),
        sort_index=sort_index,
        meta=None,
    )
    db.add(row)
    db.flush()
    print(f"  Created subdivision: {parent.label} / {label} [{row.id}]")
    return row


def _replace_id_in_list(raw, old_id: str, new_id: str) -> tuple[list | None, bool]:
    if not isinstance(raw, list) or not raw:
        return raw, False
    changed = False
    next_ids: list = []
    for item in raw:
        sid = str(item) if item is not None else ""
        if sid == old_id:
            if new_id not in {str(x) for x in next_ids}:
                next_ids.append(new_id)
            changed = True
        else:
            next_ids.append(item)
    return (next_ids or None), changed


def _replace_id_in_dict(raw, old_id: str, new_id: str) -> tuple[dict | None, bool]:
    if not isinstance(raw, dict) or not raw:
        return raw, False
    if old_id not in {str(k) for k in raw.keys()}:
        return raw, False
    next_map: dict = {}
    for k, v in raw.items():
        sk = str(k)
        if sk == old_id:
            # Prefer keeping existing new_id value if both present
            if new_id in next_map:
                continue
            next_map[new_id] = v
        else:
            next_map[k] = v
    return next_map or None, True


def _replace_division_id_everywhere(db, old_id: str, new_id: str) -> dict:
    """Remap division UUID across projects, quotes, employees, proposals. Never deletes rows."""
    stats = {"projects": 0, "quotes": 0, "employees": 0, "proposals": 0, "drafts": 0}
    if not old_id or not new_id or old_id == new_id:
        return stats

    for project in db.query(Project).filter(Project.deleted_at.is_(None)).all():
        changed = False
        ids, c = _replace_id_in_list(getattr(project, "project_division_ids", None), old_id, new_id)
        if c:
            project.project_division_ids = ids
            flag_modified(project, "project_division_ids")
            changed = True
        pct, c = _replace_id_in_dict(getattr(project, "project_division_percentages", None), old_id, new_id)
        if c:
            project.project_division_percentages = pct
            flag_modified(project, "project_division_percentages")
            changed = True
        leads, c = _replace_id_in_dict(getattr(project, "division_onsite_leads", None), old_id, new_id)
        if c:
            project.division_onsite_leads = leads
            flag_modified(project, "division_onsite_leads")
            changed = True
        # Legacy single/multi fields
        if getattr(project, "division_id", None) is not None and str(project.division_id) == old_id:
            try:
                import uuid as uuid_mod

                project.division_id = uuid_mod.UUID(new_id)
            except Exception:
                project.division_id = new_id  # type: ignore[assignment]
            changed = True
        legacy_ids, c = _replace_id_in_list(getattr(project, "division_ids", None), old_id, new_id)
        if c:
            project.division_ids = legacy_ids
            flag_modified(project, "division_ids")
            changed = True
        if changed:
            stats["projects"] += 1

    for quote in db.query(Quote).filter(Quote.deleted_at.is_(None)).all():
        ids, c = _replace_id_in_list(getattr(quote, "project_division_ids", None), old_id, new_id)
        if c:
            quote.project_division_ids = ids
            flag_modified(quote, "project_division_ids")
            stats["quotes"] += 1

    for profile in db.query(EmployeeProfile).all():
        ids, c = _replace_id_in_list(getattr(profile, "project_division_ids", None), old_id, new_id)
        if c:
            profile.project_division_ids = ids
            flag_modified(profile, "project_division_ids")
            stats["employees"] += 1

    for proposal in db.query(Proposal).filter(Proposal.deleted_at.is_(None)).all():
        if _replace_division_in_proposal_data(proposal, old_id, new_id):
            stats["proposals"] += 1

    for draft in db.query(ProposalDraft).all():
        if _replace_division_in_proposal_data(draft, old_id, new_id):
            stats["drafts"] += 1

    return stats


def _replace_division_in_proposal_data(row, old_id: str, new_id: str) -> bool:
    data = getattr(row, "data", None)
    if not isinstance(data, dict):
        return False
    costs = data.get("additional_costs")
    if not isinstance(costs, list):
        return False
    changed = False
    for item in costs:
        if not isinstance(item, dict):
            continue
        did = item.get("division_id")
        if did is not None and str(did) == old_id:
            item["division_id"] = new_id
            changed = True
    if changed:
        row.data = data
        flag_modified(row, "data")
    return changed


def _refs_count(db, division_id: str) -> int:
    count = 0
    for project in db.query(Project).filter(Project.deleted_at.is_(None)).all():
        raw = getattr(project, "project_division_ids", None) or []
        if isinstance(raw, list) and division_id in {str(x) for x in raw if x}:
            count += 1
        pct = getattr(project, "project_division_percentages", None) or {}
        if isinstance(pct, dict) and division_id in {str(k) for k in pct.keys()}:
            count += 1
    return count


def _merge_into(db, source: SettingItem, target: SettingItem, *, dry_run: bool) -> dict:
    old_id, new_id = str(source.id), str(target.id)
    print(f"  Merge [{source.label}] {old_id} -> [{target.label}] {new_id}")
    if dry_run:
        return {"projects": 0, "quotes": 0, "employees": 0, "proposals": 0, "drafts": 0, "dry_run": True}
    stats = _replace_division_id_everywhere(db, old_id, new_id)
    remaining = _refs_count(db, old_id)
    if remaining:
        raise RuntimeError(f"{remaining} project ref(s) still point at {old_id} after merge")
    db.delete(source)
    db.flush()
    return stats


def _reparent_and_rename(
    db,
    item: SettingItem,
    *,
    new_parent: SettingItem,
    new_label: str,
    dry_run: bool,
) -> None:
    print(
        f"  Reparent/rename [{item.label}] -> {new_parent.label} / {new_label} [{item.id}]"
    )
    if dry_run:
        return
    item.parent_id = new_parent.id
    item.label = new_label
    item.value = new_label.lower().replace(" ", "_")
    db.flush()


def _pick_keeper(items: list[SettingItem], preferred_parent_id: Optional[str] = None) -> SettingItem:
    if preferred_parent_id:
        for item in items:
            if item.parent_id is not None and str(item.parent_id) == preferred_parent_id:
                return item
    return items[0]


def migrate_rm_project_divisions_2026_v2(*, do_commit: bool = True, dry_run: bool = False) -> dict:
    db = SessionLocal()
    stats: dict = {"merges": 0, "reparents": 0, "parent_only_migrated": 0, "dry_run": dry_run}
    try:
        divisions_list = _get_divisions_list(db)
        if not divisions_list:
            print("No project_divisions list - run seed first.")
            return stats

        # Ensure new parents exist before remapping
        roof_maint = _ensure_top_level(db, divisions_list, ROOF_MAINTENANCE, 100)
        roof_repairs = _ensure_top_level(db, divisions_list, ROOF_REPAIRS, 101)
        warranty = _ensure_top_level(db, divisions_list, WARRANTY_REPAIRS, 102)
        roof_assessments = _ensure_top_level(db, divisions_list, ROOF_ASSESSMENTS, 103)
        commercial = _find_top_level(db, divisions_list, COMMERCIAL_SERVICE)
        legacy_rm = _find_top_level(db, divisions_list, LEGACY_RM)

        print("\n=== 1) Bi-Annual / Annual maintenance consolidations ===")
        # Keeper: rename Bi-Annual Spring -> Bi-Annual under Roof Maintenance
        spring_bi = _find_all_by_label(db, divisions_list, "Bi-Annual Spring Roof Maintenance")
        fall_bi = _find_all_by_label(db, divisions_list, "Bi-Annual Fall Roof Maintenance")
        existing_bi = _find_all_by_label(db, divisions_list, BI_ANNUAL)

        bi_keeper: Optional[SettingItem] = None
        if existing_bi:
            bi_keeper = _pick_keeper(existing_bi, str(roof_maint.id))
            _reparent_and_rename(db, bi_keeper, new_parent=roof_maint, new_label=BI_ANNUAL, dry_run=dry_run)
            stats["reparents"] += 1
        elif spring_bi:
            bi_keeper = _pick_keeper(spring_bi)
            _reparent_and_rename(db, bi_keeper, new_parent=roof_maint, new_label=BI_ANNUAL, dry_run=dry_run)
            stats["reparents"] += 1
        else:
            bi_keeper = _ensure_subdivision(db, divisions_list, roof_maint, BI_ANNUAL)

        for item in spring_bi + fall_bi + existing_bi:
            if bi_keeper and str(item.id) != str(bi_keeper.id):
                _merge_into(db, item, bi_keeper, dry_run=dry_run)
                stats["merges"] += 1

        # Annual: Spring + Fall -> Annual Roof Maintenance
        spring = _find_all_by_label(db, divisions_list, "Spring Roof Maintenance")
        fall = _find_all_by_label(db, divisions_list, "Fall Roof Maintenance")
        existing_annual = _find_all_by_label(db, divisions_list, ANNUAL)
        annual_keeper: Optional[SettingItem] = None
        if existing_annual:
            annual_keeper = _pick_keeper(existing_annual, str(roof_maint.id))
            _reparent_and_rename(db, annual_keeper, new_parent=roof_maint, new_label=ANNUAL, dry_run=dry_run)
            stats["reparents"] += 1
        elif spring:
            annual_keeper = _pick_keeper(spring)
            _reparent_and_rename(db, annual_keeper, new_parent=roof_maint, new_label=ANNUAL, dry_run=dry_run)
            stats["reparents"] += 1
        else:
            annual_keeper = _ensure_subdivision(db, divisions_list, roof_maint, ANNUAL)

        for item in spring + fall + existing_annual:
            if annual_keeper and str(item.id) != str(annual_keeper.id):
                _merge_into(db, item, annual_keeper, dry_run=dry_run)
                stats["merges"] += 1

        print("\n=== 2) General Roof Maintenance consolidations ===")
        # Rename "Roof Maintenance" subdivision -> General; merge RRM + PM
        rm_subs = [
            i
            for i in _find_all_by_label(db, divisions_list, "Roof Maintenance")
            if i.parent_id is not None
        ]
        rrm_subs = _find_all_by_label(db, divisions_list, "Roof Repairs and Maintenance")
        general_existing = _find_all_by_label(db, divisions_list, GENERAL_ROOF_MAINTENANCE)
        pm_items = _find_all_by_label(db, divisions_list, PREVENTIVE_MAINTENANCE)

        general_keeper: Optional[SettingItem] = None
        if general_existing:
            general_keeper = _pick_keeper(general_existing, str(roof_maint.id))
            _reparent_and_rename(
                db, general_keeper, new_parent=roof_maint, new_label=GENERAL_ROOF_MAINTENANCE, dry_run=dry_run
            )
            stats["reparents"] += 1
        elif rm_subs:
            general_keeper = _pick_keeper(rm_subs)
            _reparent_and_rename(
                db, general_keeper, new_parent=roof_maint, new_label=GENERAL_ROOF_MAINTENANCE, dry_run=dry_run
            )
            stats["reparents"] += 1
        else:
            general_keeper = _ensure_subdivision(db, divisions_list, roof_maint, GENERAL_ROOF_MAINTENANCE)

        for item in rm_subs + rrm_subs + general_existing + pm_items:
            if general_keeper and str(item.id) != str(general_keeper.id):
                _merge_into(db, item, general_keeper, dry_run=dry_run)
                stats["merges"] += 1

        print("\n=== 3) Penetration Installation -> Roof Maintenance ===")
        pen_items = [i for i in _find_all_by_label(db, divisions_list, "Penetration Installation") if i.parent_id is not None]
        if pen_items:
            under_rm = [i for i in pen_items if str(i.parent_id) == str(roof_maint.id)]
            if under_rm:
                pen_keeper = under_rm[0]
            else:
                pen_keeper = pen_items[0]
                _reparent_and_rename(
                    db,
                    pen_keeper,
                    new_parent=roof_maint,
                    new_label="Penetration Installation",
                    dry_run=dry_run,
                )
                stats["reparents"] += 1
            for item in pen_items:
                if str(item.id) != str(pen_keeper.id):
                    _merge_into(db, item, pen_keeper, dry_run=dry_run)
                    stats["merges"] += 1

        print("\n=== 4) Roof repair subdivisions -> Roof Repairs ===")
        for label in ROOF_REPAIR_SUBS:
            items = [i for i in _find_all_by_label(db, divisions_list, label) if i.parent_id is not None]
            if not items:
                continue
            keeper = None
            under_rr = [i for i in items if str(i.parent_id) == str(roof_repairs.id)]
            if under_rr:
                keeper = under_rr[0]
            else:
                keeper = items[0]
                _reparent_and_rename(db, keeper, new_parent=roof_repairs, new_label=label, dry_run=dry_run)
                stats["reparents"] += 1
            for item in items:
                if str(item.id) != str(keeper.id):
                    _merge_into(db, item, keeper, dry_run=dry_run)
                    stats["merges"] += 1

        print("\n=== 5) Leak Investigations -> Roof Assessments ===")
        leak_items = _find_all_by_label(db, divisions_list, LEAK_INVESTIGATIONS)
        leak_subs = [i for i in leak_items if i.parent_id is not None]
        leak_tops = [i for i in leak_items if i.parent_id is None]
        leak_keeper: Optional[SettingItem] = None
        under_ra = [i for i in leak_subs if str(i.parent_id) == str(roof_assessments.id)]
        if under_ra:
            leak_keeper = under_ra[0]
        elif leak_subs:
            leak_keeper = leak_subs[0]
            _reparent_and_rename(
                db, leak_keeper, new_parent=roof_assessments, new_label=LEAK_INVESTIGATIONS, dry_run=dry_run
            )
            stats["reparents"] += 1
        elif leak_tops:
            leak_keeper = leak_tops[0]
            _reparent_and_rename(
                db, leak_keeper, new_parent=roof_assessments, new_label=LEAK_INVESTIGATIONS, dry_run=dry_run
            )
            stats["reparents"] += 1
        else:
            leak_keeper = _ensure_subdivision(db, divisions_list, roof_assessments, LEAK_INVESTIGATIONS)

        for item in leak_items:
            if leak_keeper and str(item.id) != str(leak_keeper.id):
                _merge_into(db, item, leak_keeper, dry_run=dry_run)
                stats["merges"] += 1

        print("\n=== 6) Roof Inspection -> Roof Life Opinion Report ===")
        inspection_items = _find_all_by_label(db, divisions_list, "Roof Inspection")
        rlor_items = _find_all_by_label(db, divisions_list, ROOF_LIFE_OPINION)
        rlor_keeper: Optional[SettingItem] = None
        if rlor_items:
            rlor_keeper = _pick_keeper(rlor_items, str(roof_assessments.id))
            _reparent_and_rename(
                db, rlor_keeper, new_parent=roof_assessments, new_label=ROOF_LIFE_OPINION, dry_run=dry_run
            )
            stats["reparents"] += 1
        elif inspection_items:
            rlor_keeper = inspection_items[0]
            _reparent_and_rename(
                db, rlor_keeper, new_parent=roof_assessments, new_label=ROOF_LIFE_OPINION, dry_run=dry_run
            )
            stats["reparents"] += 1
        else:
            rlor_keeper = _ensure_subdivision(db, divisions_list, roof_assessments, ROOF_LIFE_OPINION)

        for item in inspection_items + rlor_items:
            if rlor_keeper and str(item.id) != str(rlor_keeper.id):
                _merge_into(db, item, rlor_keeper, dry_run=dry_run)
                stats["merges"] += 1

        print("\n=== 7) Parent-only Commercial Service / Repairs & Maintenance -> General ===")
        if general_keeper is None:
            general_keeper = _ensure_subdivision(db, divisions_list, roof_maint, GENERAL_ROOF_MAINTENANCE)
        for parent in (commercial, legacy_rm):
            if not parent:
                continue
            pid = str(parent.id)
            if dry_run:
                print(f"  Would remap parent-only refs from {parent.label} [{pid}] -> General")
                continue
            merge_stats = _replace_division_id_everywhere(db, pid, str(general_keeper.id))
            stats["parent_only_migrated"] += merge_stats["projects"]
            print(f"  Remapped parent-only {parent.label}: {merge_stats}")

        print("\n=== 8) Seed new tree (creates new labels; removes stale under active parents) ===")
        if not dry_run:
            # Commit remaps before seed (seed uses its own session)
            db.commit()
            seed_mod = _load_seed_module()
            seed_mod.seed_project_divisions()
            db.expire_all()
        else:
            print("  Skipped seed (dry-run)")

        # Refresh handles after seed
        divisions_list = _get_divisions_list(db)
        if not divisions_list:
            raise RuntimeError("project_divisions missing after seed")
        roof_assessments = _find_top_level(db, divisions_list, ROOF_ASSESSMENTS)
        roof_maint = _find_top_level(db, divisions_list, ROOF_MAINTENANCE)
        roof_repairs = _find_top_level(db, divisions_list, ROOF_REPAIRS)
        warranty = _find_top_level(db, divisions_list, WARRANTY_REPAIRS)
        if not all([roof_assessments, roof_maint, roof_repairs, warranty]):
            raise RuntimeError("One or more R&M parents missing after seed")

        leak = _find_subdivision(db, divisions_list, roof_assessments, LEAK_INVESTIGATIONS)
        if not leak and not dry_run:
            raise RuntimeError("Leak Investigations missing under Roof Assessments after migration")

        print("\n=== 9) Cleanup leftover Commercial Service children (zero-ref only) ===")
        commercial = _find_top_level(db, divisions_list, COMMERCIAL_SERVICE)
        if commercial and not dry_run:
            children = (
                db.query(SettingItem)
                .filter(
                    SettingItem.list_id == divisions_list.id,
                    SettingItem.parent_id == commercial.id,
                )
                .all()
            )
            for child in children:
                refs = _refs_count(db, str(child.id))
                if refs:
                    print(f"  KEEP (still referenced): {child.label} [{child.id}] refs={refs}")
                else:
                    print(f"  Delete stale Commercial Service child: {child.label} [{child.id}]")
                    db.delete(child)
            db.flush()

        # Safety: exactly one Leak Investigations subdivision
        if not dry_run:
            leak_children = (
                db.query(SettingItem)
                .filter(
                    SettingItem.list_id == divisions_list.id,
                    SettingItem.label == LEAK_INVESTIGATIONS,
                    SettingItem.parent_id.isnot(None),
                )
                .all()
            )
            if len(leak_children) != 1:
                raise RuntimeError(
                    f"Expected exactly one Leak Investigations subdivision, found {len(leak_children)}"
                )
            if str(leak_children[0].parent_id) != str(roof_assessments.id):
                raise RuntimeError("Leak Investigations parent is not Roof Assessments")

        if do_commit and not dry_run:
            db.commit()
        elif dry_run:
            db.rollback()
            print("\nDry-run complete - no changes committed.")
        else:
            db.rollback()

        print("\nR&M divisions v2 migration completed.", stats)
        return stats
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def main():
    parser = argparse.ArgumentParser(description="Migrate R&M project divisions to 4-parent tree")
    parser.add_argument("--dry-run", action="store_true", help="Plan actions without committing")
    args = parser.parse_args()
    migrate_rm_project_divisions_2026_v2(do_commit=not args.dry_run, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
