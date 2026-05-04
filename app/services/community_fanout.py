"""Community post audience resolution and in-app notification fan-out."""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import List, Set

from sqlalchemy import distinct, select
from sqlalchemy.orm import Session

from ..models.models import (
    CommunityPost,
    Notification,
    User,
    user_divisions,
    community_group_members,
)


def audience_user_ids(db: Session, post: CommunityPost) -> List[uuid.UUID]:
    """Users who should see the post (active only). Excludes nobody yet — caller skips author if needed."""
    if post.target_type == "all":
        rows = db.query(User.id).filter(User.is_active == True).all()
        return [r[0] for r in rows]
    division_ids = post.target_division_ids or []
    if isinstance(division_ids, str):
        try:
            division_ids = json.loads(division_ids)
        except Exception:
            division_ids = []
    if not isinstance(division_ids, list) or not division_ids:
        return []
    division_uuids: List[uuid.UUID] = []
    for div_id in division_ids:
        try:
            division_uuids.append(uuid.UUID(str(div_id)))
        except Exception:
            continue
    if not division_uuids:
        return []
    q = (
        db.query(distinct(user_divisions.c.user_id))
        .join(User, User.id == user_divisions.c.user_id)
        .filter(user_divisions.c.division_id.in_(division_uuids), User.is_active == True)
    )
    return [row[0] for row in q.all()]


def group_member_ids(db: Session, group_id: uuid.UUID) -> Set[uuid.UUID]:
    stmt = select(community_group_members.c.user_id).where(community_group_members.c.group_id == group_id)
    rows = db.execute(stmt).all()
    return {row[0] for row in rows}


def resolve_mention_user_ids(db: Session, entity_type: str, entity_id: str) -> Set[uuid.UUID]:
    """Resolve mention targets to user IDs."""
    out: Set[uuid.UUID] = set()
    et = (entity_type or "").strip().lower()
    try:
        eid = str(entity_id).strip()
    except Exception:
        return out
    if et == "user":
        try:
            uid = uuid.UUID(eid)
            u = db.query(User).filter(User.id == uid, User.is_active == True).first()
            if u:
                out.add(uid)
        except Exception:
            pass
        return out
    if et == "division":
        try:
            du = uuid.UUID(eid)
        except Exception:
            return out
        rows = (
            db.query(user_divisions.c.user_id)
            .join(User, User.id == user_divisions.c.user_id)
            .filter(user_divisions.c.division_id == du, User.is_active == True)
            .all()
        )
        out.update(r[0] for r in rows)
        return out
    if et == "community_group":
        try:
            gid = uuid.UUID(eid)
        except Exception:
            return out
        out.update(group_member_ids(db, gid))
        return out
    return out


def _notif_type_for_post(post: CommunityPost) -> str:
    if post.requires_read_confirmation:
        return "community_required"
    if post.priority in ("urgent", "critical"):
        return "community_urgent"
    return "community_post"


def fanout_new_post_notifications(db: Session, post: CommunityPost, batch_size: int = 100) -> None:
    """Create in-app notifications for audience. Idempotent via notifications_sent_at."""
    if post.notifications_sent_at is not None:
        return
    now = datetime.now(timezone.utc)
    audience = audience_user_ids(db, post)
    author_id = post.author_id
    notif_type = _notif_type_for_post(post)
    link = f"/overview?communityPost={post.id}"
    title = "New announcement" if notif_type == "community_post" else (
        "Read confirmation required" if notif_type == "community_required" else "Important announcement"
    )
    message = post.title[:200] if post.title else "Open to view"

    count = 0
    for uid in audience:
        if uid == author_id:
            continue
        n = Notification(
            user_id=uid,
            channel="push",
            template_key=notif_type,
            payload_json={
                "title": title,
                "message": message,
                "type": notif_type,
                "link": link,
                "metadata": {"community_post_id": str(post.id)},
                "read": False,
            },
            status="pending",
            created_at=now,
        )
        db.add(n)
        count += 1
        if count % batch_size == 0:
            db.commit()
    post.notifications_sent_at = now
    db.add(post)
    db.commit()


def process_due_scheduled_notifications(db: Session, limit: int = 20) -> int:
    """Fan-out for scheduled posts that just became visible and never notified."""
    now = datetime.now(timezone.utc)
    due = (
        db.query(CommunityPost)
        .filter(
            CommunityPost.status.in_(["published", "scheduled"]),
            CommunityPost.notifications_sent_at.is_(None),
            CommunityPost.publish_at.isnot(None),
            CommunityPost.publish_at <= now,
        )
        .order_by(CommunityPost.publish_at.asc())
        .limit(limit)
        .all()
    )
    n = 0
    for p in due:
        fanout_new_post_notifications(db, p)
        n += 1
    return n


def notify_users_for_mentions(
    db: Session,
    *,
    user_ids: Set[uuid.UUID],
    title: str,
    message: str,
    link: str,
    exclude_user_id: uuid.UUID | None = None,
    batch_size: int = 100,
) -> None:
    """Notify users mentioned in post or comment."""
    now = datetime.now(timezone.utc)
    count = 0
    for uid in user_ids:
        if exclude_user_id and uid == exclude_user_id:
            continue
        n = Notification(
            user_id=uid,
            channel="push",
            template_key="community_mention",
            payload_json={
                "title": title,
                "message": message[:500],
                "type": "community_mention",
                "link": link,
                "read": False,
            },
            status="pending",
            created_at=now,
        )
        db.add(n)
        count += 1
        if count % batch_size == 0:
            db.commit()
    db.commit()


def notify_comment_reply(
    db: Session,
    *,
    parent_author_id: uuid.UUID,
    reactor_id: uuid.UUID,
    post_id: uuid.UUID,
    preview: str,
) -> None:
    if parent_author_id == reactor_id:
        return
    now = datetime.now(timezone.utc)
    link = f"/overview?communityPost={post_id}"
    n = Notification(
        user_id=parent_author_id,
        channel="push",
        template_key="community_comment_reply",
        payload_json={
            "title": "Reply to your comment",
            "message": preview[:300],
            "type": "community_comment_reply",
            "link": link,
            "read": False,
        },
        status="pending",
        created_at=now,
    )
    db.add(n)
    db.commit()
