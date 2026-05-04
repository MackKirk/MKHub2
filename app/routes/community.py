import json
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import cast, String, func, and_, or_, case, desc, select
from sqlalchemy.orm import aliased

from ..db import get_db
from ..models.models import (
    CommunityPost,
    CommunityPostReadConfirmation,
    CommunityPostView,
    CommunityPostLike,
    CommunityPostComment,
    CommunityMention,
    CommunityGroup,
    community_group_members,
    CommunityGroupTopic,
    User,
    EmployeeProfile,
    user_divisions,
    SettingList,
    SettingItem,
)
from ..auth.security import get_current_user, require_permissions, _has_permission

from ..services.community_fanout import (
    audience_user_ids,
    fanout_new_post_notifications,
    process_due_scheduled_notifications,
    resolve_mention_user_ids,
    notify_users_for_mentions,
    notify_comment_reply,
)

router = APIRouter(prefix="/community", tags=["community"])

VALID_PRIORITIES = frozenset({"normal", "important", "urgent", "critical"})
VALID_RELATED_AREAS = frozenset({
    "general", "projects", "opportunities", "repairs_maintenance",
    "safety", "fleet", "hr", "payroll", "training",
})
VALID_POST_STATUS = frozenset({"draft", "scheduled", "published", "cancelled"})


def _can_manage_post(user: User, post: CommunityPost) -> bool:
    if post.author_id == user.id:
        return True
    return _has_permission(user, "hr:community:write")


def _feed_visibility_filter(now_utc: datetime):
    return and_(
        CommunityPost.status.in_(["published", "scheduled"]),
        func.coalesce(CommunityPost.publish_at, CommunityPost.created_at) <= now_utc,
    )


def _is_feed_visible_post(post: CommunityPost, now_utc: datetime) -> bool:
    if post.status not in ("published", "scheduled"):
        return False
    pa = post.publish_at or post.created_at
    if pa is None:
        return False
    return pa <= now_utc


def _user_audience_match(post: CommunityPost, user_division_ids: List[str]) -> bool:
    if post.target_type == "all":
        return True
    if not user_division_ids:
        return False
    raw = post.target_division_ids or []
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except Exception:
            raw = []
    if not isinstance(raw, list):
        return False
    ids = {str(x) for x in raw}
    return any(d in ids for d in user_division_ids)


def _get_reader_division_ids(db: Session, user_id: uuid.UUID) -> List[str]:
    division_query = select(user_divisions.c.division_id).where(user_divisions.c.user_id == user_id)
    division_results = db.execute(division_query).scalars().all()
    return [str(did) for did in division_results]


def _assert_reader_can_access_post(db: Session, post: CommunityPost, viewer: User) -> None:
    now_utc = datetime.now(timezone.utc)
    if not _is_feed_visible_post(post, now_utc):
        raise HTTPException(status_code=404, detail="Post not found")
    div_ids = _get_reader_division_ids(db, viewer.id)
    if not _user_audience_match(post, div_ids):
        raise HTTPException(status_code=404, detail="Post not found")


def _serialize_community_post(db: Session, post: CommunityPost, viewer: User) -> Dict[str, Any]:
    author = db.query(User).filter(User.id == post.author_id).first()
    author_profile = db.query(EmployeeProfile).filter(EmployeeProfile.user_id == post.author_id).first() if author else None

    author_name = None
    author_avatar = None

    if author_profile:
        author_name = author_profile.preferred_name or f"{author_profile.first_name or ''} {author_profile.last_name or ''}".strip()
        if author_profile.profile_photo_file_id:
            author_avatar = f"/files/{author_profile.profile_photo_file_id}/thumbnail?w=96"

    if not author_name and author:
        author_name = author.username

    view = db.query(CommunityPostView).filter(
        CommunityPostView.post_id == post.id,
        CommunityPostView.user_id == viewer.id,
    ).first()
    is_unread = view is None

    photo_url = None
    if post.photo_file_id:
        photo_url = f"/files/{post.photo_file_id}/thumbnail?w=800"

    document_url = None
    document_file_id = None
    if post.document_file_id:
        document_url = f"/files/{post.document_file_id}"
        document_file_id = str(post.document_file_id)

    post_tags = post.tags or []
    if post.photo_file_id and "Image" not in post_tags:
        post_tags = post_tags + ["Image"]
    if post.document_file_id and "Document" not in post_tags:
        post_tags = post_tags + ["Document"]
    if post.requires_read_confirmation and "Required" not in post_tags:
        post_tags = post_tags + ["Required"]
    if post.priority in ("urgent", "critical") and "Urgent" not in post_tags:
        post_tags = post_tags + ["Urgent"]

    user_has_confirmed = False
    if post.requires_read_confirmation:
        confirmation = db.query(CommunityPostReadConfirmation).filter(
            CommunityPostReadConfirmation.post_id == post.id,
            CommunityPostReadConfirmation.user_id == viewer.id,
        ).first()
        user_has_confirmed = confirmation is not None

    user_has_liked = False
    like = db.query(CommunityPostLike).filter(
        CommunityPostLike.post_id == post.id,
        CommunityPostLike.user_id == viewer.id,
    ).first()
    user_has_liked = like is not None

    actual_likes_count = db.query(CommunityPostLike).filter(CommunityPostLike.post_id == post.id).count()
    actual_comments_count = db.query(CommunityPostComment).filter(CommunityPostComment.post_id == post.id).count()

    is_urgent_legacy = bool(post.is_urgent or post.priority in ("urgent", "critical"))

    return {
        "id": str(post.id),
        "title": post.title,
        "content": post.content,
        "author_id": str(post.author_id),
        "author_name": author_name,
        "author_avatar": author_avatar,
        "photo_url": photo_url,
        "document_url": document_url,
        "document_file_id": document_file_id,
        "created_at": post.created_at.isoformat() if post.created_at else None,
        "updated_at": post.updated_at.isoformat() if post.updated_at else None,
        "publish_at": post.publish_at.isoformat() if post.publish_at else None,
        "status": post.status,
        "priority": post.priority,
        "related_area": post.related_area,
        "tags": post_tags,
        "likes_count": actual_likes_count,
        "comments_count": actual_comments_count,
        "is_required": post.is_required or False,
        "is_unread": is_unread,
        "is_urgent": is_urgent_legacy,
        "requires_read_confirmation": post.requires_read_confirmation or False,
        "user_has_confirmed": user_has_confirmed,
        "user_has_liked": user_has_liked,
        "target_type": post.target_type,
        "target_division_ids": post.target_division_ids or [],
    }


def _replace_post_mentions(db: Session, post_id: uuid.UUID, mentions_raw: Optional[List[dict]], actor_id: uuid.UUID) -> None:
    db.query(CommunityMention).filter(CommunityMention.post_id == post_id).delete()
    mention_targets: Set[uuid.UUID] = set()
    for m in mentions_raw or []:
        if not isinstance(m, dict):
            continue
        et = str(m.get("entity_type", "")).strip().lower()
        eid = str(m.get("entity_id", "")).strip()
        if et not in ("user", "division", "community_group") or not eid:
            continue
        db.add(
            CommunityMention(
                post_id=post_id,
                comment_id=None,
                entity_type=et,
                entity_id=eid,
                created_at=datetime.now(timezone.utc),
            )
        )
        mention_targets |= resolve_mention_user_ids(db, et, eid)
    db.commit()
    link = f"/overview?communityPost={post_id}"
    notify_users_for_mentions(
        db,
        user_ids=mention_targets,
        title="You were mentioned",
        message="Someone mentioned you in a community post",
        link=link,
        exclude_user_id=actor_id,
    )


def _replace_comment_mentions(db: Session, comment_id: uuid.UUID, post_id: uuid.UUID, mentions_raw: Optional[List[dict]], actor_id: uuid.UUID) -> None:
    db.query(CommunityMention).filter(CommunityMention.comment_id == comment_id).delete()
    mention_targets: Set[uuid.UUID] = set()
    for m in mentions_raw or []:
        if not isinstance(m, dict):
            continue
        et = str(m.get("entity_type", "")).strip().lower()
        eid = str(m.get("entity_id", "")).strip()
        if et not in ("user", "division", "community_group") or not eid:
            continue
        db.add(
            CommunityMention(
                post_id=None,
                comment_id=comment_id,
                entity_type=et,
                entity_id=eid,
                created_at=datetime.now(timezone.utc),
            )
        )
        mention_targets |= resolve_mention_user_ids(db, et, eid)
    db.commit()
    link = f"/overview?communityPost={post_id}"
    notify_users_for_mentions(
        db,
        user_ids=mention_targets,
        title="You were mentioned",
        message="Someone mentioned you in a comment",
        link=link,
        exclude_user_id=actor_id,
    )


@router.get("/posts")
def list_posts(
    filter: Optional[str] = None,
    q: Optional[str] = None,
    related_area: Optional[str] = None,
    priority: Optional[str] = None,
    author_id: Optional[str] = None,
    division_id: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    unread_only: Optional[bool] = None,
    required_only: Optional[bool] = None,
    confirmed_only: Optional[bool] = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    List visible community posts for the current user with optional filters.
    """
    try:
        process_due_scheduled_notifications(db, limit=20)
    except Exception:
        # PostgreSQL aborts the transaction on any SQL error; swallowing the
        # exception without rollback leaves the session unusable for reads.
        db.rollback()

    now_utc = datetime.now(timezone.utc)
    division_query = select(user_divisions.c.division_id).where(user_divisions.c.user_id == current_user.id)
    division_results = db.execute(division_query).scalars().all()
    user_division_ids = [str(did) for did in division_results]

    view_for_pin = aliased(CommunityPostView)
    pinned_order = case(
        (
            and_(
                CommunityPost.priority == "critical",
                view_for_pin.id.is_(None),
            ),
            0,
        ),
        else_=1,
    )

    query = (
        db.query(CommunityPost)
        .outerjoin(
            view_for_pin,
            and_(
                view_for_pin.post_id == CommunityPost.id,
                view_for_pin.user_id == current_user.id,
            ),
        )
        .filter(_feed_visibility_filter(now_utc))
        .order_by(
            pinned_order,
            desc(func.coalesce(CommunityPost.publish_at, CommunityPost.created_at)),
        )
    )

    if user_division_ids:
        division_filters = []
        for div_id in user_division_ids:
            division_filters.append(cast(CommunityPost.target_division_ids, String).like(f"%{div_id}%"))
        query = query.filter(
            or_(
                CommunityPost.target_type == "all",
                *division_filters if division_filters else [CommunityPost.id == None],
            )
        )
    else:
        query = query.filter(CommunityPost.target_type == "all")

    eff_unread = unread_only or filter == "unread"
    eff_required = required_only or filter == "required"

    if eff_unread:
        viewed_post_ids = select(CommunityPostView.post_id).where(CommunityPostView.user_id == current_user.id)
        query = query.filter(~CommunityPost.id.in_(viewed_post_ids))
    if eff_required:
        query = query.filter(CommunityPost.requires_read_confirmation == True)
    if filter == "announcements":
        query = query.filter(cast(CommunityPost.tags, String).like("%Announcement%"))
    if filter == "urgent":
        query = query.filter(
            or_(
                CommunityPost.priority.in_(["urgent", "critical"]),
                CommunityPost.is_urgent == True,
            )
        )

    if q and q.strip():
        term = f"%{q.strip()}%"
        query = query.filter(or_(CommunityPost.title.ilike(term), CommunityPost.content.ilike(term)))

    if related_area and related_area.strip():
        query = query.filter(CommunityPost.related_area == related_area.strip())

    if priority and priority.strip():
        parts = [p.strip() for p in priority.split(",") if p.strip()]
        if parts:
            query = query.filter(CommunityPost.priority.in_(parts))

    if author_id:
        try:
            query = query.filter(CommunityPost.author_id == uuid.UUID(str(author_id)))
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid author_id")

    if division_id:
        div_s = str(division_id).strip()
        query = query.filter(
            or_(
                CommunityPost.target_type == "all",
                cast(CommunityPost.target_division_ids, String).like(f"%{div_s}%"),
            )
        )

    if date_from:
        try:
            df = datetime.fromisoformat(date_from.replace("Z", "+00:00"))
            query = query.filter(func.coalesce(CommunityPost.publish_at, CommunityPost.created_at) >= df)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid date_from")

    if date_to:
        try:
            dt = datetime.fromisoformat(date_to.replace("Z", "+00:00"))
            query = query.filter(func.coalesce(CommunityPost.publish_at, CommunityPost.created_at) <= dt)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid date_to")

    if confirmed_only:
        confirmed_posts = select(CommunityPostReadConfirmation.post_id).where(
            CommunityPostReadConfirmation.user_id == current_user.id
        )
        query = query.filter(CommunityPost.id.in_(confirmed_posts))

    posts = query.offset(offset).limit(limit).all()
    return [_serialize_community_post(db, post, current_user) for post in posts]


@router.get("/posts/mentions/suggest")
def suggest_mentions(
    q: str = Query("", min_length=0),
    limit: int = Query(25, ge=1, le=50),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Autocomplete for @mentions: users, divisions (settings), community groups."""
    term = (q or "").strip().lower()
    items: List[dict] = []

    profs = (
        db.query(EmployeeProfile, User)
        .join(User, User.id == EmployeeProfile.user_id)
        .filter(User.is_active == True)
        .limit(300)
        .all()
    )
    for ep, u in profs:
        label = ep.preferred_name or f"{ep.first_name or ''} {ep.last_name or ''}".strip() or u.username or ""
        hay = f"{label} {u.username or ''}".lower()
        if term and term not in hay:
            continue
        items.append(
            {
                "kind": "user",
                "entity_type": "user",
                "entity_id": str(u.id),
                "label": label or u.username,
                "subtitle": u.username,
            }
        )
        if len(items) >= limit:
            return items[:limit]

    dl = db.query(SettingList).filter(SettingList.name == "divisions").first()
    if dl:
        for row in (
            db.query(SettingItem)
            .filter(SettingItem.list_id == dl.id)
            .order_by(SettingItem.sort_index.asc())
            .limit(100)
            .all()
        ):
            label = row.label or ""
            if term and term not in label.lower():
                continue
            items.append(
                {
                    "kind": "division",
                    "entity_type": "division",
                    "entity_id": str(row.id),
                    "label": label,
                    "subtitle": "Division",
                }
            )
            if len(items) >= limit:
                return items[:limit]

    for g in db.query(CommunityGroup).order_by(CommunityGroup.name.asc()).limit(80).all():
        if term and term not in (g.name or "").lower():
            continue
        items.append(
            {
                "kind": "group",
                "entity_type": "community_group",
                "entity_id": str(g.id),
                "label": g.name,
                "subtitle": "Group",
            }
        )
        if len(items) >= limit:
            break

    return items[:limit]


@router.post("/posts")
def create_post(
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permissions("hr:community:write")),
):
    """
    Create a new community post/announcement.
    publish_mode: now | scheduled | draft
    """
    title = payload.get("title", "").strip()
    content = payload.get("content", "").strip()
    photo_file_id = payload.get("photo_file_id")
    document_file_id = payload.get("document_file_id")
    target_type = payload.get("target_type", "all")
    target_division_ids = payload.get("target_division_ids", [])
    publish_mode = (payload.get("publish_mode") or "now").strip().lower()
    if publish_mode not in ("now", "scheduled", "draft"):
        raise HTTPException(status_code=400, detail="publish_mode must be now, scheduled, or draft")

    priority = (payload.get("priority") or "normal").strip().lower()
    if priority not in VALID_PRIORITIES:
        raise HTTPException(status_code=400, detail="Invalid priority")

    related_area = (payload.get("related_area") or "general").strip().lower()
    if related_area not in VALID_RELATED_AREAS:
        raise HTTPException(status_code=400, detail="Invalid related_area")

    is_urgent = payload.get("is_urgent")
    if is_urgent is None:
        is_urgent = priority in ("urgent", "critical")
    else:
        is_urgent = bool(is_urgent)

    if not title:
        raise HTTPException(status_code=400, detail="Title is required")

    if not content:
        raise HTTPException(status_code=400, detail="Content is required")

    if target_type not in ["all", "divisions"]:
        raise HTTPException(status_code=400, detail="target_type must be 'all' or 'divisions'")

    if target_type == "divisions":
        if not target_division_ids or not isinstance(target_division_ids, list) or len(target_division_ids) == 0:
            raise HTTPException(status_code=400, detail="target_division_ids must be a non-empty list when target_type is 'divisions'")
        target_division_ids = [str(did) for did in target_division_ids]

    if photo_file_id:
        try:
            uuid.UUID(str(photo_file_id))
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid photo_file_id format")

    if document_file_id:
        try:
            uuid.UUID(str(document_file_id))
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid document_file_id format")

    tags = ["Announcement"]
    if is_urgent or priority in ("urgent", "critical"):
        tags.append("Urgent")
    if photo_file_id:
        tags.append("Image")
    if document_file_id:
        tags.append("Document")

    custom_tags = payload.get("tags", [])
    if isinstance(custom_tags, list):
        for tag in custom_tags:
            if tag not in tags:
                tags.append(tag)

    now = datetime.now(timezone.utc)
    status = "published"
    publish_at: Optional[datetime] = now

    if publish_mode == "draft":
        status = "draft"
        publish_at = None
    elif publish_mode == "scheduled":
        status = "scheduled"
        raw_pa = payload.get("publish_at")
        if not raw_pa:
            raise HTTPException(status_code=400, detail="publish_at is required for scheduled posts")
        try:
            publish_at = datetime.fromisoformat(str(raw_pa).replace("Z", "+00:00"))
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid publish_at")
        if publish_at.tzinfo is None:
            publish_at = publish_at.replace(tzinfo=timezone.utc)

    post = CommunityPost(
        title=title,
        content=content,
        author_id=current_user.id,
        photo_file_id=uuid.UUID(str(photo_file_id)) if photo_file_id else None,
        document_file_id=uuid.UUID(str(document_file_id)) if document_file_id else None,
        is_urgent=is_urgent,
        is_required=payload.get("is_required", False),
        requires_read_confirmation=payload.get("requires_read_confirmation", False),
        target_type=target_type,
        target_division_ids=target_division_ids if target_type == "divisions" else [],
        tags=tags,
        created_at=now,
        updated_at=now,
        status=status,
        publish_at=publish_at,
        priority=priority,
        related_area=related_area,
        notifications_sent_at=None,
    )

    db.add(post)
    db.commit()
    db.refresh(post)

    _replace_post_mentions(db, post.id, payload.get("mentions"), current_user.id)

    pa_eff = post.publish_at or post.created_at
    if post.status in ("published", "scheduled") and pa_eff and pa_eff <= now:
        try:
            fanout_new_post_notifications(db, post)
        except Exception:
            pass

    return _serialize_community_post(db, post, current_user)


@router.get("/posts/my-posts")
def list_my_posts(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    List all posts created by the current user (for history).
    Must be registered before GET /posts/{post_id} so "my-posts" is not captured as a UUID.
    """
    posts = (
        db.query(CommunityPost)
        .filter(CommunityPost.author_id == current_user.id)
        .order_by(CommunityPost.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    result = []
    for post in posts:
        author = db.query(User).filter(User.id == post.author_id).first()
        author_profile = db.query(EmployeeProfile).filter(EmployeeProfile.user_id == post.author_id).first() if author else None

        author_name = None
        author_avatar = None

        if author_profile:
            author_name = author_profile.preferred_name or f"{author_profile.first_name or ''} {author_profile.last_name or ''}".strip()
            if author_profile.profile_photo_file_id:
                author_avatar = f"/files/{author_profile.profile_photo_file_id}/thumbnail?w=96"

        if not author_name and author:
            author_name = author.username

        photo_url = None
        if post.photo_file_id:
            photo_url = f"/files/{post.photo_file_id}/thumbnail?w=800"

        # Build document URL if exists
        document_url = None
        document_file_id = None
        if post.document_file_id:
            document_url = f"/files/{post.document_file_id}"
            document_file_id = str(post.document_file_id)

        post_tags = post.tags or []
        if post.photo_file_id and 'Image' not in post_tags:
            post_tags = post_tags + ['Image']
        if post.document_file_id and 'Document' not in post_tags:
            post_tags = post_tags + ['Document']

        # Add Required tag if requires read confirmation
        if post.requires_read_confirmation and 'Required' not in post_tags:
            post_tags = post_tags + ['Required']

        # Get read confirmations count
        confirmations_count = db.query(CommunityPostReadConfirmation).filter(
            CommunityPostReadConfirmation.post_id == post.id
        ).count()

        # Get views count
        views_count = db.query(CommunityPostView).filter(
            CommunityPostView.post_id == post.id
        ).count()

        # Calculate total recipients count
        total_recipients = 0
        if post.target_type == 'all':
            # Count all active users
            total_recipients = db.query(User).filter(User.is_active == True).count()
        elif post.target_type == 'divisions' and post.target_division_ids:
            # Count users in the specified divisions
            # Parse target_division_ids (JSON array)
            import json
            try:
                division_ids = post.target_division_ids
                if isinstance(division_ids, str):
                    division_ids = json.loads(division_ids)
                if isinstance(division_ids, list) and len(division_ids) > 0:
                    # Convert to UUIDs for querying
                    division_uuids = []
                    for div_id in division_ids:
                        try:
                            division_uuids.append(uuid.UUID(str(div_id)))
                        except Exception:
                            pass

                    if division_uuids:
                        # Count distinct users in these divisions
                        from sqlalchemy import distinct
                        total_recipients = db.query(distinct(user_divisions.c.user_id)).filter(
                            user_divisions.c.division_id.in_(division_uuids)
                        ).count()
            except Exception:
                # If parsing fails, default to 0
                total_recipients = 0

        pa = getattr(post, "publish_at", None)
        result.append({
            "id": str(post.id),
            "title": post.title,
            "content": post.content,
            "author_id": str(post.author_id),
            "author_name": author_name,
            "author_avatar": author_avatar,
            "photo_url": photo_url,
            "document_url": document_url,
            "document_file_id": document_file_id,
            "created_at": post.created_at.isoformat() if post.created_at else None,
            "publish_at": pa.isoformat() if pa else None,
            "status": getattr(post, "status", "published"),
            "priority": getattr(post, "priority", "normal"),
            "related_area": getattr(post, "related_area", "general"),
            "target_type": post.target_type,
            "target_division_ids": post.target_division_ids or [],
            "tags": post_tags,
            "likes_count": post.likes_count or 0,
            "comments_count": post.comments_count or 0,
            "is_required": post.is_required or False,
            "is_urgent": post.is_urgent or getattr(post, "priority", "") in ("urgent", "critical"),
            "requires_read_confirmation": post.requires_read_confirmation or False,
            "confirmations_count": confirmations_count,
            "views_count": views_count,
            "total_recipients": total_recipients,
        })

    return result


@router.get("/posts/{post_id}")
def get_community_post(
    post_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        post_uuid = uuid.UUID(str(post_id))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid post_id format")
    post = db.query(CommunityPost).filter(CommunityPost.id == post_uuid).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    # Author always sees own post (incl. published targeted at divisions they're not in).
    if post.author_id == current_user.id:
        return _serialize_community_post(db, post, current_user)
    if _has_permission(current_user, "hr:community:write"):
        return _serialize_community_post(db, post, current_user)
    _assert_reader_can_access_post(db, post, current_user)
    return _serialize_community_post(db, post, current_user)


@router.patch("/posts/{post_id}")
def patch_community_post(
    post_id: str,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        post_uuid = uuid.UUID(str(post_id))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid post_id format")
    post = db.query(CommunityPost).filter(CommunityPost.id == post_uuid).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    if not _can_manage_post(current_user, post):
        raise HTTPException(status_code=403, detail="Forbidden")

    now = datetime.now(timezone.utc)
    if "title" in payload:
        post.title = str(payload.get("title") or "").strip()
    if "content" in payload:
        post.content = str(payload.get("content") or "").strip()
    if not post.title or not post.content:
        raise HTTPException(status_code=400, detail="Title and content are required")

    if "photo_file_id" in payload:
        pf = payload.get("photo_file_id")
        post.photo_file_id = uuid.UUID(str(pf)) if pf else None
    if "document_file_id" in payload:
        df = payload.get("document_file_id")
        post.document_file_id = uuid.UUID(str(df)) if df else None

    if "target_type" in payload:
        tt = payload.get("target_type")
        if tt not in ("all", "divisions"):
            raise HTTPException(status_code=400, detail="Invalid target_type")
        post.target_type = tt
    if "target_division_ids" in payload and post.target_type == "divisions":
        tdi = payload.get("target_division_ids") or []
        if not isinstance(tdi, list) or len(tdi) == 0:
            raise HTTPException(status_code=400, detail="target_division_ids required for divisions")
        post.target_division_ids = [str(x) for x in tdi]
    elif post.target_type == "all":
        post.target_division_ids = []

    if "priority" in payload:
        pr = str(payload.get("priority") or "").lower()
        if pr not in VALID_PRIORITIES:
            raise HTTPException(status_code=400, detail="Invalid priority")
        post.priority = pr
        post.is_urgent = pr in ("urgent", "critical")

    if "related_area" in payload:
        ra = str(payload.get("related_area") or "").lower()
        if ra not in VALID_RELATED_AREAS:
            raise HTTPException(status_code=400, detail="Invalid related_area")
        post.related_area = ra

    if "requires_read_confirmation" in payload:
        post.requires_read_confirmation = bool(payload.get("requires_read_confirmation"))

    if "publish_mode" in payload:
        mode = str(payload.get("publish_mode") or "").lower()
        if mode not in ("draft", "scheduled", "now"):
            raise HTTPException(status_code=400, detail="Invalid publish_mode")
        # Editing an already-published post: clients still send publish_mode "now"; do not bump publish_at.
        if post.status == "published" and mode == "now":
            pass
        elif post.status == "published" and mode == "draft":
            post.status = "draft"
            post.publish_at = None
            post.notifications_sent_at = None  # republicar pode voltar a enviar notificações
        elif post.status == "published" and mode == "scheduled":
            post.status = "scheduled"
            raw_pa = payload.get("publish_at")
            if not raw_pa:
                raise HTTPException(status_code=400, detail="publish_at required for scheduled")
            pa = datetime.fromisoformat(str(raw_pa).replace("Z", "+00:00"))
            if pa.tzinfo is None:
                pa = pa.replace(tzinfo=timezone.utc)
            post.publish_at = pa
        elif mode == "draft":
            post.status = "draft"
            post.publish_at = None
        elif mode == "scheduled":
            post.status = "scheduled"
            raw_pa = payload.get("publish_at")
            if not raw_pa:
                raise HTTPException(status_code=400, detail="publish_at required for scheduled")
            pa = datetime.fromisoformat(str(raw_pa).replace("Z", "+00:00"))
            if pa.tzinfo is None:
                pa = pa.replace(tzinfo=timezone.utc)
            post.publish_at = pa
        elif mode == "now":
            post.status = "published"
            post.publish_at = now

    if "publish_at" in payload and payload.get("publish_mode") is None and post.status == "scheduled":
        raw_pa = payload.get("publish_at")
        if raw_pa:
            pa = datetime.fromisoformat(str(raw_pa).replace("Z", "+00:00"))
            if pa.tzinfo is None:
                pa = pa.replace(tzinfo=timezone.utc)
            post.publish_at = pa

    post.updated_at = now
    _rebuild_post_tags(post)

    db.add(post)
    db.commit()
    db.refresh(post)

    if "mentions" in payload:
        _replace_post_mentions(db, post.id, payload.get("mentions"), current_user.id)

    pa_eff = post.publish_at or post.created_at
    if post.status in ("published", "scheduled") and pa_eff and pa_eff <= now and post.notifications_sent_at is None:
        try:
            fanout_new_post_notifications(db, post)
        except Exception:
            pass

    return _serialize_community_post(db, post, current_user)


def _rebuild_post_tags(post: CommunityPost) -> None:
    tags = ["Announcement"]
    if post.is_urgent or (post.priority in ("urgent", "critical")):
        tags.append("Urgent")
    if post.photo_file_id:
        tags.append("Image")
    if post.document_file_id:
        tags.append("Document")
    old = post.tags or []
    for t in old:
        if t not in tags and t not in ("Announcement", "Urgent", "Image", "Document", "Required"):
            tags.append(t)
    if post.requires_read_confirmation:
        tags.append("Required")
    post.tags = tags


@router.post("/posts/{post_id}/publish")
def publish_community_post(
    post_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        post_uuid = uuid.UUID(str(post_id))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid post_id format")
    post = db.query(CommunityPost).filter(CommunityPost.id == post_uuid).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    if not _can_manage_post(current_user, post):
        raise HTTPException(status_code=403, detail="Forbidden")

    now = datetime.now(timezone.utc)
    if post.status == "cancelled":
        post.notifications_sent_at = None
    post.status = "published"
    post.publish_at = now
    post.updated_at = now
    _rebuild_post_tags(post)
    db.add(post)
    db.commit()
    db.refresh(post)
    try:
        fanout_new_post_notifications(db, post)
    except Exception:
        pass
    return _serialize_community_post(db, post, current_user)


@router.post("/posts/{post_id}/cancel")
def cancel_community_post(
    post_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        post_uuid = uuid.UUID(str(post_id))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid post_id format")
    post = db.query(CommunityPost).filter(CommunityPost.id == post_uuid).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    if not _can_manage_post(current_user, post):
        raise HTTPException(status_code=403, detail="Forbidden")

    post.status = "cancelled"
    post.updated_at = datetime.now(timezone.utc)
    db.add(post)
    db.commit()
    db.refresh(post)
    return _serialize_community_post(db, post, current_user)


@router.delete("/posts/{post_id}")
def delete_community_post(
    post_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        post_uuid = uuid.UUID(str(post_id))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid post_id format")
    post = db.query(CommunityPost).filter(CommunityPost.id == post_uuid).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    if not _can_manage_post(current_user, post):
        raise HTTPException(status_code=403, detail="Forbidden")

    db.delete(post)
    db.commit()
    return {"status": "deleted"}


@router.post("/posts/{post_id}/mark-viewed")
def mark_viewed(
    post_id: str,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    Mark that the current user has viewed the post (marks it as read).
    """
    try:
        post_uuid = uuid.UUID(str(post_id))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid post_id format")
    
    post = db.query(CommunityPost).filter(CommunityPost.id == post_uuid).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    _assert_reader_can_access_post(db, post, current_user)

    # Check if already viewed
    existing = db.query(CommunityPostView).filter(
        CommunityPostView.post_id == post_uuid,
        CommunityPostView.user_id == current_user.id
    ).first()
    
    if existing:
        return {"status": "already_viewed", "viewed_at": existing.viewed_at.isoformat()}
    
    # Create view record
    view = CommunityPostView(
        post_id=post_uuid,
        user_id=current_user.id,
        viewed_at=datetime.now(timezone.utc)
    )
    
    db.add(view)
    db.commit()
    db.refresh(view)
    
    return {
        "status": "viewed",
        "viewed_at": view.viewed_at.isoformat()
    }


@router.post("/posts/{post_id}/confirm-read")
def confirm_read(
    post_id: str,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    Confirm that the current user has read the post.
    """
    try:
        post_uuid = uuid.UUID(str(post_id))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid post_id format")
    
    post = db.query(CommunityPost).filter(CommunityPost.id == post_uuid).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    _assert_reader_can_access_post(db, post, current_user)

    # Check if already confirmed
    existing = db.query(CommunityPostReadConfirmation).filter(
        CommunityPostReadConfirmation.post_id == post_uuid,
        CommunityPostReadConfirmation.user_id == current_user.id
    ).first()
    
    if existing:
        return {"status": "already_confirmed", "confirmed_at": existing.confirmed_at.isoformat()}
    
    # Create confirmation
    confirmation = CommunityPostReadConfirmation(
        post_id=post_uuid,
        user_id=current_user.id,
        confirmed_at=datetime.now(timezone.utc)
    )
    
    db.add(confirmation)
    db.commit()
    db.refresh(confirmation)
    
    return {
        "status": "confirmed",
        "confirmed_at": confirmation.confirmed_at.isoformat()
    }


@router.get("/posts/{post_id}/read-confirmations")
def list_read_confirmations(
    post_id: str,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    List all users who confirmed reading a post. Only the post author can view this.
    """
    try:
        post_uuid = uuid.UUID(str(post_id))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid post_id format")
    
    post = db.query(CommunityPost).filter(CommunityPost.id == post_uuid).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")

    if post.author_id != current_user.id and not _has_permission(current_user, "hr:community:write"):
        raise HTTPException(status_code=403, detail="Only post author or HR community editors can view read confirmations")
    
    confirmations = db.query(CommunityPostReadConfirmation).filter(
        CommunityPostReadConfirmation.post_id == post_uuid
    ).order_by(CommunityPostReadConfirmation.confirmed_at.desc()).all()
    
    result = []
    for conf in confirmations:
        user = db.query(User).filter(User.id == conf.user_id).first()
        user_profile = db.query(EmployeeProfile).filter(EmployeeProfile.user_id == conf.user_id).first() if user else None
        
        user_name = None
        user_avatar = None
        
        if user_profile:
            user_name = user_profile.preferred_name or f"{user_profile.first_name or ''} {user_profile.last_name or ''}".strip()
            if user_profile.profile_photo_file_id:
                user_avatar = f"/files/{user_profile.profile_photo_file_id}/thumbnail?w=96"
        
        if not user_name and user:
            user_name = user.username
        
        result.append({
            "user_id": str(conf.user_id),
            "user_name": user_name,
            "user_avatar": user_avatar,
            "confirmed_at": conf.confirmed_at.isoformat() if conf.confirmed_at else None,
        })
    
    return result


@router.post("/posts/{post_id}/like")
def toggle_like(
    post_id: str,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    Toggle like on a post. If user has already liked, remove the like. Otherwise, add a like.
    """
    try:
        post_uuid = uuid.UUID(str(post_id))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid post_id format")
    
    post = db.query(CommunityPost).filter(CommunityPost.id == post_uuid).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    _assert_reader_can_access_post(db, post, current_user)

    # Check if user has already liked
    existing_like = db.query(CommunityPostLike).filter(
        CommunityPostLike.post_id == post_uuid,
        CommunityPostLike.user_id == current_user.id
    ).first()
    
    if existing_like:
        # Remove like
        db.delete(existing_like)
        db.commit()
        action = "unliked"
    else:
        # Add like
        like = CommunityPostLike(
            post_id=post_uuid,
            user_id=current_user.id,
            liked_at=datetime.now(timezone.utc)
        )
        db.add(like)
        db.commit()
        action = "liked"
    
    # Get updated likes count
    likes_count = db.query(CommunityPostLike).filter(
        CommunityPostLike.post_id == post_uuid
    ).count()
    
    return {
        "status": action,
        "likes_count": likes_count,
        "user_has_liked": action == "liked"
    }


@router.get("/posts/{post_id}/comments")
def list_comments(
    post_id: str,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    List all comments on a post.
    """
    try:
        post_uuid = uuid.UUID(str(post_id))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid post_id format")
    
    post = db.query(CommunityPost).filter(CommunityPost.id == post_uuid).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    _assert_reader_can_access_post(db, post, current_user)

    comments = db.query(CommunityPostComment).filter(
        CommunityPostComment.post_id == post_uuid
    ).order_by(CommunityPostComment.created_at.asc()).all()
    
    result = []
    for comment in comments:
        user = db.query(User).filter(User.id == comment.user_id).first()
        user_profile = db.query(EmployeeProfile).filter(EmployeeProfile.user_id == comment.user_id).first() if user else None
        
        user_name = None
        user_avatar = None
        
        if user_profile:
            user_name = user_profile.preferred_name or f"{user_profile.first_name or ''} {user_profile.last_name or ''}".strip()
            if user_profile.profile_photo_file_id:
                user_avatar = f"/files/{user_profile.profile_photo_file_id}/thumbnail?w=96"
        
        if not user_name and user:
            user_name = user.username
        
        result.append({
            "id": str(comment.id),
            "user_id": str(comment.user_id),
            "user_name": user_name,
            "user_avatar": user_avatar,
            "content": comment.content,
            "parent_comment_id": str(comment.parent_comment_id) if getattr(comment, "parent_comment_id", None) else None,
            "created_at": comment.created_at.isoformat() if comment.created_at else None,
            "updated_at": comment.updated_at.isoformat() if comment.updated_at else None,
        })
    
    return result


@router.post("/posts/{post_id}/comments")
def create_comment(
    post_id: str,
    payload: dict,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    Create a comment on a post.
    """
    try:
        post_uuid = uuid.UUID(str(post_id))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid post_id format")
    
    post = db.query(CommunityPost).filter(CommunityPost.id == post_uuid).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    _assert_reader_can_access_post(db, post, current_user)

    content = payload.get("content", "").strip()
    if not content:
        raise HTTPException(status_code=400, detail="Comment content is required")

    parent_comment_id = payload.get("parent_comment_id")
    parent_uuid = None
    parent_comment = None
    if parent_comment_id:
        try:
            parent_uuid = uuid.UUID(str(parent_comment_id))
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid parent_comment_id")
        parent_comment = db.query(CommunityPostComment).filter(
            CommunityPostComment.id == parent_uuid,
            CommunityPostComment.post_id == post_uuid,
        ).first()
        if not parent_comment:
            raise HTTPException(status_code=400, detail="Invalid parent comment")

    comment = CommunityPostComment(
        post_id=post_uuid,
        user_id=current_user.id,
        parent_comment_id=parent_uuid,
        content=content,
        created_at=datetime.now(timezone.utc)
    )
    
    db.add(comment)
    db.commit()
    db.refresh(comment)

    if parent_comment and parent_comment.user_id != current_user.id:
        try:
            notify_comment_reply(
                db,
                parent_author_id=parent_comment.user_id,
                reactor_id=current_user.id,
                post_id=post_uuid,
                preview=content,
            )
        except Exception:
            pass

    if payload.get("mentions"):
        _replace_comment_mentions(db, comment.id, post_uuid, payload.get("mentions"), current_user.id)
    
    # Get comment author info
    user = db.query(User).filter(User.id == current_user.id).first()
    user_profile = db.query(EmployeeProfile).filter(EmployeeProfile.user_id == current_user.id).first() if user else None
    
    user_name = None
    user_avatar = None
    
    if user_profile:
        user_name = user_profile.preferred_name or f"{user_profile.first_name or ''} {user_profile.last_name or ''}".strip()
        if user_profile.profile_photo_file_id:
            user_avatar = f"/files/{user_profile.profile_photo_file_id}/thumbnail?w=96"
    
    if not user_name and user:
        user_name = user.username
    
    # Get updated comments count
    comments_count = db.query(CommunityPostComment).filter(
        CommunityPostComment.post_id == post_uuid
    ).count()
    
    return {
        "id": str(comment.id),
        "user_id": str(comment.user_id),
        "user_name": user_name,
        "user_avatar": user_avatar,
        "content": comment.content,
        "parent_comment_id": str(comment.parent_comment_id) if comment.parent_comment_id else None,
        "created_at": comment.created_at.isoformat() if comment.created_at else None,
        "updated_at": comment.updated_at.isoformat() if comment.updated_at else None,
        "comments_count": comments_count,
    }


@router.get("/posts/{post_id}/recipients-pending")
def list_recipients_pending(
    post_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Users in audience who have not confirmed reading (for required-read posts)."""
    try:
        post_uuid = uuid.UUID(str(post_id))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid post_id format")
    post = db.query(CommunityPost).filter(CommunityPost.id == post_uuid).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    if post.author_id != current_user.id and not _has_permission(current_user, "hr:community:write"):
        raise HTTPException(status_code=403, detail="Forbidden")
    if not post.requires_read_confirmation:
        return {"pending": [], "total_audience": 0}

    audience = set(audience_user_ids(db, post))
    confirmed_ids = {
        r[0]
        for r in db.query(CommunityPostReadConfirmation.user_id)
        .filter(CommunityPostReadConfirmation.post_id == post_uuid)
        .all()
    }
    pending_ids = [uid for uid in audience if uid not in confirmed_ids]

    out = []
    for uid in pending_ids:
        user = db.query(User).filter(User.id == uid).first()
        ep = db.query(EmployeeProfile).filter(EmployeeProfile.user_id == uid).first()
        name = None
        if ep:
            name = ep.preferred_name or f"{ep.first_name or ''} {ep.last_name or ''}".strip()
        if not name and user:
            name = user.username
        out.append({"user_id": str(uid), "user_name": name or "Unknown"})

    return {"pending": out, "total_audience": len(audience), "pending_count": len(out)}


@router.get("/insights")
def community_insights(
    date_from: Optional[str] = Query(None, alias="from"),
    date_to: Optional[str] = Query(None, alias="to"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permissions("hr:community:write")),
):
    """Aggregate community metrics for HR (published posts in date range)."""
    if not date_from or not date_to:
        raise HTTPException(status_code=400, detail="from and to query params are required (YYYY-MM-DD)")
    try:
        df = datetime.fromisoformat(date_from.replace("Z", "+00:00"))
        dt = datetime.fromisoformat(date_to.replace("Z", "+00:00"))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid date range")

    posts = (
        db.query(CommunityPost)
        .filter(
            CommunityPost.status.in_(["published", "scheduled", "cancelled"]),
            func.coalesce(CommunityPost.publish_at, CommunityPost.created_at) >= df,
            func.coalesce(CommunityPost.publish_at, CommunityPost.created_at) <= dt,
        )
        .all()
    )

    posts_made = len([p for p in posts if p.status == "published"])
    post_views = db.query(CommunityPostView).count()
    comments_made = db.query(CommunityPostComment).count()
    likes_total = db.query(CommunityPostLike).count()

    active_members = db.query(CommunityPostView.user_id).distinct().count()

    posting_activity = []
    by_day: Dict[str, int] = {}
    for p in posts:
        if p.status != "published":
            continue
        key = (p.publish_at or p.created_at).strftime("%Y-%m-%d") if (p.publish_at or p.created_at) else ""
        by_day[key] = by_day.get(key, 0) + 1
    for k in sorted(by_day.keys()):
        posting_activity.append({"date": k, "count": by_day[k]})

    top_posts = []
    for p in posts:
        if p.status != "published":
            continue
        vc = db.query(CommunityPostView).filter(CommunityPostView.post_id == p.id).count()
        cc = db.query(CommunityPostComment).filter(CommunityPostComment.post_id == p.id).count()
        lc = db.query(CommunityPostLike).filter(CommunityPostLike.post_id == p.id).count()
        rc = db.query(CommunityPostReadConfirmation).filter(CommunityPostReadConfirmation.post_id == p.id).count()
        aud = len(audience_user_ids(db, p))
        read_rate = (vc / aud * 100.0) if aud else 0.0
        conf_rate = (rc / aud * 100.0) if aud and p.requires_read_confirmation else None
        top_posts.append({
            "post_id": str(p.id),
            "title": p.title,
            "related_area": getattr(p, "related_area", "general"),
            "priority": getattr(p, "priority", "normal"),
            "views": vc,
            "comments": cc,
            "likes": lc,
            "confirmations": rc,
            "audience": aud,
            "read_rate_pct": round(read_rate, 1),
            "confirmation_rate_pct": round(conf_rate, 1) if conf_rate is not None else None,
            "requires_read_confirmation": p.requires_read_confirmation,
        })
    top_posts.sort(key=lambda x: (x["likes"] + x["comments"], x["views"]), reverse=True)
    top_posts = top_posts[:25]

    area_engagement: Dict[str, Dict[str, float]] = {}
    for row in top_posts:
        area = row["related_area"]
        area_engagement.setdefault(area, {"posts": 0, "views": 0, "likes": 0, "comments": 0})
        area_engagement[area]["posts"] += 1
        area_engagement[area]["views"] += row["views"]
        area_engagement[area]["likes"] += row["likes"]
        area_engagement[area]["comments"] += row["comments"]

    ignored_posts = []
    for p in posts:
        if p.status != "published" or not p.requires_read_confirmation:
            continue
        aud = len(audience_user_ids(db, p))
        rc = db.query(CommunityPostReadConfirmation).filter(CommunityPostReadConfirmation.post_id == p.id).count()
        if aud and rc < aud:
            ignored_posts.append({
                "post_id": str(p.id),
                "title": p.title,
                "pending_confirmations": aud - rc,
            })

    total_members = db.query(User).filter(User.is_active == True).count()

    return {
        "posts_made": posts_made,
        "post_views": post_views,
        "active_members": active_members,
        "comments_made": comments_made,
        "likes_total": likes_total,
        "views_via_website": post_views,
        "views_via_email": 0,
        "views_via_mobile": 0,
        "email_opened": 0,
        "email_clicked": 0,
        "posting_activity": posting_activity,
        "top_posts": top_posts,
        "ignored_posts": ignored_posts[:50],
        "member_distribution": {
            "active_percentage": round((active_members / total_members * 100.0), 1) if total_members else 0,
            "active_count": active_members,
            "total_members": total_members,
            "avg_posts_per_user": round(posts_made / max(active_members, 1), 2),
            "avg_comments_per_user": round(comments_made / max(active_members, 1), 2),
        },
        "engagement_by_area": area_engagement,
    }


@router.get("/groups")
def list_groups(
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    List all community groups.
    """
    groups = db.query(CommunityGroup).order_by(CommunityGroup.created_at.desc()).all()
    
    result = []
    for group in groups:
        # Count members
        member_count = db.query(community_group_members).filter(
            community_group_members.c.group_id == group.id
        ).count()
        
        result.append({
            "id": str(group.id),
            "name": group.name,
            "description": group.description,
            "photo_file_id": str(group.photo_file_id) if group.photo_file_id else None,
            "member_count": member_count,
            "created_at": group.created_at.isoformat() if group.created_at else None,
        })
    
    return result


@router.post("/groups")
def create_group(
    payload: dict,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    Create a new community group.
    Required fields: name
    Optional fields: description
    """
    name = payload.get("name", "").strip()
    description = payload.get("description", "").strip() or None
    
    if not name:
        raise HTTPException(status_code=400, detail="Name is required")
    
    # Check if group with same name already exists
    existing = db.query(CommunityGroup).filter(CommunityGroup.name == name).first()
    if existing:
        raise HTTPException(status_code=400, detail="A group with this name already exists")
    
    group = CommunityGroup(
        name=name,
        description=description,
        created_by_id=current_user.id,
        created_at=datetime.now(timezone.utc),
    )
    
    db.add(group)
    db.commit()
    db.refresh(group)
    
    # Add creator as first member
    db.execute(
        community_group_members.insert().values(
            group_id=group.id,
            user_id=current_user.id
        )
    )
    
    # Create default "General" topic automatically
    general_topic = CommunityGroupTopic(
        group_id=group.id,
        name="General",
        created_at=datetime.now(timezone.utc),
    )
    db.add(general_topic)
    db.commit()
    
    return {
        "id": str(group.id),
        "name": group.name,
        "description": group.description,
        "member_count": 1,
        "created_at": group.created_at.isoformat() if group.created_at else None,
    }


@router.get("/groups/{group_id}")
def get_group(
    group_id: str,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    Get a specific group with its members.
    """
    try:
        group_uuid = uuid.UUID(str(group_id))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid group_id format")
    
    group = db.query(CommunityGroup).filter(CommunityGroup.id == group_uuid).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    # Get member IDs
    member_ids_result = db.execute(
        select(community_group_members.c.user_id).where(
            community_group_members.c.group_id == group_uuid
        )
    ).scalars().all()
    member_ids = [str(uid) for uid in member_ids_result]
    
    # Count members
    member_count = len(member_ids)
    
    return {
        "id": str(group.id),
        "name": group.name,
        "description": group.description,
        "photo_file_id": str(group.photo_file_id) if group.photo_file_id else None,
        "member_count": member_count,
        "member_ids": member_ids,
        "created_at": group.created_at.isoformat() if group.created_at else None,
    }


@router.put("/groups/{group_id}/members")
def update_group_members(
    group_id: str,
    payload: dict,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    Update group members.
    Payload: {"member_ids": ["uuid1", "uuid2", ...]}
    """
    try:
        group_uuid = uuid.UUID(str(group_id))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid group_id format")
    
    group = db.query(CommunityGroup).filter(CommunityGroup.id == group_uuid).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    # Only group creator can update members (or admin in the future)
    if group.created_by_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only group creator can update members")
    
    member_ids = payload.get("member_ids", [])
    if not isinstance(member_ids, list):
        raise HTTPException(status_code=400, detail="member_ids must be a list")
    
    # Convert to UUIDs
    member_uuids = []
    for mid in member_ids:
        try:
            member_uuids.append(uuid.UUID(str(mid)))
        except Exception:
            raise HTTPException(status_code=400, detail=f"Invalid member_id format: {mid}")
    
    # Remove all existing members
    db.execute(
        community_group_members.delete().where(
            community_group_members.c.group_id == group_uuid
        )
    )
    
    # Add new members
    if member_uuids:
        db.execute(
            community_group_members.insert().values([
                {"group_id": group_uuid, "user_id": uid}
                for uid in member_uuids
            ])
        )
    
    db.commit()
    
    return {
        "status": "updated",
        "member_count": len(member_uuids),
    }


@router.put("/groups/{group_id}")
def update_group(
    group_id: str,
    payload: dict,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    Update group settings (name, photo, etc.).
    """
    try:
        group_uuid = uuid.UUID(str(group_id))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid group_id format")
    
    group = db.query(CommunityGroup).filter(CommunityGroup.id == group_uuid).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    # Only group creator can update settings
    if group.created_by_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only group creator can update settings")
    
    # Update name if provided
    if "name" in payload:
        name = payload.get("name", "").strip()
        if not name:
            raise HTTPException(status_code=400, detail="Name cannot be empty")
        # Check if name is already taken by another group
        existing = db.query(CommunityGroup).filter(
            CommunityGroup.name == name,
            CommunityGroup.id != group_uuid
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="A group with this name already exists")
        group.name = name
    
    # Update photo if provided
    if "photo_file_id" in payload:
        photo_file_id = payload.get("photo_file_id")
        if photo_file_id:
            try:
                group.photo_file_id = uuid.UUID(str(photo_file_id))
            except Exception:
                raise HTTPException(status_code=400, detail="Invalid photo_file_id format")
        else:
            group.photo_file_id = None
    
    group.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(group)
    
    # Count members
    member_count = db.query(community_group_members).filter(
        community_group_members.c.group_id == group_uuid
    ).count()
    
    return {
        "id": str(group.id),
        "name": group.name,
        "description": group.description,
        "photo_file_id": str(group.photo_file_id) if group.photo_file_id else None,
        "member_count": member_count,
        "created_at": group.created_at.isoformat() if group.created_at else None,
    }


@router.get("/groups/{group_id}/topics")
def list_group_topics(
    group_id: str,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    List all topics for a group.
    """
    try:
        group_uuid = uuid.UUID(str(group_id))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid group_id format")
    
    group = db.query(CommunityGroup).filter(CommunityGroup.id == group_uuid).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    topics = db.query(CommunityGroupTopic).filter(
        CommunityGroupTopic.group_id == group_uuid
    ).order_by(CommunityGroupTopic.created_at.asc()).all()
    
    # Sort topics: "General" first, then others by creation date
    topics_sorted = sorted(topics, key=lambda t: (t.name != "General", t.created_at or datetime.min.replace(tzinfo=timezone.utc)))
    
    result = []
    for topic in topics_sorted:
        # Count posts in this topic (placeholder - implement when posts are linked to topics)
        posts_count = 0  # TODO: count posts with this topic_id
        
        result.append({
            "id": str(topic.id),
            "name": topic.name,
            "posts_count": posts_count,
            "created_at": topic.created_at.isoformat() if topic.created_at else None,
        })
    
    return result


@router.post("/groups/{group_id}/topics")
def create_group_topic(
    group_id: str,
    payload: dict,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    Create a new topic for a group.
    """
    try:
        group_uuid = uuid.UUID(str(group_id))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid group_id format")
    
    group = db.query(CommunityGroup).filter(CommunityGroup.id == group_uuid).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    # Only group creator can create topics (or admin in the future)
    if group.created_by_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only group creator can create topics")
    
    name = payload.get("name", "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Topic name is required")
    
    # Check if topic with same name already exists in this group
    existing = db.query(CommunityGroupTopic).filter(
        CommunityGroupTopic.group_id == group_uuid,
        CommunityGroupTopic.name == name
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="A topic with this name already exists in this group")
    
    topic = CommunityGroupTopic(
        group_id=group_uuid,
        name=name,
        created_at=datetime.now(timezone.utc),
    )
    
    db.add(topic)
    db.commit()
    db.refresh(topic)
    
    return {
        "id": str(topic.id),
        "name": topic.name,
        "posts_count": 0,
        "created_at": topic.created_at.isoformat() if topic.created_at else None,
    }


@router.delete("/groups/{group_id}")
def delete_group(
    group_id: str,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    Delete a group. Only the group creator can delete it.
    """
    try:
        group_uuid = uuid.UUID(str(group_id))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid group_id format")
    
    group = db.query(CommunityGroup).filter(CommunityGroup.id == group_uuid).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    # Only group creator can delete the group
    if group.created_by_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only group creator can delete the group")
    
    # Delete all topics (cascade should handle this, but being explicit)
    db.query(CommunityGroupTopic).filter(CommunityGroupTopic.group_id == group_uuid).delete()
    
    # Delete all memberships (cascade should handle this)
    db.execute(
        community_group_members.delete().where(
            community_group_members.c.group_id == group_uuid
        )
    )
    
    # Delete the group
    db.delete(group)
    db.commit()
    
    return {"status": "deleted"}


@router.put("/groups/{group_id}/topics/{topic_id}")
def update_group_topic(
    group_id: str,
    topic_id: str,
    payload: dict,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    Update a topic in a group (rename).
    """
    try:
        group_uuid = uuid.UUID(str(group_id))
        topic_uuid = uuid.UUID(str(topic_id))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid group_id or topic_id format")
    
    group = db.query(CommunityGroup).filter(CommunityGroup.id == group_uuid).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    # Only group creator can update topics
    if group.created_by_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only group creator can update topics")
    
    topic = db.query(CommunityGroupTopic).filter(
        CommunityGroupTopic.id == topic_uuid,
        CommunityGroupTopic.group_id == group_uuid
    ).first()
    
    if not topic:
        raise HTTPException(status_code=404, detail="Topic not found")
    
    # Prevent renaming "General" topic
    if topic.name == "General":
        raise HTTPException(status_code=400, detail="Cannot rename the 'General' topic (Main Topic)")
    
    name = payload.get("name", "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Topic name is required")
    
    # Check if topic with same name already exists in this group (excluding current topic)
    existing = db.query(CommunityGroupTopic).filter(
        CommunityGroupTopic.group_id == group_uuid,
        CommunityGroupTopic.name == name,
        CommunityGroupTopic.id != topic_uuid
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="A topic with this name already exists in this group")
    
    topic.name = name
    topic.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(topic)
    
    # Count posts in this topic (placeholder - implement when posts are linked to topics)
    posts_count = 0  # TODO: count posts with this topic_id
    
    return {
        "id": str(topic.id),
        "name": topic.name,
        "posts_count": posts_count,
        "created_at": topic.created_at.isoformat() if topic.created_at else None,
    }


@router.delete("/groups/{group_id}/topics/{topic_id}")
def delete_group_topic(
    group_id: str,
    topic_id: str,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    Delete a topic from a group.
    """
    try:
        group_uuid = uuid.UUID(str(group_id))
        topic_uuid = uuid.UUID(str(topic_id))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid group_id or topic_id format")
    
    group = db.query(CommunityGroup).filter(CommunityGroup.id == group_uuid).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    # Only group creator can delete topics
    if group.created_by_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only group creator can delete topics")
    
    topic = db.query(CommunityGroupTopic).filter(
        CommunityGroupTopic.id == topic_uuid,
        CommunityGroupTopic.group_id == group_uuid
    ).first()
    
    if not topic:
        raise HTTPException(status_code=404, detail="Topic not found")
    
    # Prevent deletion of the "General" topic (Main Topic)
    if topic.name == "General":
        raise HTTPException(status_code=400, detail="Cannot delete the 'General' topic (Main Topic)")
    
    db.delete(topic)
    db.commit()
    
    return {"status": "deleted"}

