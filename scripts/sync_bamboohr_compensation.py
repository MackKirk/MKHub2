"""
Sync BambooHR compensation history into MKHub EmployeeSalaryHistory.

The employee sync only keeps the current pay_rate on the profile. This script
imports the full Bamboo compensation table so historical raises are not lost.

Uso:
    # Dry-run for one user
    python scripts/sync_bamboohr_compensation.py --email baljindersekhon29@gmail.com --dry-run

    # Import Baljinder
    python scripts/sync_bamboohr_compensation.py --email baljindersekhon29@gmail.com

    # Bulk (first 20)
    python scripts/sync_bamboohr_compensation.py --limit 20

    # Full bulk
    python scripts/sync_bamboohr_compensation.py
"""
from __future__ import annotations

import argparse
import os
import sys
import uuid

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.models.models import EmployeeProfile, User
from app.services.bamboohr_client import BambooHRClient
from app.services.bamboohr_compensation_sync import (
    build_directory_email_index,
    resolve_bamboohr_id_from_index,
    sync_user_compensation_history,
)


def _iter_users(
    db: Session,
    *,
    user_id: str | None,
    email: str | None,
    usernames: list[str] | None,
    limit: int | None,
):
    q = db.query(User).filter(
        (User.email_personal.isnot(None)) | (User.email_corporate.isnot(None))
    )
    if user_id:
        try:
            uid = uuid.UUID(user_id)
        except ValueError as exc:
            raise SystemExit(f"Invalid --user-id: {user_id}") from exc
        q = q.filter(User.id == uid)
    if email:
        em = email.strip().lower()
        q = q.filter(
            (User.email_personal.ilike(em)) | (User.email_corporate.ilike(em))
        )
    if usernames:
        from sqlalchemy import or_

        clauses = [User.username.ilike(u.strip()) for u in usernames if u.strip()]
        if clauses:
            q = q.filter(or_(*clauses))
    q = q.order_by(User.created_at.asc())
    if limit and limit > 0:
        q = q.limit(limit)
    return q.all()


def sync_all_compensation(
    *,
    dry_run: bool = False,
    limit: int | None = None,
    user_id: str | None = None,
    email: str | None = None,
    username: str | None = None,
    usernames: list[str] | None = None,
) -> dict:
    print("[SYNC] Starting BambooHR compensation history synchronization...")
    try:
        client = BambooHRClient()
        print(f"   Connected to: {client.company_domain}.bamboohr.com")
    except Exception as exc:
        print(f"[ERROR] Error initializing BambooHR client: {exc}")
        return {"ok": False, "error": str(exc)}

    name_list = list(usernames or [])
    if username:
        name_list.append(username)

    db = SessionLocal()
    stats = {
        "ok": True,
        "users": 0,
        "synced": 0,
        "skipped": 0,
        "errors": 0,
        "created": 0,
        "updated": 0,
        "bamboo_rows": 0,
    }
    try:
        users = _iter_users(
            db,
            user_id=user_id,
            email=email,
            usernames=name_list or None,
            limit=limit,
        )
        print(f"   Candidates: {len(users)} Hub user(s)")
        if dry_run:
            print("   Mode: DRY RUN (no DB writes)")

        print("   Building Bamboo directory email index (enriched)...")
        email_index = build_directory_email_index(
            client, enrich=True, progress=print
        )
        print(f"   Directory emails indexed: {len(email_index)}")

        # Prefetch Hub work emails for matching
        work_emails = {
            uid: (we or "").strip().lower()
            for uid, we in db.query(
                EmployeeProfile.user_id, EmployeeProfile.work_email
            ).all()
            if we
        }

        for user in users:
            stats["users"] += 1
            label = (
                user.username
                or user.email_personal
                or user.email_corporate
                or str(user.id)
            )
            try:
                extra = []
                we = work_emails.get(user.id)
                if we:
                    extra.append(we)
                bamboo_id = resolve_bamboohr_id_from_index(
                    user, email_index, extra_emails=extra
                )
                if not bamboo_id:
                    stats["skipped"] += 1
                    print(f"  [SKIP] {label}: no_bamboo_match")
                    continue

                result = sync_user_compensation_history(
                    db,
                    client,
                    user,
                    dry_run=dry_run,
                    bamboohr_id=bamboo_id,
                )
                if not result.get("ok"):
                    stats["skipped"] += 1
                    print(f"  [SKIP] {label}: {result.get('error')}")
                    if not dry_run:
                        db.rollback()
                    continue

                created = int(result.get("created") or 0)
                updated = int(result.get("updated") or 0)
                bamboo_rows = int(result.get("bamboo_rows") or 0)
                stats["synced"] += 1
                stats["created"] += created
                stats["updated"] += updated
                stats["bamboo_rows"] += bamboo_rows
                print(
                    f"  [OK] {label} (bamboo={result.get('bamboohr_id')}) "
                    f"bamboo_rows={bamboo_rows} created={created} updated={updated}"
                )
            except Exception as exc:
                stats["errors"] += 1
                print(f"  [ERROR] {label}: {exc}")
                if not dry_run:
                    try:
                        db.rollback()
                    except Exception:
                        pass

        print(
            f"[DONE] users={stats['users']} synced={stats['synced']} "
            f"skipped={stats['skipped']} errors={stats['errors']} "
            f"created={stats['created']} updated={stats['updated']} "
            f"bamboo_rows={stats['bamboo_rows']}"
        )
        return stats
    finally:
        db.close()


def main():
    parser = argparse.ArgumentParser(
        description="Sync BambooHR compensation history into MKHub salary history"
    )
    parser.add_argument("--dry-run", action="store_true", help="Don't write to DB")
    parser.add_argument("--limit", type=int, help="Limit number of Hub users")
    parser.add_argument("--user-id", help="Sync a single Hub user UUID")
    parser.add_argument("--email", help="Sync Hub user by personal/corporate email")
    parser.add_argument(
        "--username",
        action="append",
        dest="usernames",
        help="Sync Hub user by username (repeatable)",
    )
    args = parser.parse_args()

    sync_all_compensation(
        dry_run=args.dry_run,
        limit=args.limit,
        user_id=args.user_id,
        email=args.email,
        usernames=args.usernames,
    )


if __name__ == "__main__":
    main()
