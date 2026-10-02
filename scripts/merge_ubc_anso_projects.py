#!/usr/bin/env python3
"""
One-off merge: UBC ANSO Building duplicates.

Keeper (live):  MK-00529/00048-2026
Source (hide):  MK-00019/00048-2026

- Fill empty general-info fields on keeper from source (never overwrite).
- Move project folders + file objects + client files onto keeper.
- Soft-delete source.

Usage (from repo root):
  python scripts/merge_ubc_anso_projects.py            # dry-run (default)
  python scripts/merge_ubc_anso_projects.py --dry-run
  python scripts/merge_ubc_anso_projects.py --apply
"""
from __future__ import annotations

import argparse
import os
import sys
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Sequence, Tuple

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    from dotenv import load_dotenv

    load_dotenv()
except Exception:
    pass

from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from app.db import SessionLocal
from app.models.models import (
    Attendance,
    ClientFile,
    ClientFolder,
    Estimate,
    FileObject,
    Project,
    ProjectEvent,
    ProjectFolder,
    ProjectMember,
    ProjectOrder,
    ProjectReport,
    ProjectSafetyInspection,
    ProjectTimeEntry,
    ProjectUpdate,
    ProjectWarranty,
    Proposal,
    Shift,
    SubcontractorAttendance,
    TaskItem,
    TaskRequest,
    VeriClockJobMap,
)

KEEPER_CODE = "MK-00529/00048-2026"
SOURCE_CODE = "MK-00019/00048-2026"

# General-info fields: copy from source only when keeper value is empty.
GENERAL_INFO_FIELDS: Sequence[str] = (
    "project_number",
    "name",
    "slug",
    "related_client_ids",
    "awarded_related_client_id",
    "awarded_related_client_ids",
    "site_id",
    "address",
    "address_city",
    "address_province",
    "address_country",
    "lat",
    "lng",
    "geocoded_address",
    "geocoding_status",
    "geocoded_at",
    "geocoding_error",
    "timezone",
    "status",
    "status_id",
    "status_label",
    "division_id",
    "division_ids",
    "project_division_ids",
    "project_division_percentages",
    "estimator_id",
    "estimator_ids",
    "project_admin_id",
    "onsite_lead_id",
    "division_onsite_leads",
    "contact_id",
    "date_start",
    "date_eta",
    "date_awarded",
    "date_end",
    "progress",
    "description",
    "scope_of_work",
    "job_completion_estimate",
    "crew_material_list",
    "notes",
    "lead_source",
    "image_file_object_id",
    "image_manually_set",
    "purchase_order_number",
    "billing_contact",
    "invoice_to",
    "billing_email",
    "po_required",
    "billing_address_line1",
    "billing_address_line2",
    "billing_city",
    "billing_province",
    "billing_postal_code",
    "billing_country",
    # costs only if empty on keeper (plan: pricing equal → usually no-op)
    "cost_estimated",
    "cost_actual",
    "service_value",
)

# image_manually_set is only copied together with image_file_object_id

def _is_empty(value: Any) -> bool:
    if value is None:
        return True
    if isinstance(value, str) and value.strip() == "":
        return True
    if isinstance(value, (list, dict, tuple, set)) and len(value) == 0:
        return True
    return False


def _fmt(value: Any) -> str:
    if value is None:
        return "<null>"
    if isinstance(value, uuid.UUID):
        return str(value)
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, (list, dict)):
        return repr(value)[:200]
    s = str(value)
    return s if len(s) <= 120 else s[:117] + "..."


def _resolve_project(db: Session, code: str) -> Project:
    row = db.query(Project).filter(Project.code == code).first()
    if not row:
        raise SystemExit(f"ERROR: project not found for code={code!r}")
    return row


def _folder_path(folder: ProjectFolder, by_id: Dict[uuid.UUID, ProjectFolder]) -> str:
    parts: List[str] = []
    seen: set[uuid.UUID] = set()
    cur: Optional[ProjectFolder] = folder
    while cur is not None:
        if cur.id in seen:
            parts.append("<?>")
            break
        seen.add(cur.id)
        parts.append(cur.name or "")
        parent_id = cur.parent_id
        cur = by_id.get(parent_id) if parent_id else None
    return "/".join(reversed(parts))


def _folder_key(category: str, path: str) -> Tuple[str, str]:
    return ((category or "").strip().lower(), (path or "").strip().lower())


def _count_fo_for_project(db: Session, project_id: uuid.UUID) -> int:
    return db.query(FileObject).filter(FileObject.project_id == project_id).count()


def _count_cf_for_project(db: Session, project_id: uuid.UUID, *, active_only: bool) -> int:
    q = (
        db.query(ClientFile)
        .join(FileObject, FileObject.id == ClientFile.file_object_id)
        .filter(FileObject.project_id == project_id)
    )
    if active_only:
        q = q.filter(ClientFile.deleted_at.is_(None))
    return q.count()


def _out_of_scope_counts(db: Session, project_id: uuid.UUID) -> Dict[str, int]:
    counts: Dict[str, int] = {
        "project_members": db.query(ProjectMember).filter(ProjectMember.project_id == project_id).count(),
        "project_updates": db.query(ProjectUpdate).filter(ProjectUpdate.project_id == project_id).count(),
        "project_reports": db.query(ProjectReport).filter(ProjectReport.project_id == project_id).count(),
        "project_events": db.query(ProjectEvent).filter(ProjectEvent.project_id == project_id).count(),
        "project_safety_inspections": db.query(ProjectSafetyInspection)
        .filter(ProjectSafetyInspection.project_id == project_id)
        .count(),
        "project_warranties": db.query(ProjectWarranty).filter(ProjectWarranty.project_id == project_id).count(),
        "project_time_entries": db.query(ProjectTimeEntry).filter(ProjectTimeEntry.project_id == project_id).count(),
        "shifts": db.query(Shift).filter(Shift.project_id == project_id).count(),
        "attendance": db.query(Attendance).filter(Attendance.project_id == project_id).count(),
        "subcontractor_attendance": db.query(SubcontractorAttendance)
        .filter(SubcontractorAttendance.project_id == project_id)
        .count(),
        "project_orders": db.query(ProjectOrder).filter(ProjectOrder.project_id == project_id).count(),
        "proposals": db.query(Proposal)
        .filter(Proposal.project_id == project_id, Proposal.deleted_at.is_(None))
        .count(),
        "estimates": db.query(Estimate).filter(Estimate.project_id == project_id).count(),
        "tasks_v2": db.query(TaskItem).filter(TaskItem.project_id == project_id).count(),
        "task_requests": db.query(TaskRequest).filter(TaskRequest.project_id == project_id).count(),
        "vericlock_job_maps": db.query(VeriClockJobMap)
        .filter(VeriClockJobMap.hub_project_id == project_id)
        .count(),
        "related_leak_pointing_here": db.query(Project)
        .filter(Project.related_leak_investigation_id == project_id)
        .count(),
    }
    return counts


def _plan_general_fills(keeper: Project, source: Project) -> List[Tuple[str, Any, Any]]:
    """Return list of (field, old_keeper_value, new_value_from_source)."""
    fills: List[Tuple[str, Any, Any]] = []
    for field in GENERAL_INFO_FIELDS:
        if field == "image_manually_set":
            # handled with image_file_object_id
            continue
        if not hasattr(keeper, field) or not hasattr(source, field):
            continue
        k_val = getattr(keeper, field)
        s_val = getattr(source, field)
        if field == "image_file_object_id":
            if _is_empty(k_val) and not _is_empty(s_val):
                fills.append((field, k_val, s_val))
                fills.append(
                    (
                        "image_manually_set",
                        getattr(keeper, "image_manually_set", None),
                        getattr(source, "image_manually_set", False),
                    )
                )
            continue
        if _is_empty(k_val) and not _is_empty(s_val):
            fills.append((field, k_val, s_val))
    return fills


def _build_folder_inventory(
    db: Session, project_id: uuid.UUID
) -> Tuple[List[ProjectFolder], Dict[uuid.UUID, ProjectFolder], Dict[Tuple[str, str], ProjectFolder]]:
    folders = db.query(ProjectFolder).filter(ProjectFolder.project_id == project_id).all()
    by_id = {f.id: f for f in folders}
    by_key: Dict[Tuple[str, str], ProjectFolder] = {}
    for f in folders:
        by_key[_folder_key(f.category, _folder_path(f, by_id))] = f
    return folders, by_id, by_key


def _topo_sort_folders(folders: List[ProjectFolder]) -> List[ProjectFolder]:
    by_id = {f.id: f for f in folders}
    remaining = set(by_id.keys())
    ordered: List[ProjectFolder] = []
    while remaining:
        progress = False
        for fid in list(remaining):
            f = by_id[fid]
            if f.parent_id is None or f.parent_id not in remaining:
                # parent already placed or parent not in this set
                if f.parent_id is None or f.parent_id not in by_id or f.parent_id not in remaining:
                    ordered.append(f)
                    remaining.remove(fid)
                    progress = True
        if not progress:
            # cycle / orphan parent — append remaining in arbitrary order
            for fid in list(remaining):
                ordered.append(by_id[fid])
                remaining.remove(fid)
            break
    return ordered


def print_inventory(
    db: Session,
    keeper: Project,
    source: Project,
    fills: List[Tuple[str, Any, Any]],
    folder_collisions: List[str],
    out_of_scope: Dict[str, int],
) -> None:
    print("=" * 72)
    print("UBC ANSO merge inventory")
    print("=" * 72)
    for label, p in (("KEEPER", keeper), ("SOURCE", source)):
        print(f"\n[{label}] code={p.code}")
        print(f"  id={p.id}")
        print(f"  name={p.name!r}")
        print(f"  client_id={p.client_id}")
        print(f"  created_at={_fmt(p.created_at)}")
        print(f"  deleted_at={_fmt(p.deleted_at)}")
        print(f"  business_line={getattr(p, 'business_line', None)} is_bidding={getattr(p, 'is_bidding', None)}")
        pf = db.query(ProjectFolder).filter(ProjectFolder.project_id == p.id).count()
        cf_active = _count_cf_for_project(db, p.id, active_only=True)
        cf_all = _count_cf_for_project(db, p.id, active_only=False)
        fo = _count_fo_for_project(db, p.id)
        cfold = db.query(ClientFolder).filter(ClientFolder.project_id == p.id).count()
        print(f"  project_folders={pf} file_objects={fo} client_files_active={cf_active} client_files_all={cf_all}")
        print(f"  client_folders(project_id)={cfold}")

    print("\n--- General info fills (empty on keeper <- source) ---")
    if not fills:
        print("  (none)")
    else:
        for field, old, new in fills:
            print(f"  {field}: {_fmt(old)}  ->  {_fmt(new)}")

    print("\n--- Folder path collisions (same category+path on both) ---")
    if not folder_collisions:
        print("  (none - all source folders will be moved as-is)")
    else:
        for path in folder_collisions:
            print(f"  MERGE into existing keeper folder: {path}")

    print("\n--- Out-of-scope rows on SOURCE ---")
    blocked = False
    hard_preview = {
        "shifts",
        "attendance",
        "subcontractor_attendance",
        "project_time_entries",
        "project_orders",
        "project_warranties",
        "tasks_v2",
        "task_requests",
        "vericlock_job_maps",
        "project_safety_inspections",
        "related_leak_pointing_here",
    }
    for name, n in sorted(out_of_scope.items()):
        if n == 0:
            flag = "OK"
        elif name in hard_preview:
            flag = "BLOCK"
            blocked = True
        elif name in ("proposals", "estimates"):
            flag = "REDIRECT"
        else:
            flag = "LEAVE"
        print(f"  [{flag}] {name}={n}")
    if blocked:
        print("\nWARNING: BLOCK rows will abort --apply.")
    print()


def apply_general_fills(keeper: Project, fills: List[Tuple[str, Any, Any]]) -> int:
    n = 0
    for field, _old, new in fills:
        setattr(keeper, field, new)
        # JSON columns need flag_modified when reassigned with same identity sometimes
        if isinstance(new, (list, dict)):
            flag_modified(keeper, field)
        n += 1
    return n


def move_project_folders(
    db: Session, source: Project, keeper: Project
) -> Tuple[Dict[uuid.UUID, uuid.UUID], List[uuid.UUID], int]:
    """
    Remap source ProjectFolders onto keeper.
    Returns (folder_map old→target, orphaned_folder_ids_to_delete, moved_count).
    Collision: reuse keeper folder; source folder row is deleted after remapping files.
    """
    src_folders, src_by_id, _ = _build_folder_inventory(db, source.id)
    _keep_folders, keep_by_id, keep_by_key = _build_folder_inventory(db, keeper.id)

    folder_map: Dict[uuid.UUID, uuid.UUID] = {}
    to_delete: List[uuid.UUID] = []
    moved = 0

    for f in _topo_sort_folders(src_folders):
        # Resolve target parent first
        target_parent_id: Optional[uuid.UUID] = None
        if f.parent_id:
            target_parent_id = folder_map.get(f.parent_id)
            if target_parent_id is None:
                # parent not in source set (shouldn't happen) — leave None
                target_parent_id = None

        # Path under target tree for collision key
        # Build path using mapped parent names + this folder name
        if target_parent_id and target_parent_id in keep_by_id:
            parent_path = _folder_path(keep_by_id[target_parent_id], keep_by_id)
            path = f"{parent_path}/{f.name}" if parent_path else (f.name or "")
        elif target_parent_id and target_parent_id in src_by_id:
            # parent was moved (same id) — use source path
            path = _folder_path(f, src_by_id)
        else:
            path = f.name or ""
            # if parent mapped to a moved folder that kept its id:
            if f.parent_id and f.parent_id in folder_map:
                mapped = folder_map[f.parent_id]
                if mapped in keep_by_id:
                    parent_path = _folder_path(keep_by_id[mapped], keep_by_id)
                    path = f"{parent_path}/{f.name}" if parent_path else (f.name or "")
                elif mapped == f.parent_id:
                    path = _folder_path(f, src_by_id)

        # Prefer full source path for collision against keeper's original keys
        src_path = _folder_path(f, src_by_id)
        key = _folder_key(f.category, src_path)
        existing = keep_by_key.get(key)

        if existing is not None:
            folder_map[f.id] = existing.id
            to_delete.append(f.id)
            print(f"  folder COLLISION reuse: [{f.category}] {src_path} -> {existing.id}")
        else:
            f.project_id = keeper.id
            if f.parent_id:
                f.parent_id = folder_map.get(f.parent_id, f.parent_id)
            folder_map[f.id] = f.id
            keep_by_id[f.id] = f
            keep_by_key[_folder_key(f.category, _folder_path(f, keep_by_id))] = f
            moved += 1
            print(f"  folder MOVE: [{f.category}] {src_path} -> keeper ({f.id})")

    db.flush()
    return folder_map, to_delete, moved


def move_files(db: Session, source: Project, keeper: Project, folder_map: Dict[uuid.UUID, uuid.UUID]) -> Tuple[int, int]:
    """Remap FileObjects and ClientFiles from source → keeper. Returns (fo_count, cf_count)."""
    fos = db.query(FileObject).filter(FileObject.project_id == source.id).all()
    fo_ids = [fo.id for fo in fos]
    for fo in fos:
        fo.project_id = keeper.id
        if fo.client_id != keeper.client_id and keeper.client_id is not None:
            fo.client_id = keeper.client_id
    db.flush()

    cf_count = 0
    if fo_ids:
        cfiles = db.query(ClientFile).filter(ClientFile.file_object_id.in_(fo_ids)).all()
        for cf in cfiles:
            if cf.folder_id and cf.folder_id in folder_map:
                cf.folder_id = folder_map[cf.folder_id]
            if keeper.client_id is not None and cf.client_id != keeper.client_id:
                cf.client_id = keeper.client_id
            cf_count += 1
        db.flush()

    # Also remap any ClientFile whose folder still points at a source folder id in map
    # (covers edge cases where FO.project_id was already wrong)
    if folder_map:
        orphan_cfs = (
            db.query(ClientFile)
            .filter(ClientFile.folder_id.in_(list(folder_map.keys())))
            .all()
        )
        for cf in orphan_cfs:
            mapped = folder_map.get(cf.folder_id)  # type: ignore[arg-type]
            if mapped and cf.folder_id != mapped:
                cf.folder_id = mapped
                cf_count += 1
        db.flush()

    print(f"  file_objects remapped: {len(fos)}")
    print(f"  client_files remapped: {cf_count}")
    return len(fos), cf_count


def delete_collided_source_folders(
    db: Session, to_delete: List[uuid.UUID], src_folders: List[ProjectFolder]
) -> int:
    if not to_delete:
        return 0
    # Ensure no ClientFile still points at these (should have been remapped)
    still = (
        db.query(ClientFile)
        .filter(ClientFile.folder_id.in_(to_delete))
        .count()
    )
    if still:
        raise RuntimeError(
            f"Cannot delete collided source folders: {still} client_files still reference them"
        )
    # Delete children before parents (parent_id ON DELETE CASCADE)
    order = {f.id: i for i, f in enumerate(_topo_sort_folders(src_folders))}
    ordered_ids = sorted(to_delete, key=lambda fid: order.get(fid, 0), reverse=True)
    n = 0
    for fid in ordered_ids:
        deleted = (
            db.query(ProjectFolder)
            .filter(ProjectFolder.id == fid)
            .delete(synchronize_session=False)
        )
        n += deleted
    db.flush()
    print(f"  deleted collided source folder rows: {n}")
    return n


def move_client_folders(db: Session, source: Project, keeper: Project) -> int:
    rows = db.query(ClientFolder).filter(ClientFolder.project_id == source.id).all()
    for row in rows:
        row.project_id = keeper.id
    db.flush()
    print(f"  client_folders remapped: {len(rows)}")
    return len(rows)


def redirect_proposals_and_estimates(db: Session, source: Project, keeper: Project) -> Tuple[int, int]:
    """Simple project_id redirect (no content merge). Pricing rows stay intact."""
    proposals = db.query(Proposal).filter(Proposal.project_id == source.id).all()
    for p in proposals:
        p.project_id = keeper.id
    estimates = db.query(Estimate).filter(Estimate.project_id == source.id).all()
    for e in estimates:
        e.project_id = keeper.id
    db.flush()
    print(f"  proposals redirected: {len(proposals)}")
    print(f"  estimates redirected: {len(estimates)}")
    return len(proposals), len(estimates)


def soft_delete_source(source: Project) -> None:
    source.deleted_at = datetime.now(timezone.utc)
    source.deleted_by_id = None
    print(f"  soft-deleted source {source.code} id={source.id}")


def verify_after(db: Session, keeper: Project, source: Project) -> None:
    print("\n--- Post-merge verification ---")
    src_pf = db.query(ProjectFolder).filter(ProjectFolder.project_id == source.id).count()
    src_fo = _count_fo_for_project(db, source.id)
    src_cf = _count_cf_for_project(db, source.id, active_only=False)
    src_cfold = db.query(ClientFolder).filter(ClientFolder.project_id == source.id).count()
    keep_pf = db.query(ProjectFolder).filter(ProjectFolder.project_id == keeper.id).count()
    keep_fo = _count_fo_for_project(db, keeper.id)
    keep_cf = _count_cf_for_project(db, keeper.id, active_only=True)
    print(f"  source remaining: folders={src_pf} file_objects={src_fo} client_files={src_cf} client_folders={src_cfold}")
    print(f"  keeper now: folders={keep_pf} file_objects={keep_fo} client_files_active={keep_cf}")
    print(f"  source.deleted_at={_fmt(source.deleted_at)}")
    if src_pf or src_fo or src_cfold:
        print("  WARNING: source still has folder/file refs - inspect before trusting merge")
    else:
        print("  OK: source has no remaining project folders / file_objects / client_folders")


def run(*, apply: bool) -> None:
    db = SessionLocal()
    try:
        keeper = _resolve_project(db, KEEPER_CODE)
        source = _resolve_project(db, SOURCE_CODE)

        if keeper.id == source.id:
            raise SystemExit("ERROR: keeper and source resolved to the same row")

        if source.deleted_at is not None:
            raise SystemExit(f"ERROR: source already soft-deleted at {source.deleted_at}")

        if keeper.deleted_at is not None:
            raise SystemExit(f"ERROR: keeper is soft-deleted at {keeper.deleted_at}")

        if keeper.client_id != source.client_id:
            raise SystemExit(
                f"ERROR: client_id mismatch keeper={keeper.client_id} source={source.client_id} - abort"
            )

        fills = _plan_general_fills(keeper, source)
        src_folders, src_by_id, _ = _build_folder_inventory(db, source.id)
        _, _, keep_by_key = _build_folder_inventory(db, keeper.id)
        collisions: List[str] = []
        for f in src_folders:
            path = _folder_path(f, src_by_id)
            key = _folder_key(f.category, path)
            if key in keep_by_key:
                collisions.append(f"[{f.category}] {path}")

        out_of_scope = _out_of_scope_counts(db, source.id)
        print_inventory(db, keeper, source, fills, collisions, out_of_scope)

        blocked = {k: v for k, v in out_of_scope.items() if v > 0}
        # Members / updates left on soft-deleted project are acceptable noise;
        # hard blockers are operational data that would become orphaned silently.
        hard_block_keys = {
            "shifts",
            "attendance",
            "subcontractor_attendance",
            "project_time_entries",
            "project_orders",
            "project_warranties",
            "tasks_v2",
            "task_requests",
            "vericlock_job_maps",
            "project_safety_inspections",
            "related_leak_pointing_here",
        }
        # proposals / estimates: redirected (project_id only), not blocked
        # project_members / updates / reports / events: left on soft-deleted source
        soft_leave_keys = {
            "project_members",
            "project_updates",
            "project_reports",
            "project_events",
            "proposals",
            "estimates",
        }
        hard_blocks = {k: v for k, v in blocked.items() if k in hard_block_keys}
        soft_notes = {k: v for k, v in blocked.items() if k in soft_leave_keys or k not in hard_block_keys}
        if soft_notes:
            print("Note: out-of-scope rows handled as redirect or left on soft-deleted source:")
            for k, v in sorted(soft_notes.items()):
                if k in ("proposals", "estimates"):
                    print(f"  {k}={v} (will redirect project_id to keeper)")
                else:
                    print(f"  {k}={v} (left on soft-deleted source)")

        if not apply:
            print("DRY-RUN only. Re-run with --apply to commit changes.")
            return

        if hard_blocks:
            print("ABORT --apply: unexpected out-of-scope data on source:")
            for k, v in sorted(hard_blocks.items()):
                print(f"  {k}={v}")
            raise SystemExit(1)

        print("\n=== APPLYING MERGE ===")
        n_fills = apply_general_fills(keeper, fills)
        print(f"  general fields filled: {n_fills}")
        db.flush()

        folder_map, to_delete, moved = move_project_folders(db, source, keeper)
        print(f"  project_folders moved: {moved}; collisions reused: {len(to_delete)}")

        fo_n, cf_n = move_files(db, source, keeper, folder_map)
        delete_collided_source_folders(db, to_delete, src_folders)
        move_client_folders(db, source, keeper)
        prop_n, est_n = redirect_proposals_and_estimates(db, source, keeper)

        # ClientDocuments tagged to client folders keep working (folder ids preserved when moved).
        soft_delete_source(source)
        db.flush()

        verify_after(db, keeper, source)
        db.commit()
        print("\nCOMMITTED successfully.")
        print(
            f"Summary: fills={n_fills} folders_moved={moved} folder_collisions={len(to_delete)} "
            f"file_objects={fo_n} client_files={cf_n} proposals={prop_n} estimates={est_n}"
        )
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Merge UBC ANSO duplicate projects (one-off)")
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--dry-run", action="store_true", default=False, help="Inventory only (default)")
    group.add_argument("--apply", action="store_true", help="Apply merge and soft-delete source")
    args = parser.parse_args()
    apply = bool(args.apply)
    if not apply:
        print("Mode: DRY-RUN (default)\n")
    else:
        print("Mode: APPLY\n")
    run(apply=apply)


if __name__ == "__main__":
    main()
