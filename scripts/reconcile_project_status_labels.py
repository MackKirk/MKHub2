#!/usr/bin/env python3
"""
Reconcile projects.status_label with current project_statuses SettingItem labels.

Safe / idempotent:
  - Never clears or changes status_id except when attaching a unique label match
    to a null status_id (label unchanged).
  - Never deletes projects or setting items.
  - Orphan rows are reported and left untouched.

Usage:
  python scripts/reconcile_project_status_labels.py --dry-run
  python scripts/reconcile_project_status_labels.py
"""
from __future__ import annotations

import argparse
import os
import sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def reconcile(dry_run: bool = False) -> None:
    from sqlalchemy import or_
    from app.db import SessionLocal
    from app.models.models import Project, SettingItem, SettingList

    db = SessionLocal()
    try:
        status_list = db.query(SettingList).filter(SettingList.name == "project_statuses").first()
        if not status_list:
            print("project_statuses SettingList not found; nothing to do.")
            return

        items = (
            db.query(SettingItem)
            .filter(SettingItem.list_id == status_list.id)
            .order_by(SettingItem.sort_index.asc())
            .all()
        )
        known_ids = {item.id for item in items}
        label_to_ids: dict[str, list] = defaultdict(list)
        for item in items:
            label = (item.label or "").strip()
            if label:
                label_to_ids[label].append(item.id)

        print(f"Loaded {len(items)} project_statuses item(s).")
        print(f"Mode: {'dry-run (no commit)' if dry_run else 'apply'}")

        labels_updated = 0
        for item in items:
            label = item.label
            if label is None:
                continue
            q = db.query(Project).filter(
                Project.status_id == item.id,
                or_(Project.status_label.is_(None), Project.status_label != label),
            )
            count = q.count()
            if count:
                print(f"  sync label '{label}' via status_id={item.id}: {count} row(s)")
                if not dry_run:
                    q.update({Project.status_label: label}, synchronize_session=False)
                labels_updated += count

        ids_attached = 0
        null_id_rows = (
            db.query(Project.id, Project.status_label, Project.code, Project.is_bidding)
            .filter(Project.status_id.is_(None), Project.status_label.isnot(None))
            .all()
        )
        attached_ids: set = set()
        for row_id, status_label, code, is_bidding in null_id_rows:
            label = (status_label or "").strip()
            if not label:
                continue
            matches = label_to_ids.get(label) or []
            if len(matches) != 1:
                continue
            print(
                f"  attach status_id={matches[0]} for "
                f"{'opportunity' if is_bidding else 'project'} {code or row_id} "
                f"(label '{label}' unique match)"
            )
            if not dry_run:
                db.query(Project).filter(Project.id == row_id, Project.status_id.is_(None)).update(
                    {Project.status_id: matches[0]},
                    synchronize_session=False,
                )
            attached_ids.add(row_id)
            ids_attached += 1

        orphan_bad_id_q = db.query(
            Project.id, Project.code, Project.status_id, Project.status_label, Project.is_bidding
        ).filter(Project.status_id.isnot(None))
        if known_ids:
            orphan_bad_id_q = orphan_bad_id_q.filter(~Project.status_id.in_(known_ids))
        orphan_bad_id = orphan_bad_id_q.all()

        orphan_label_only = []
        for row_id, status_label, code, is_bidding in null_id_rows:
            if row_id in attached_ids:
                continue
            orphan_label_only.append((row_id, code, status_label, is_bidding))

        print("\n=== Summary ===")
        print(f"status_label rows to sync: {labels_updated}")
        print(f"null status_id rows to attach: {ids_attached}")
        print(f"orphan status_id (unknown SettingItem): {len(orphan_bad_id)}")
        print(f"orphan label-only / ambiguous (left untouched): {len(orphan_label_only)}")

        if orphan_bad_id:
            print("\nOrphan status_id samples (max 20):")
            for row_id, code, status_id, status_label, is_bidding in orphan_bad_id[:20]:
                kind = "opportunity" if is_bidding else "project"
                print(f"  {kind} {code or row_id}: status_id={status_id} status_label={status_label!r}")

        if orphan_label_only:
            print("\nOrphan / ambiguous label-only samples (max 20):")
            for row_id, code, status_label, is_bidding in orphan_label_only[:20]:
                kind = "opportunity" if is_bidding else "project"
                print(f"  {kind} {code or row_id}: status_label={status_label!r}")

        if dry_run:
            db.rollback()
            print("\nDry-run complete; no changes committed.")
        else:
            db.commit()
            print("\nReconcile committed.")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Reconcile project status_label with Settings.")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Report counts without writing changes",
    )
    args = parser.parse_args()
    reconcile(dry_run=args.dry_run)


if __name__ == "__main__":
    main()
