"""Ordered tutorial media slides (up to 6 per section)."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from uuid import UUID

from sqlalchemy.orm import Session

from ..models.models import FileObject, TutorialMediaItem, TutorialMediaSlot, User

MAX_ITEMS = 6
CAPTION_MAX = 120
FRAME_X_DEFAULT = 50.0
FRAME_Y_DEFAULT = 0.0
FRAME_ZOOM_MIN = 0.1
FRAME_ZOOM_MAX = 3.0
FRAME_ZOOM_DEFAULT = 1.0


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _clip_caption(caption: Optional[str]) -> Optional[str]:
    if caption is None:
        return None
    text = caption.strip()
    if not text:
        return None
    return text[:CAPTION_MAX]


def _clamp_percent(value: Optional[float], default: float) -> float:
    try:
        number = float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return default
    return max(0.0, min(100.0, number))


def clamp_frame(
    frame_x: Optional[float],
    frame_y: Optional[float],
    frame_zoom: Optional[float],
) -> tuple[float, float, float]:
    try:
        zoom = float(frame_zoom)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        zoom = FRAME_ZOOM_DEFAULT
    return (
        _clamp_percent(frame_x, FRAME_X_DEFAULT),
        _clamp_percent(frame_y, FRAME_Y_DEFAULT),
        max(FRAME_ZOOM_MIN, min(FRAME_ZOOM_MAX, zoom)),
    )


def item_payload(item: TutorialMediaItem, fo: FileObject) -> Dict[str, Any]:
    fid = str(fo.id)
    frame_x, frame_y, frame_zoom = clamp_frame(
        getattr(item, "frame_x", None),
        getattr(item, "frame_y", None),
        getattr(item, "frame_zoom", None),
    )
    return {
        "id": str(item.id),
        "file_id": fid,
        "url": f"/files/{fid}",
        "content_type": fo.content_type,
        "caption": item.caption,
        "sort_order": int(item.sort_order),
        "frame_x": frame_x,
        "frame_y": frame_y,
        "frame_zoom": frame_zoom,
    }


def copy_legacy_slots(db: Session) -> int:
    """Copy one-file tutorial_media_slots rows into items when the section has none."""
    legacy = db.query(TutorialMediaSlot).all()
    created = 0
    for slot in legacy:
        exists = (
            db.query(TutorialMediaItem.id)
            .filter(
                TutorialMediaItem.tutorial_id == slot.tutorial_id,
                TutorialMediaItem.section_id == slot.section_id,
            )
            .first()
        )
        if exists:
            continue
        db.add(
            TutorialMediaItem(
                tutorial_id=slot.tutorial_id,
                section_id=slot.section_id,
                sort_order=10,
                file_object_id=slot.file_object_id,
                caption=None,
                updated_by=slot.updated_by,
                updated_at=slot.updated_at or _now(),
            )
        )
        created += 1
    if created:
        db.commit()
    return created


def list_items(db: Session, tutorial_id: str, section_id: str) -> List[Dict[str, Any]]:
    rows = (
        db.query(TutorialMediaItem, FileObject)
        .join(FileObject, FileObject.id == TutorialMediaItem.file_object_id)
        .filter(
            TutorialMediaItem.tutorial_id == tutorial_id,
            TutorialMediaItem.section_id == section_id,
        )
        .order_by(TutorialMediaItem.sort_order.asc(), TutorialMediaItem.id.asc())
        .all()
    )
    return [item_payload(item, fo) for item, fo in rows]


def _section_items(db: Session, tutorial_id: str, section_id: str) -> List[TutorialMediaItem]:
    return (
        db.query(TutorialMediaItem)
        .filter(
            TutorialMediaItem.tutorial_id == tutorial_id,
            TutorialMediaItem.section_id == section_id,
        )
        .order_by(TutorialMediaItem.sort_order.asc(), TutorialMediaItem.id.asc())
        .all()
    )


def append_item(
    db: Session,
    *,
    tutorial_id: str,
    section_id: str,
    file_object_id: UUID,
    caption: Optional[str],
    user: User,
) -> Dict[str, Any]:
    existing = _section_items(db, tutorial_id, section_id)
    if len(existing) >= MAX_ITEMS:
        raise ValueError("max_items")
    sort_order = (existing[-1].sort_order + 10) if existing else 10
    row = TutorialMediaItem(
        tutorial_id=tutorial_id,
        section_id=section_id,
        sort_order=sort_order,
        file_object_id=file_object_id,
        caption=_clip_caption(caption),
        updated_by=user.id,
        updated_at=_now(),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    fo = db.query(FileObject).filter(FileObject.id == row.file_object_id).first()
    return item_payload(row, fo)


def patch_item(
    db: Session,
    *,
    tutorial_id: str,
    section_id: str,
    item_id: UUID,
    file_object_id: Optional[UUID],
    caption: Optional[str],
    caption_set: bool,
    user: User,
    frame_x: Optional[float] = None,
    frame_y: Optional[float] = None,
    frame_zoom: Optional[float] = None,
    frame_x_set: bool = False,
    frame_y_set: bool = False,
    frame_zoom_set: bool = False,
) -> Dict[str, Any]:
    row = (
        db.query(TutorialMediaItem)
        .filter(
            TutorialMediaItem.id == item_id,
            TutorialMediaItem.tutorial_id == tutorial_id,
            TutorialMediaItem.section_id == section_id,
        )
        .first()
    )
    if not row:
        raise ValueError("not_found")
    if file_object_id is not None:
        row.file_object_id = file_object_id
    if caption_set:
        row.caption = _clip_caption(caption)
    if frame_x_set or frame_y_set or frame_zoom_set:
        current_x, current_y, current_zoom = clamp_frame(
            getattr(row, "frame_x", None),
            getattr(row, "frame_y", None),
            getattr(row, "frame_zoom", None),
        )
        next_x, next_y, next_zoom = clamp_frame(
            frame_x if frame_x_set else current_x,
            frame_y if frame_y_set else current_y,
            frame_zoom if frame_zoom_set else current_zoom,
        )
        row.frame_x = next_x
        row.frame_y = next_y
        row.frame_zoom = next_zoom
    row.updated_by = user.id
    row.updated_at = _now()
    db.commit()
    db.refresh(row)
    fo = db.query(FileObject).filter(FileObject.id == row.file_object_id).first()
    return item_payload(row, fo)


def delete_item(db: Session, tutorial_id: str, section_id: str, item_id: UUID) -> None:
    row = (
        db.query(TutorialMediaItem)
        .filter(
            TutorialMediaItem.id == item_id,
            TutorialMediaItem.tutorial_id == tutorial_id,
            TutorialMediaItem.section_id == section_id,
        )
        .first()
    )
    if not row:
        raise ValueError("not_found")
    db.delete(row)
    db.commit()


def reorder_items(db: Session, tutorial_id: str, section_id: str, item_ids: List[str], user: User) -> List[Dict[str, Any]]:
    rows = _section_items(db, tutorial_id, section_id)
    current = {str(r.id) for r in rows}
    if set(item_ids) != current or len(item_ids) != len(rows):
        raise ValueError("item_ids_mismatch")
    by_id = {str(r.id): r for r in rows}
    for i, iid in enumerate(item_ids):
        row = by_id[iid]
        row.sort_order = (i + 1) * 10
        row.updated_by = user.id
        row.updated_at = _now()
    db.commit()
    return list_items(db, tutorial_id, section_id)


def replace_first_or_create(
    db: Session,
    *,
    tutorial_id: str,
    section_id: str,
    file_object_id: UUID,
    user: User,
) -> Dict[str, Any]:
    existing = _section_items(db, tutorial_id, section_id)
    if existing:
        return patch_item(
            db,
            tutorial_id=tutorial_id,
            section_id=section_id,
            item_id=existing[0].id,
            file_object_id=file_object_id,
            caption=None,
            caption_set=False,
            user=user,
        )
    return append_item(
        db,
        tutorial_id=tutorial_id,
        section_id=section_id,
        file_object_id=file_object_id,
        caption=None,
        user=user,
    )


def clear_section_media(db: Session, tutorial_id: str, section_id: str) -> None:
    (
        db.query(TutorialMediaItem)
        .filter(
            TutorialMediaItem.tutorial_id == tutorial_id,
            TutorialMediaItem.section_id == section_id,
        )
        .delete(synchronize_session=False)
    )
    legacy = (
        db.query(TutorialMediaSlot)
        .filter(
            TutorialMediaSlot.tutorial_id == tutorial_id,
            TutorialMediaSlot.section_id == section_id,
        )
        .first()
    )
    if legacy:
        db.delete(legacy)
    db.commit()
