"""
Sync BambooHR time-off (vacation / day off / sick leave) into MKHub.

Brings balances, request history, and transaction history so the Hub can
replace Bamboo for day-to-day leave.

Matching is always: Hub user email → Bamboo employee id → filter company-wide
/time_off/requests by that id (fail-closed). Never writes another employee's
leave onto the user being synced.

Uso:
    # Ver o que o clean apagaria (recomendado primeiro)
    python scripts/sync_bamboohr_time_off.py --clean-only --dry-run

    # Limpar dados Bamboo corrompidos e re-sincronizar
    python scripts/sync_bamboohr_time_off.py --clean --dry-run --limit 5
    python scripts/sync_bamboohr_time_off.py --clean

    # Limpar TUDO de time-off do user (inclui ajustes manuais)
    python scripts/sync_bamboohr_time_off.py --clean-only --clean-all --email pessoa@mackkirk.com

    # Sync sem clean
    python scripts/sync_bamboohr_time_off.py --limit 5
"""
from __future__ import annotations

import argparse
import os
import sys
import uuid

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.models.models import TimeOffBalance, TimeOffHistory, TimeOffRequest, User
from app.services.bamboohr_client import BambooHRClient
from app.services.bamboohr_time_off_sync import clean_user_time_off, sync_user_time_off


def _iter_users(
    db: Session,
    *,
    user_id: str | None,
    email: str | None,
    limit: int | None,
    for_clean: bool = False,
):
    """
    for_clean=True and no user/email filter: every Hub user that already has
    time-off rows (so we wipe polluted accounts even without Bamboo email match).
    """
    if for_clean and not user_id and not email:
        user_ids = {
            uid
            for (uid,) in db.query(TimeOffHistory.user_id).distinct().all()
        }
        user_ids |= {
            uid for (uid,) in db.query(TimeOffBalance.user_id).distinct().all()
        }
        user_ids |= {
            uid for (uid,) in db.query(TimeOffRequest.user_id).distinct().all()
        }
        if not user_ids:
            return []
        q = db.query(User).filter(User.id.in_(user_ids))
    else:
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
    q = q.order_by(User.created_at.asc())
    if limit and limit > 0:
        q = q.limit(limit)
    return q.all()


def clean_all_time_off(
    *,
    dry_run: bool = False,
    limit: int | None = None,
    user_id: str | None = None,
    email: str | None = None,
    clean_all: bool = False,
) -> dict:
    print("[CLEAN] Removing corrupted / Bamboo-imported time-off data...")
    if clean_all:
        print("   Mode: CLEAN ALL (history + requests + balances, including manual)")
    else:
        print("   Mode: CLEAN BAMBOO-SOURCED (keeps Hub 'Adjusted by' rows)")
    if dry_run:
        print("   DRY RUN (no DB writes)")

    db = SessionLocal()
    stats = {
        "ok": True,
        "users": 0,
        "history_deleted": 0,
        "requests_deleted": 0,
        "balances_deleted": 0,
        "history_kept": 0,
        "errors": 0,
    }
    try:
        users = _iter_users(
            db, user_id=user_id, email=email, limit=limit, for_clean=True
        )
        print(f"   Candidates: {len(users)} Hub user(s) with time-off data")
        for user in users:
            stats["users"] += 1
            label = user.email_personal or user.email_corporate or str(user.id)
            try:
                result = clean_user_time_off(
                    db, user, dry_run=dry_run, clean_all=clean_all
                )
                stats["history_deleted"] += int(result.get("history_deleted") or 0)
                stats["requests_deleted"] += int(result.get("requests_deleted") or 0)
                stats["balances_deleted"] += int(result.get("balances_deleted") or 0)
                stats["history_kept"] += int(result.get("history_kept") or 0)
                print(
                    f"  [CLEAN] {label}: "
                    f"history=-{result.get('history_deleted')} "
                    f"kept={result.get('history_kept')} "
                    f"requests=-{result.get('requests_deleted')} "
                    f"balances=-{result.get('balances_deleted')}"
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
            f"[CLEAN DONE] users={stats['users']} "
            f"history_deleted={stats['history_deleted']} kept={stats['history_kept']} "
            f"requests_deleted={stats['requests_deleted']} "
            f"balances_deleted={stats['balances_deleted']} "
            f"errors={stats['errors']}"
        )
        return stats
    finally:
        db.close()


def sync_all_time_off(
    *,
    dry_run: bool = False,
    limit: int | None = None,
    user_id: str | None = None,
    email: str | None = None,
    skip_balance: bool = False,
    skip_history: bool = False,
) -> dict:
    print("[SYNC] Starting BambooHR time-off synchronization...")
    try:
        client = BambooHRClient()
        print(f"   Connected to: {client.company_domain}.bamboohr.com")
    except Exception as exc:
        print(f"[ERROR] Error initializing BambooHR client: {exc}")
        return {"ok": False, "error": str(exc)}

    db = SessionLocal()
    stats = {
        "ok": True,
        "users": 0,
        "synced": 0,
        "skipped": 0,
        "errors": 0,
        "balance_rows": 0,
        "history_rows": 0,
        "request_rows": 0,
    }
    try:
        users = _iter_users(
            db, user_id=user_id, email=email, limit=limit, for_clean=False
        )
        print(f"   Candidates: {len(users)} Hub user(s)")
        if dry_run:
            print("   Mode: DRY RUN (no DB writes)")

        for user in users:
            stats["users"] += 1
            label = user.email_personal or user.email_corporate or str(user.id)
            try:
                result = sync_user_time_off(
                    db,
                    client,
                    user,
                    dry_run=dry_run,
                    skip_balance=skip_balance,
                    skip_history=skip_history,
                )
                if not result.get("ok"):
                    stats["skipped"] += 1
                    print(f"  [SKIP] {label}: {result.get('error')}")
                    if not dry_run:
                        db.rollback()
                    continue

                bal = (result.get("balance") or {}).get("synced") or 0
                hist = (result.get("history") or {}).get("synced") or 0
                reqs = (result.get("history") or {}).get("requests_synced") or 0
                stats["synced"] += 1
                stats["balance_rows"] += int(bal)
                stats["history_rows"] += int(hist)
                stats["request_rows"] += int(reqs)
                print(
                    f"  [OK] {label} (bamboo={result.get('bamboohr_id')}) "
                    f"balance={bal} history={hist} requests={reqs}"
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
            f"balance_rows={stats['balance_rows']} history_rows={stats['history_rows']} "
            f"request_rows={stats['request_rows']}"
        )
        return stats
    finally:
        db.close()


def main():
    parser = argparse.ArgumentParser(
        description="Clean and/or sync BambooHR time-off into MKHub"
    )
    parser.add_argument("--dry-run", action="store_true", help="Do not write to the database")
    parser.add_argument("--limit", type=int, default=None, help="Max Hub users to process")
    parser.add_argument("--user-id", type=str, default=None, help="Single Hub user UUID")
    parser.add_argument("--email", type=str, default=None, help="Single Hub user by email")
    parser.add_argument("--skip-balance", action="store_true", help="Skip balance sync")
    parser.add_argument("--skip-history", action="store_true", help="Skip history/requests sync")
    parser.add_argument(
        "--clean",
        action="store_true",
        help="Clean Bamboo-sourced time-off data, then sync",
    )
    parser.add_argument(
        "--clean-only",
        action="store_true",
        help="Only clean; do not sync from Bamboo",
    )
    parser.add_argument(
        "--clean-all",
        action="store_true",
        help="With --clean/--clean-only: also delete manual Hub adjustments",
    )
    args = parser.parse_args()

    if args.clean_all and not (args.clean or args.clean_only):
        parser.error("--clean-all requires --clean or --clean-only")

    if args.clean or args.clean_only:
        clean_all_time_off(
            dry_run=args.dry_run,
            limit=args.limit,
            user_id=args.user_id,
            email=args.email,
            clean_all=args.clean_all,
        )

    if args.clean_only:
        return

    sync_all_time_off(
        dry_run=args.dry_run,
        limit=args.limit,
        user_id=args.user_id,
        email=args.email,
        skip_balance=args.skip_balance,
        skip_history=args.skip_history,
    )


if __name__ == "__main__":
    main()
