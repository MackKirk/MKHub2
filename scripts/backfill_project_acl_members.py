#!/usr/bin/env python3
"""
Backfill project ACL ownership and memberships.
"""
import os
import sys
import uuid
from typing import Optional

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.models.models import AuditLog, Project, ProjectMember, User


def _to_uuid(value) -> Optional[uuid.UUID]:
    if value is None:
        return None
    try:
        return uuid.UUID(str(value))
    except Exception:
        return None


def _ensure_member(
    db: Session,
    project_id: uuid.UUID,
    user_id: uuid.UUID,
    role: Optional[str],
    added_by: Optional[uuid.UUID],
    seen_pairs: set[tuple[uuid.UUID, uuid.UUID]],
) -> None:
    pair = (project_id, user_id)
    if pair in seen_pairs:
        return
    exists = (
        db.query(ProjectMember.id)
        .filter(ProjectMember.project_id == project_id, ProjectMember.user_id == user_id)
        .first()
    )
    if exists:
        seen_pairs.add(pair)
        return
    db.add(
        ProjectMember(
            project_id=project_id,
            user_id=user_id,
            member_role=role,
            added_by_user_id=added_by,
        )
    )
    seen_pairs.add(pair)


def run() -> None:
    db = SessionLocal()
    try:
        active_users = {u.id for u in db.query(User.id).all()}
        seen_pairs: set[tuple[uuid.UUID, uuid.UUID]] = set()
        projects = db.query(Project).filter(Project.deleted_at.is_(None)).all()

        for p in projects:
            creator_id = _to_uuid(getattr(p, "created_by_user_id", None))
            if creator_id is None:
                create_log = (
                    db.query(AuditLog)
                    .filter(
                        AuditLog.entity_type == "project",
                        AuditLog.entity_id == p.id,
                        AuditLog.action == "CREATE",
                    )
                    .order_by(AuditLog.timestamp_utc.asc())
                    .first()
                )
                creator_id = _to_uuid(getattr(create_log, "actor_id", None))
            if creator_id is None:
                creator_id = _to_uuid(getattr(p, "project_admin_id", None)) or _to_uuid(getattr(p, "estimator_id", None))

            if creator_id in active_users:
                p.created_by_user_id = creator_id

            seed_candidates: list[tuple[Optional[uuid.UUID], Optional[str]]] = [
                (_to_uuid(getattr(p, "created_by_user_id", None)), "creator"),
                (_to_uuid(getattr(p, "project_admin_id", None)), "project_admin"),
                (_to_uuid(getattr(p, "estimator_id", None)), "estimator"),
                (_to_uuid(getattr(p, "onsite_lead_id", None)), "onsite_lead"),
            ]

            for raw_id in (getattr(p, "estimator_ids", None) or []):
                seed_candidates.append((_to_uuid(raw_id), "estimator"))

            dol = getattr(p, "division_onsite_leads", None) or {}
            if isinstance(dol, dict):
                for raw_id in dol.values():
                    seed_candidates.append((_to_uuid(raw_id), "onsite_lead"))

            for user_id, role in seed_candidates:
                if user_id is None or user_id not in active_users:
                    continue
                _ensure_member(
                    db,
                    p.id,
                    user_id,
                    role,
                    _to_uuid(getattr(p, "created_by_user_id", None)),
                    seen_pairs,
                )

        db.commit()
        print("Project ACL backfill completed.")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    run()
