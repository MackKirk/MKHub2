import json
import uuid
from datetime import datetime, timezone, timedelta, date as _date
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
    User,
    EmployeeProfile,
    user_divisions,
    SettingList,
    SettingItem,
    FileObject,
)
from ..auth.security import get_current_user, require_permissions, _has_permission

from ..services.community_fanout import (
    audience_user_ids,
    fanout_new_post_notifications,
    group_member_ids,
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

COMMUNITY_GROUP_DESCRIPTION_MAX_LEN = 8000


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


def _user_audience_match(post: CommunityPost, viewer_id: uuid.UUID, user_division_ids: List[str]) -> bool:
    if post.target_type == "all":
        return True
    if post.target_type == "users":
        raw = getattr(post, "target_user_ids", None) or []
        if isinstance(raw, str):
            try:
                raw = json.loads(raw)
            except Exception:
                raw = []
        if not isinstance(raw, list):
            return False
        return str(viewer_id) in {str(x) for x in raw if x is not None}
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
    if not _user_audience_match(post, viewer.id, div_ids):
        raise HTTPException(status_code=404, detail="Post not found")


MAX_COMMUNITY_ATTACHMENTS = 30
MAX_COMMUNITY_TARGET_USERS = 400


def _normalize_target_user_ids_payload(db: Session, raw: Any) -> List[str]:
    """Return unique active user id strings; raises 400 if empty after validation."""
    if raw is None:
        raise HTTPException(status_code=400, detail="target_user_ids is required when target_type is users")
    if not isinstance(raw, list) or len(raw) == 0:
        raise HTTPException(status_code=400, detail="target_user_ids must be a non-empty list when target_type is users")
    out: List[str] = []
    seen: Set[str] = set()
    for x in raw:
        try:
            u = uuid.UUID(str(x).strip())
        except Exception:
            continue
        sid = str(u)
        if sid in seen:
            continue
        seen.add(sid)
        user = db.query(User).filter(User.id == u, User.is_active == True).first()
        if user:
            out.append(sid)
        if len(out) >= MAX_COMMUNITY_TARGET_USERS:
            break
    if not out:
        raise HTTPException(status_code=400, detail="Select at least one active employee")
    return out


def _parse_community_group_ids_payload(raw: Any) -> List[str]:
    if not isinstance(raw, list) or len(raw) == 0:
        raise HTTPException(status_code=400, detail="target_community_group_ids must be a non-empty list")
    out: List[str] = []
    seen: Set[str] = set()
    for x in raw:
        try:
            u = uuid.UUID(str(x).strip())
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid community group id")
        sid = str(u)
        if sid in seen:
            continue
        seen.add(sid)
        out.append(sid)
    return out


def _target_user_ids_from_community_group_ids(db: Session, group_id_strs: List[str]) -> List[str]:
    """Union of active members of the given groups, capped at MAX_COMMUNITY_TARGET_USERS."""
    member_ids: Set[uuid.UUID] = set()
    for sid in group_id_strs:
        gid = uuid.UUID(sid)
        g = db.query(CommunityGroup).filter(CommunityGroup.id == gid).first()
        if not g:
            raise HTTPException(status_code=400, detail="Community group not found")
        member_ids |= group_member_ids(db, gid)
    if not member_ids:
        raise HTTPException(status_code=400, detail="Selected community groups have no members")
    rows = (
        db.query(User.id)
        .filter(User.id.in_(member_ids), User.is_active == True)
        .order_by(User.id)
        .limit(MAX_COMMUNITY_TARGET_USERS)
        .all()
    )
    out = [str(r[0]) for r in rows]
    if not out:
        raise HTTPException(status_code=400, detail="Selected community groups have no active members")
    return out


def _resolve_users_target_for_create(db: Session, payload: dict) -> List[str]:
    raw_g = payload.get("target_community_group_ids")
    raw_u = payload.get("target_user_ids")
    has_g = isinstance(raw_g, list) and len(raw_g) > 0
    has_u = isinstance(raw_u, list) and len(raw_u) > 0
    if has_g and has_u:
        raise HTTPException(
            status_code=400,
            detail="Send either target_community_group_ids or target_user_ids, not both",
        )
    if has_g:
        gids = _parse_community_group_ids_payload(raw_g)
        return _target_user_ids_from_community_group_ids(db, gids)
    return _normalize_target_user_ids_payload(db, raw_u)


def _parse_attachment_files_raw(post: CommunityPost) -> List[Dict[str, str]]:
    """Normalized [{file_id, name}, ...] from JSON column or legacy document_file_id."""
    raw = getattr(post, "attachment_files", None) or []
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except Exception:
            raw = []
    if not isinstance(raw, list):
        raw = []
    out: List[Dict[str, str]] = []
    seen: Set[str] = set()
    for item in raw:
        if not isinstance(item, dict):
            continue
        fid = item.get("file_id") or item.get("id")
        if not fid:
            continue
        try:
            u = uuid.UUID(str(fid))
        except Exception:
            continue
        sid = str(u)
        if sid in seen:
            continue
        seen.add(sid)
        nm = (item.get("name") or item.get("original_name") or "").strip() or "Attachment"
        out.append({"file_id": sid, "name": nm[:255]})
        if len(out) >= MAX_COMMUNITY_ATTACHMENTS:
            break
    if not out and post.document_file_id:
        out.append({"file_id": str(post.document_file_id), "name": "Attachment"})
    return out


def _apply_attachments_payload(payload_list: Any) -> List[Dict[str, str]]:
    if payload_list is None:
        return []
    if not isinstance(payload_list, list):
        raise HTTPException(status_code=400, detail="attachments must be a list")
    out: List[Dict[str, str]] = []
    seen: Set[str] = set()
    for item in payload_list:
        if not isinstance(item, dict):
            raise HTTPException(status_code=400, detail="Each attachment must be an object")
        fid = item.get("file_id") or item.get("id")
        if not fid:
            raise HTTPException(status_code=400, detail="Each attachment needs file_id")
        try:
            u = uuid.UUID(str(fid))
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid attachment file_id")
        sid = str(u)
        if sid in seen:
            continue
        seen.add(sid)
        nm = str(item.get("name") or item.get("original_name") or "Attachment").strip() or "Attachment"
        out.append({"file_id": sid, "name": nm[:255]})
        if len(out) > MAX_COMMUNITY_ATTACHMENTS:
            raise HTTPException(status_code=400, detail=f"At most {MAX_COMMUNITY_ATTACHMENTS} attachments")
    return out


def _sync_attachment_storage(post: CommunityPost, normalized: List[Dict[str, str]]) -> None:
    post.attachment_files = list(normalized)
    post.document_file_id = uuid.UUID(normalized[0]["file_id"]) if normalized else None


def _attachments_response(db: Session, post: CommunityPost) -> List[Dict[str, Any]]:
    rows = _parse_attachment_files_raw(post)
    result: List[Dict[str, Any]] = []
    for rec in rows:
        fid = rec["file_id"]
        url = f"/files/{fid}"
        disp = rec["name"]
        fo = db.query(FileObject).filter(FileObject.id == uuid.UUID(fid)).first()
        if fo and getattr(fo, "key", None):
            key_bn = str(fo.key).rsplit("/", 1)[-1]
            if disp == "Attachment" or not disp:
                disp = key_bn
        result.append({"file_id": fid, "url": url, "original_name": disp})
    return result


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

    attachments = _attachments_response(db, post)
    document_url = attachments[0]["url"] if attachments else None
    document_file_id = attachments[0]["file_id"] if attachments else None
    document_original_name = attachments[0]["original_name"] if attachments else None

    post_tags = post.tags or []
    if post.photo_file_id and "Image" not in post_tags:
        post_tags = post_tags + ["Image"]
    if attachments and "Document" not in post_tags:
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

    target_users_preview: List[Dict[str, str]] = []
    if getattr(post, "target_type", None) == "users":
        raw_u = getattr(post, "target_user_ids", None) or []
        if isinstance(raw_u, str):
            try:
                raw_u = json.loads(raw_u)
            except Exception:
                raw_u = []
        if isinstance(raw_u, list):
            for sid in raw_u[:MAX_COMMUNITY_TARGET_USERS]:
                try:
                    uid = uuid.UUID(str(sid).strip())
                except Exception:
                    continue
                u = db.query(User).filter(User.id == uid).first()
                ep = db.query(EmployeeProfile).filter(EmployeeProfile.user_id == uid).first() if u else None
                nm = None
                if ep:
                    nm = (ep.preferred_name or "").strip() or f"{(ep.first_name or '').strip()} {(ep.last_name or '').strip()}".strip()
                if not nm and u:
                    nm = u.username
                target_users_preview.append({"id": str(uid), "name": nm or "Unknown"})

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
        "document_original_name": document_original_name,
        "attachments": attachments,
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
        "target_user_ids": getattr(post, "target_user_ids", None) or [],
        "target_users_preview": target_users_preview,
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

    uid_s = str(current_user.id)
    user_target_filter = and_(
        CommunityPost.target_type == "users",
        cast(CommunityPost.target_user_ids, String).like(f"%{uid_s}%"),
    )
    if user_division_ids:
        division_filters = []
        for div_id in user_division_ids:
            division_filters.append(cast(CommunityPost.target_division_ids, String).like(f"%{div_id}%"))
        query = query.filter(
            or_(
                CommunityPost.target_type == "all",
                user_target_filter,
                *division_filters if division_filters else [CommunityPost.id == None],
            )
        )
    else:
        query = query.filter(
            or_(
                CommunityPost.target_type == "all",
                user_target_filter,
            )
        )

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
    target_user_ids: List[str] = []
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

    if target_type not in ["all", "divisions", "users"]:
        raise HTTPException(status_code=400, detail="target_type must be 'all', 'divisions', or 'users'")

    if target_type == "divisions":
        if not target_division_ids or not isinstance(target_division_ids, list) or len(target_division_ids) == 0:
            raise HTTPException(status_code=400, detail="target_division_ids must be a non-empty list when target_type is 'divisions'")
        target_division_ids = [str(did) for did in target_division_ids]
    elif target_type == "users":
        target_user_ids = _resolve_users_target_for_create(db, payload)
        target_division_ids = []
    else:
        target_division_ids = []

    if photo_file_id:
        try:
            uuid.UUID(str(photo_file_id))
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid photo_file_id format")

    att_norm: List[Dict[str, str]] = []
    if "attachments" in payload:
        att_norm = _apply_attachments_payload(payload.get("attachments"))
    elif document_file_id:
        try:
            du = uuid.UUID(str(document_file_id))
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid document_file_id format")
        att_norm = [{"file_id": str(du), "name": str(payload.get("document_original_name") or "Attachment")[:255]}]

    tags = ["Announcement"]
    if is_urgent or priority in ("urgent", "critical"):
        tags.append("Urgent")
    if photo_file_id:
        tags.append("Image")
    if att_norm:
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
        document_file_id=uuid.UUID(att_norm[0]["file_id"]) if att_norm else None,
        attachment_files=list(att_norm),
        is_urgent=is_urgent,
        is_required=payload.get("is_required", False),
        requires_read_confirmation=payload.get("requires_read_confirmation", False),
        target_type=target_type,
        target_division_ids=target_division_ids if target_type == "divisions" else [],
        target_user_ids=target_user_ids if target_type == "users" else [],
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

        attachments = _attachments_response(db, post)
        document_url = attachments[0]["url"] if attachments else None
        document_file_id = attachments[0]["file_id"] if attachments else None
        document_original_name = attachments[0]["original_name"] if attachments else None

        post_tags = post.tags or []
        if post.photo_file_id and 'Image' not in post_tags:
            post_tags = post_tags + ['Image']
        if attachments and 'Document' not in post_tags:
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
        elif post.target_type == 'users':
            total_recipients = len(audience_user_ids(db, post))
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
            "document_original_name": document_original_name,
            "attachments": attachments,
            "created_at": post.created_at.isoformat() if post.created_at else None,
            "publish_at": pa.isoformat() if pa else None,
            "status": getattr(post, "status", "published"),
            "priority": getattr(post, "priority", "normal"),
            "related_area": getattr(post, "related_area", "general"),
            "target_type": post.target_type,
            "target_division_ids": post.target_division_ids or [],
            "target_user_ids": getattr(post, "target_user_ids", None) or [],
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
    if "attachments" in payload:
        att_norm = _apply_attachments_payload(payload.get("attachments"))
        _sync_attachment_storage(post, att_norm)
    elif "document_file_id" in payload:
        df = payload.get("document_file_id")
        post.document_file_id = uuid.UUID(str(df)) if df else None
        if not df:
            post.attachment_files = []
        else:
            post.attachment_files = [{"file_id": str(post.document_file_id), "name": "Attachment"}]

    if any(k in payload for k in ("target_type", "target_division_ids", "target_user_ids", "target_community_group_ids")):
        tt = str(payload.get("target_type", post.target_type) or "all").lower()
        if tt not in ("all", "divisions", "users"):
            raise HTTPException(status_code=400, detail="Invalid target_type")
        post.target_type = tt
        if tt == "all":
            post.target_division_ids = []
            post.target_user_ids = []
        elif tt == "divisions":
            tdi = payload.get("target_division_ids") or []
            if not isinstance(tdi, list) or len(tdi) == 0:
                raise HTTPException(status_code=400, detail="target_division_ids required for divisions")
            post.target_division_ids = [str(x) for x in tdi]
            post.target_user_ids = []
        else:
            raw_g = payload.get("target_community_group_ids")
            raw_u = payload.get("target_user_ids")
            key_g = "target_community_group_ids" in payload
            key_u = "target_user_ids" in payload
            has_g = key_g and isinstance(raw_g, list) and len(raw_g) > 0
            has_u = key_u and isinstance(raw_u, list) and len(raw_u) > 0
            if has_g and has_u:
                raise HTTPException(
                    status_code=400,
                    detail="Send either target_community_group_ids or target_user_ids, not both",
                )
            if has_g:
                gids = _parse_community_group_ids_payload(raw_g)
                post.target_user_ids = _target_user_ids_from_community_group_ids(db, gids)
            elif has_u:
                post.target_user_ids = _normalize_target_user_ids_payload(db, raw_u)
            elif key_g or key_u:
                raise HTTPException(
                    status_code=400,
                    detail="When target_type is users, provide non-empty target_community_group_ids or target_user_ids",
                )
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
    if _parse_attachment_files_raw(post):
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


def _serialize_community_comment(db: Session, comment: CommunityPostComment) -> Dict[str, Any]:
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
    return {
        "id": str(comment.id),
        "user_id": str(comment.user_id),
        "user_name": user_name,
        "user_avatar": user_avatar,
        "content": comment.content,
        "parent_comment_id": str(comment.parent_comment_id) if getattr(comment, "parent_comment_id", None) else None,
        "created_at": comment.created_at.isoformat() if comment.created_at else None,
        "updated_at": comment.updated_at.isoformat() if comment.updated_at else None,
    }


def _delete_comment_subtree(db: Session, comment_id: uuid.UUID, post_uuid: uuid.UUID) -> int:
    """Delete a comment and all replies beneath it. Returns number of comments removed."""
    children = db.query(CommunityPostComment).filter(
        CommunityPostComment.post_id == post_uuid,
        CommunityPostComment.parent_comment_id == comment_id,
    ).all()
    deleted = 0
    for ch in children:
        deleted += _delete_comment_subtree(db, ch.id, post_uuid)
    row = db.query(CommunityPostComment).filter(
        CommunityPostComment.id == comment_id,
        CommunityPostComment.post_id == post_uuid,
    ).first()
    if row:
        db.delete(row)
        deleted += 1
    return deleted


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

    return [_serialize_community_comment(db, c) for c in comments]


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

    db.refresh(comment)

    comments_count = db.query(CommunityPostComment).filter(
        CommunityPostComment.post_id == post_uuid
    ).count()

    out = _serialize_community_comment(db, comment)
    out["comments_count"] = comments_count
    return out


@router.patch("/posts/{post_id}/comments/{comment_id}")
def update_comment(
    post_id: str,
    comment_id: str,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Edit own comment on a post."""
    try:
        post_uuid = uuid.UUID(str(post_id))
        comment_uuid = uuid.UUID(str(comment_id))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid id format")

    post = db.query(CommunityPost).filter(CommunityPost.id == post_uuid).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    _assert_reader_can_access_post(db, post, current_user)

    comment = db.query(CommunityPostComment).filter(
        CommunityPostComment.id == comment_uuid,
        CommunityPostComment.post_id == post_uuid,
    ).first()
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    if comment.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="You can only edit your own comments")

    content = payload.get("content", "")
    if isinstance(content, str):
        content = content.strip()
    if not content:
        raise HTTPException(status_code=400, detail="Comment content is required")

    comment.content = content
    comment.updated_at = datetime.now(timezone.utc)
    db.add(comment)
    db.commit()
    db.refresh(comment)

    _replace_comment_mentions(db, comment.id, post_uuid, payload.get("mentions"), current_user.id)

    db.refresh(comment)

    comments_count = db.query(CommunityPostComment).filter(
        CommunityPostComment.post_id == post_uuid
    ).count()
    out = _serialize_community_comment(db, comment)
    out["comments_count"] = comments_count
    return out


@router.delete("/posts/{post_id}/comments/{comment_id}")
def delete_comment(
    post_id: str,
    comment_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete own comment (and any replies under it)."""
    try:
        post_uuid = uuid.UUID(str(post_id))
        comment_uuid = uuid.UUID(str(comment_id))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid id format")

    post = db.query(CommunityPost).filter(CommunityPost.id == post_uuid).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    _assert_reader_can_access_post(db, post, current_user)

    comment = db.query(CommunityPostComment).filter(
        CommunityPostComment.id == comment_uuid,
        CommunityPostComment.post_id == post_uuid,
    ).first()
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    if comment.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="You can only delete your own comments")

    removed = _delete_comment_subtree(db, comment_uuid, post_uuid)
    db.commit()

    comments_count = db.query(CommunityPostComment).filter(
        CommunityPostComment.post_id == post_uuid
    ).count()
    return {"removed": removed, "comments_count": comments_count}


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


def _parse_insights_range(date_from: Optional[str], date_to: Optional[str]) -> tuple[datetime, datetime, int]:
    if not date_from or not date_to:
        raise HTTPException(status_code=400, detail="from and to query params are required (YYYY-MM-DD)")
    try:
        df_raw = datetime.fromisoformat(date_from.replace("Z", "+00:00"))
        dt_raw = datetime.fromisoformat(date_to.replace("Z", "+00:00"))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid date range")
    # Normalize to inclusive day boundaries in UTC so the [from, to] range covers the
    # full calendar days the user picked, regardless of timezone the input came in with.
    df = datetime(df_raw.year, df_raw.month, df_raw.day, 0, 0, 0, tzinfo=timezone.utc)
    dt = datetime(dt_raw.year, dt_raw.month, dt_raw.day, 23, 59, 59, 999999, tzinfo=timezone.utc)
    if dt < df:
        raise HTTPException(status_code=400, detail="`to` must be on or after `from`")
    span_days = max(1, (dt.date() - df.date()).days + 1)
    return df, dt, span_days


def _kpi_block(db: Session, df: datetime, dt: datetime) -> Dict[str, Any]:
    """Compute the headline KPIs for the [df, dt] window. All counts are scoped to the window."""
    posts_published = (
        db.query(func.count(CommunityPost.id))
        .filter(
            CommunityPost.status == "published",
            func.coalesce(CommunityPost.publish_at, CommunityPost.created_at) >= df,
            func.coalesce(CommunityPost.publish_at, CommunityPost.created_at) <= dt,
        )
        .scalar()
        or 0
    )
    post_views = (
        db.query(func.count(CommunityPostView.id))
        .filter(CommunityPostView.viewed_at >= df, CommunityPostView.viewed_at <= dt)
        .scalar()
        or 0
    )
    comments_made = (
        db.query(func.count(CommunityPostComment.id))
        .filter(CommunityPostComment.created_at >= df, CommunityPostComment.created_at <= dt)
        .scalar()
        or 0
    )
    likes_total = (
        db.query(func.count(CommunityPostLike.id))
        .filter(CommunityPostLike.liked_at >= df, CommunityPostLike.liked_at <= dt)
        .scalar()
        or 0
    )

    # Active members = distinct users with any view/like/comment in the window.
    view_users = db.query(CommunityPostView.user_id).filter(
        CommunityPostView.viewed_at >= df, CommunityPostView.viewed_at <= dt
    )
    like_users = db.query(CommunityPostLike.user_id).filter(
        CommunityPostLike.liked_at >= df, CommunityPostLike.liked_at <= dt
    )
    comment_users = db.query(CommunityPostComment.user_id).filter(
        CommunityPostComment.created_at >= df, CommunityPostComment.created_at <= dt
    )
    active_user_ids = {row[0] for row in view_users.union(like_users, comment_users).all()}
    active_members = len(active_user_ids)

    engagement_rate_pct = round(((likes_total + comments_made) / post_views) * 100.0, 1) if post_views else 0.0

    return {
        "posts_published": int(posts_published),
        "post_views": int(post_views),
        "comments_made": int(comments_made),
        "likes_total": int(likes_total),
        "active_members": int(active_members),
        "engagement_rate_pct": engagement_rate_pct,
    }


def _daily_series(db: Session, df: datetime, dt: datetime) -> Dict[str, List[Dict[str, Any]]]:
    """Per-day arrays of {date, count} aligned across all metrics for the window."""
    # Build the full date axis so charts have continuous bars even on zero-traffic days.
    start_d = df.date()
    end_d = dt.date()
    days: List[str] = []
    cur = start_d
    while cur <= end_d:
        days.append(cur.isoformat())
        cur = cur + timedelta(days=1)

    def _bucketize(rows: List[tuple], default_zero: bool = True) -> List[Dict[str, Any]]:
        by_day: Dict[str, int] = {d: 0 for d in days} if default_zero else {}
        for row_date, row_count in rows:
            if row_date is None:
                continue
            key = row_date if isinstance(row_date, str) else row_date.isoformat()
            by_day[key] = by_day.get(key, 0) + int(row_count or 0)
        return [{"date": d, "count": by_day.get(d, 0)} for d in days]

    publish_col = func.coalesce(CommunityPost.publish_at, CommunityPost.created_at)
    posts_rows = (
        db.query(func.date(publish_col).label("d"), func.count(CommunityPost.id))
        .filter(
            CommunityPost.status == "published",
            publish_col >= df,
            publish_col <= dt,
        )
        .group_by(func.date(publish_col))
        .all()
    )
    views_rows = (
        db.query(func.date(CommunityPostView.viewed_at), func.count(CommunityPostView.id))
        .filter(CommunityPostView.viewed_at >= df, CommunityPostView.viewed_at <= dt)
        .group_by(func.date(CommunityPostView.viewed_at))
        .all()
    )
    likes_rows = (
        db.query(func.date(CommunityPostLike.liked_at), func.count(CommunityPostLike.id))
        .filter(CommunityPostLike.liked_at >= df, CommunityPostLike.liked_at <= dt)
        .group_by(func.date(CommunityPostLike.liked_at))
        .all()
    )
    comments_rows = (
        db.query(func.date(CommunityPostComment.created_at), func.count(CommunityPostComment.id))
        .filter(CommunityPostComment.created_at >= df, CommunityPostComment.created_at <= dt)
        .group_by(func.date(CommunityPostComment.created_at))
        .all()
    )
    # Active users per day = distinct (user_id) across views/likes/comments on that day.
    view_users_rows = (
        db.query(func.date(CommunityPostView.viewed_at), CommunityPostView.user_id)
        .filter(CommunityPostView.viewed_at >= df, CommunityPostView.viewed_at <= dt)
        .all()
    )
    like_users_rows = (
        db.query(func.date(CommunityPostLike.liked_at), CommunityPostLike.user_id)
        .filter(CommunityPostLike.liked_at >= df, CommunityPostLike.liked_at <= dt)
        .all()
    )
    comment_users_rows = (
        db.query(func.date(CommunityPostComment.created_at), CommunityPostComment.user_id)
        .filter(CommunityPostComment.created_at >= df, CommunityPostComment.created_at <= dt)
        .all()
    )
    by_day_users: Dict[str, set] = {d: set() for d in days}
    for ds, uid in list(view_users_rows) + list(like_users_rows) + list(comment_users_rows):
        if ds is None or uid is None:
            continue
        key = ds if isinstance(ds, str) else ds.isoformat()
        by_day_users.setdefault(key, set()).add(uid)
    active_users_series = [{"date": d, "count": len(by_day_users.get(d, set()))} for d in days]

    return {
        "posts_published": _bucketize(posts_rows),
        "views": _bucketize(views_rows),
        "likes": _bucketize(likes_rows),
        "comments": _bucketize(comments_rows),
        "active_users": active_users_series,
    }


def _author_display(db: Session, user_id: uuid.UUID) -> Dict[str, Optional[str]]:
    user = db.query(User).filter(User.id == user_id).first()
    profile = db.query(EmployeeProfile).filter(EmployeeProfile.user_id == user_id).first() if user else None
    name: Optional[str] = None
    avatar_url: Optional[str] = None
    if profile:
        name = (profile.preferred_name or f"{profile.first_name or ''} {profile.last_name or ''}".strip()) or None
        if profile.profile_photo_file_id:
            avatar_url = f"/files/{profile.profile_photo_file_id}/thumbnail?w=96"
    if not name and user:
        name = user.username
    return {"name": name or "Unknown", "avatar_url": avatar_url}


@router.get("/insights")
def community_insights(
    date_from: Optional[str] = Query(None, alias="from"),
    date_to: Optional[str] = Query(None, alias="to"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permissions("hr:community:write")),
):
    """Aggregate community metrics for HR for the [from, to] window.

    All counts are date-scoped to the window. A `previous` block returns the
    same KPIs computed over the immediately-preceding window of equal length so
    the frontend can render delta chips. `daily` provides per-day series for
    sparklines and the activity timeline.
    """
    df, dt, span_days = _parse_insights_range(date_from, date_to)

    prev_dt = df - timedelta(microseconds=1)
    prev_df = datetime(
        (df - timedelta(days=span_days)).year,
        (df - timedelta(days=span_days)).month,
        (df - timedelta(days=span_days)).day,
        0, 0, 0, tzinfo=timezone.utc,
    )

    # ------------------------------------------------------------------
    # Posts in the current window (used for top posts, area/priority breakdowns,
    # read-confirmation health, and avg read rate).
    # ------------------------------------------------------------------
    publish_col = func.coalesce(CommunityPost.publish_at, CommunityPost.created_at)
    posts_in_range = (
        db.query(CommunityPost)
        .filter(
            CommunityPost.status == "published",
            publish_col >= df,
            publish_col <= dt,
        )
        .all()
    )

    # Pre-aggregate per-post counts in batch (avoid N+1).
    post_ids = [p.id for p in posts_in_range]
    views_by_post: Dict[uuid.UUID, int] = {}
    likes_by_post: Dict[uuid.UUID, int] = {}
    comments_by_post: Dict[uuid.UUID, int] = {}
    confirmations_by_post: Dict[uuid.UUID, int] = {}
    if post_ids:
        for pid, n in (
            db.query(CommunityPostView.post_id, func.count(CommunityPostView.id))
            .filter(CommunityPostView.post_id.in_(post_ids))
            .group_by(CommunityPostView.post_id)
            .all()
        ):
            views_by_post[pid] = int(n or 0)
        for pid, n in (
            db.query(CommunityPostLike.post_id, func.count(CommunityPostLike.id))
            .filter(CommunityPostLike.post_id.in_(post_ids))
            .group_by(CommunityPostLike.post_id)
            .all()
        ):
            likes_by_post[pid] = int(n or 0)
        for pid, n in (
            db.query(CommunityPostComment.post_id, func.count(CommunityPostComment.id))
            .filter(CommunityPostComment.post_id.in_(post_ids))
            .group_by(CommunityPostComment.post_id)
            .all()
        ):
            comments_by_post[pid] = int(n or 0)
        for pid, n in (
            db.query(CommunityPostReadConfirmation.post_id, func.count(CommunityPostReadConfirmation.id))
            .filter(CommunityPostReadConfirmation.post_id.in_(post_ids))
            .group_by(CommunityPostReadConfirmation.post_id)
            .all()
        ):
            confirmations_by_post[pid] = int(n or 0)

    # Audience size per post (uses the existing helper; cached locally).
    audience_by_post: Dict[uuid.UUID, int] = {p.id: len(audience_user_ids(db, p)) for p in posts_in_range}

    # ------------------------------------------------------------------
    # Headline KPIs + previous-period block + daily series.
    # ------------------------------------------------------------------
    kpis = _kpi_block(db, df, dt)
    previous = _kpi_block(db, prev_df, prev_dt)
    daily = _daily_series(db, df, dt)

    # Average read rate across published posts in the window (only posts with audience).
    read_rates = []
    for p in posts_in_range:
        aud = audience_by_post.get(p.id, 0)
        if aud <= 0:
            continue
        read_rates.append((views_by_post.get(p.id, 0) / aud) * 100.0)
    avg_read_rate_pct = round(sum(read_rates) / len(read_rates), 1) if read_rates else 0.0
    kpis["avg_read_rate_pct"] = avg_read_rate_pct

    # Same metric for the previous window (so the KPI card can show a delta).
    prev_publish_col = func.coalesce(CommunityPost.publish_at, CommunityPost.created_at)
    prev_posts = (
        db.query(CommunityPost)
        .filter(
            CommunityPost.status == "published",
            prev_publish_col >= prev_df,
            prev_publish_col <= prev_dt,
        )
        .all()
    )
    prev_read_rates = []
    for p in prev_posts:
        aud = len(audience_user_ids(db, p))
        if aud <= 0:
            continue
        vc = (
            db.query(func.count(CommunityPostView.id))
            .filter(CommunityPostView.post_id == p.id)
            .scalar()
            or 0
        )
        prev_read_rates.append((int(vc) / aud) * 100.0)
    previous["avg_read_rate_pct"] = round(sum(prev_read_rates) / len(prev_read_rates), 1) if prev_read_rates else 0.0

    # ------------------------------------------------------------------
    # Engagement breakdowns by area and priority (covers all valid keys, even with 0).
    # ------------------------------------------------------------------
    def _empty_bucket() -> Dict[str, float]:
        return {"posts": 0, "views": 0, "likes": 0, "comments": 0, "read_rate_sum": 0.0, "read_rate_n": 0}

    area_buckets: Dict[str, Dict[str, float]] = {a: _empty_bucket() for a in VALID_RELATED_AREAS}
    priority_buckets: Dict[str, Dict[str, float]] = {pr: _empty_bucket() for pr in VALID_PRIORITIES}

    for p in posts_in_range:
        area = (getattr(p, "related_area", None) or "general")
        if area not in area_buckets:
            area_buckets[area] = _empty_bucket()
        priority = (getattr(p, "priority", None) or "normal")
        if priority not in priority_buckets:
            priority_buckets[priority] = _empty_bucket()

        v = views_by_post.get(p.id, 0)
        l = likes_by_post.get(p.id, 0)
        c = comments_by_post.get(p.id, 0)
        aud = audience_by_post.get(p.id, 0)
        rate = (v / aud) * 100.0 if aud else None

        for bucket in (area_buckets[area], priority_buckets[priority]):
            bucket["posts"] += 1
            bucket["views"] += v
            bucket["likes"] += l
            bucket["comments"] += c
            if rate is not None:
                bucket["read_rate_sum"] += rate
                bucket["read_rate_n"] += 1

    def _finalize_buckets(buckets: Dict[str, Dict[str, float]]) -> Dict[str, Dict[str, float]]:
        out: Dict[str, Dict[str, float]] = {}
        for k, b in buckets.items():
            n = b["read_rate_n"]
            out[k] = {
                "posts": int(b["posts"]),
                "views": int(b["views"]),
                "likes": int(b["likes"]),
                "comments": int(b["comments"]),
                "read_rate_pct": round(b["read_rate_sum"] / n, 1) if n else 0.0,
            }
        return out

    engagement_by_area = _finalize_buckets(area_buckets)
    engagement_by_priority = _finalize_buckets(priority_buckets)

    # ------------------------------------------------------------------
    # Top posts (rich rows for the UI).
    # ------------------------------------------------------------------
    enriched_posts: List[Dict[str, Any]] = []
    author_cache: Dict[uuid.UUID, Dict[str, Optional[str]]] = {}
    for p in posts_in_range:
        if p.author_id not in author_cache:
            author_cache[p.author_id] = _author_display(db, p.author_id)
        author = author_cache[p.author_id]

        v = views_by_post.get(p.id, 0)
        l = likes_by_post.get(p.id, 0)
        c = comments_by_post.get(p.id, 0)
        rc = confirmations_by_post.get(p.id, 0)
        aud = audience_by_post.get(p.id, 0)
        read_rate = (v / aud * 100.0) if aud else 0.0
        conf_rate = (rc / aud * 100.0) if aud and p.requires_read_confirmation else None
        published_at = p.publish_at or p.created_at

        enriched_posts.append({
            "post_id": str(p.id),
            "title": p.title,
            "author_name": author.get("name"),
            "author_avatar_url": author.get("avatar_url"),
            "related_area": getattr(p, "related_area", "general") or "general",
            "priority": getattr(p, "priority", "normal") or "normal",
            "tags": list(p.tags or []),
            "views": v,
            "likes": l,
            "comments": c,
            "confirmations": rc,
            "audience": aud,
            "read_rate_pct": round(read_rate, 1),
            "confirmation_rate_pct": round(conf_rate, 1) if conf_rate is not None else None,
            "requires_read_confirmation": bool(p.requires_read_confirmation),
            "published_at": published_at.isoformat() if published_at else None,
        })

    top_posts = sorted(
        enriched_posts,
        key=lambda x: (x["likes"] + x["comments"], x["views"]),
        reverse=True,
    )[:10]

    # ------------------------------------------------------------------
    # Top contributors (authors who published in the window).
    # ------------------------------------------------------------------
    contributors_agg: Dict[uuid.UUID, Dict[str, Any]] = {}
    for p in posts_in_range:
        bucket = contributors_agg.setdefault(
            p.author_id,
            {
                "user_id": str(p.author_id),
                "posts_count": 0,
                "views_total": 0,
                "likes_total": 0,
                "comments_total": 0,
            },
        )
        bucket["posts_count"] += 1
        bucket["views_total"] += views_by_post.get(p.id, 0)
        bucket["likes_total"] += likes_by_post.get(p.id, 0)
        bucket["comments_total"] += comments_by_post.get(p.id, 0)

    top_contributors: List[Dict[str, Any]] = []
    for author_id, agg in contributors_agg.items():
        if author_id not in author_cache:
            author_cache[author_id] = _author_display(db, author_id)
        author = author_cache[author_id]
        agg["user_name"] = author.get("name")
        agg["user_avatar_url"] = author.get("avatar_url")
        agg["engagement_score"] = int(agg["likes_total"]) + int(agg["comments_total"])
        top_contributors.append(agg)

    top_contributors.sort(
        key=lambda x: (x["posts_count"], x["engagement_score"], x["views_total"]),
        reverse=True,
    )
    top_contributors = top_contributors[:10]

    # ------------------------------------------------------------------
    # Read-confirmation health (only required posts with an audience).
    # ------------------------------------------------------------------
    pending_posts: List[Dict[str, Any]] = []
    confirmation_rates: List[float] = []
    total_pending = 0
    required_count = 0
    for p in posts_in_range:
        if not p.requires_read_confirmation:
            continue
        aud = audience_by_post.get(p.id, 0)
        if aud <= 0:
            continue
        required_count += 1
        rc = confirmations_by_post.get(p.id, 0)
        rate = (rc / aud) * 100.0
        confirmation_rates.append(rate)
        pending = max(0, aud - rc)
        total_pending += pending
        if pending > 0:
            pending_posts.append({
                "post_id": str(p.id),
                "title": p.title,
                "audience": aud,
                "confirmed": rc,
                "pending": pending,
                "confirmation_rate_pct": round(rate, 1),
            })
    pending_posts.sort(key=lambda x: x["pending"], reverse=True)
    avg_confirmation_rate_pct = round(sum(confirmation_rates) / len(confirmation_rates), 1) if confirmation_rates else 0.0

    # ------------------------------------------------------------------
    # Workforce reach.
    # ------------------------------------------------------------------
    total_members = db.query(func.count(User.id)).filter(User.is_active == True).scalar() or 0  # noqa: E712
    active_members = kpis["active_members"]
    active_pct = round((active_members / total_members) * 100.0, 1) if total_members else 0.0

    return {
        "range": {
            "from": df.date().isoformat(),
            "to": dt.date().isoformat(),
            "days": span_days,
        },
        "previous_range": {
            "from": prev_df.date().isoformat(),
            "to": prev_dt.date().isoformat(),
            "days": span_days,
        },
        "kpis": kpis,
        "previous": previous,
        "daily": daily,
        "engagement_by_area": engagement_by_area,
        "engagement_by_priority": engagement_by_priority,
        "top_posts": top_posts,
        "top_contributors": top_contributors,
        "read_health": {
            "required_posts_count": required_count,
            "avg_confirmation_rate_pct": avg_confirmation_rate_pct,
            "total_pending_confirmations": total_pending,
            "pending_posts": pending_posts[:25],
        },
        "workforce_reach": {
            "total_members": int(total_members),
            "active_members": int(active_members),
            "active_percentage": active_pct,
            "posts_per_active_user": round(kpis["posts_published"] / max(active_members, 1), 2),
            "views_per_active_user": round(kpis["post_views"] / max(active_members, 1), 2),
            "engagement_per_active_user": round(
                (kpis["likes_total"] + kpis["comments_made"]) / max(active_members, 1), 2
            ),
        },
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
        cid = getattr(current_user, "id", None)
        creator_id = group.created_by_id
        result.append({
            "id": str(group.id),
            "name": group.name,
            "description": group.description,
            "photo_file_id": str(group.photo_file_id) if group.photo_file_id else None,
            "member_count": member_count,
            "created_by_id": str(creator_id) if creator_id else None,
            "is_owner": bool(cid and creator_id and creator_id == cid),
            "created_at": group.created_at.isoformat() if group.created_at else None,
            "updated_at": group.updated_at.isoformat() if group.updated_at else None,
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
    if description and len(description) > COMMUNITY_GROUP_DESCRIPTION_MAX_LEN:
        raise HTTPException(
            status_code=400,
            detail=f"Description exceeds {COMMUNITY_GROUP_DESCRIPTION_MAX_LEN} characters",
        )
    
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
    
    cid = getattr(current_user, "id", None)
    creator_id = group.created_by_id
    return {
        "id": str(group.id),
        "name": group.name,
        "description": group.description,
        "photo_file_id": str(group.photo_file_id) if group.photo_file_id else None,
        "member_count": member_count,
        "member_ids": member_ids,
        "created_by_id": str(creator_id) if creator_id else None,
        "is_owner": bool(cid and creator_id and creator_id == cid),
        "created_at": group.created_at.isoformat() if group.created_at else None,
        "updated_at": group.updated_at.isoformat() if group.updated_at else None,
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

    if "description" in payload:
        desc_raw = payload.get("description")
        if desc_raw is None:
            group.description = None
        else:
            ds = str(desc_raw).strip() or ""
            if not ds:
                group.description = None
            elif len(ds) > COMMUNITY_GROUP_DESCRIPTION_MAX_LEN:
                raise HTTPException(
                    status_code=400,
                    detail=f"Description exceeds {COMMUNITY_GROUP_DESCRIPTION_MAX_LEN} characters",
                )
            else:
                group.description = ds

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
        "updated_at": group.updated_at.isoformat() if group.updated_at else None,
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
