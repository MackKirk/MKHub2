from typing import Any, Dict, List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.exc import ProgrammingError, OperationalError
from sqlalchemy.orm import Session

from ..auth.security import _user_is_admin, get_current_user
from ..db import Base, engine, get_db
from ..models.models import FileObject, TutorialMediaItem, TutorialMediaSlot, TutorialSection, User
from ..services import tutorial_content as content_svc
from ..services import tutorial_media_items as media_items
from ..services.tutorial_media import allowed_media_section_ids, is_known_slot

router = APIRouter(prefix="/tutorials", tags=["tutorials"])


class MediaSlotPutBody(BaseModel):
    file_id: UUID = Field(..., description="FileObject id from /files/confirm or upload-proxy")


class MediaItemCreateBody(BaseModel):
    file_id: UUID
    caption: Optional[str] = None


class MediaItemPatchBody(BaseModel):
    file_id: Optional[UUID] = None
    caption: Optional[str] = None
    frame_x: Optional[float] = None
    frame_y: Optional[float] = None
    frame_zoom: Optional[float] = None


class MediaItemReorderBody(BaseModel):
    item_ids: List[str] = Field(..., min_length=1)


class SectionUpsertBody(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    body_md: str = Field(default="")
    allows_media: bool = False


class SectionCreateBody(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    body_md: str = Field(default="")
    allows_media: bool = False
    after_section_id: Optional[str] = None


class SectionReorderBody(BaseModel):
    section_ids: List[str] = Field(..., min_length=1)


def _require_admin(user: User) -> User:
    if not _user_is_admin(user):
        raise HTTPException(status_code=403, detail="Admin role required")
    return user


def _ensure_tables() -> None:
    try:
        Base.metadata.create_all(
            bind=engine,
            tables=[
                TutorialMediaSlot.__table__,
                TutorialMediaItem.__table__,
                TutorialSection.__table__,
            ],
        )
    except Exception:
        pass


def _is_tutorial_media_key(key: str) -> bool:
    k = (key or "").replace("\\", "/").lower()
    return "/misc/tutorial-media/" in k or "/tutorial-media/" in k


def _require_known_tutorial(tutorial_id: str) -> None:
    if not content_svc.is_known_tutorial(tutorial_id):
        raise HTTPException(status_code=404, detail="Unknown tutorial")


@router.get("/{tutorial_id}/content")
def get_tutorial_content(
    tutorial_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_known_tutorial(tutorial_id)
    _ensure_tables()
    try:
        sections = content_svc.merge_tutorial_sections(db, tutorial_id)
    except (ProgrammingError, OperationalError):
        db.rollback()
        _ensure_tables()
        sections = content_svc.merge_tutorial_sections(db, tutorial_id)
    payload: Dict[str, Any] = {"tutorial_id": tutorial_id, "sections": sections}
    if _user_is_admin(user):
        try:
            payload["hidden_sections"] = content_svc.list_hidden_sections(db, tutorial_id)
        except (ProgrammingError, OperationalError):
            db.rollback()
            payload["hidden_sections"] = []
    return payload


@router.post("/{tutorial_id}/sections")
def create_section(
    tutorial_id: str,
    body: SectionCreateBody,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_admin(user)
    _require_known_tutorial(tutorial_id)
    _ensure_tables()
    try:
        section = content_svc.create_custom_section(
            db,
            tutorial_id=tutorial_id,
            title=body.title.strip(),
            body_md=body.body_md or "",
            allows_media=body.allows_media,
            after_section_id=body.after_section_id,
            user=user,
        )
    except ValueError as e:
        code = str(e)
        if code == "unknown_tutorial":
            raise HTTPException(status_code=404, detail="Unknown tutorial") from e
        if code == "after_section_not_found":
            raise HTTPException(status_code=400, detail="after_section_id not found") from e
        raise HTTPException(status_code=400, detail=code) from e
    except (ProgrammingError, OperationalError) as e:
        db.rollback()
        _ensure_tables()
        raise HTTPException(status_code=503, detail="Tutorial content storage is not ready.") from e
    return {"tutorial_id": tutorial_id, "section": section}


@router.put("/{tutorial_id}/sections/reorder")
def reorder_sections(
    tutorial_id: str,
    body: SectionReorderBody,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_admin(user)
    _require_known_tutorial(tutorial_id)
    _ensure_tables()
    try:
        sections = content_svc.reorder_sections(db, tutorial_id, body.section_ids, user)
    except ValueError as e:
        if str(e) == "section_ids_mismatch":
            raise HTTPException(
                status_code=400,
                detail="section_ids must match the current visible section set",
            ) from e
        raise HTTPException(status_code=400, detail=str(e)) from e
    except (ProgrammingError, OperationalError) as e:
        db.rollback()
        _ensure_tables()
        raise HTTPException(status_code=503, detail="Tutorial content storage is not ready.") from e
    return {"tutorial_id": tutorial_id, "sections": sections}


@router.put("/{tutorial_id}/sections/{section_id}")
def put_section(
    tutorial_id: str,
    section_id: str,
    body: SectionUpsertBody,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_admin(user)
    _require_known_tutorial(tutorial_id)
    _ensure_tables()
    try:
        section = content_svc.upsert_section_override(
            db,
            tutorial_id=tutorial_id,
            section_id=section_id,
            title=body.title.strip(),
            body_md=body.body_md or "",
            allows_media=body.allows_media,
            user=user,
        )
    except ValueError as e:
        if str(e) == "unknown_section":
            raise HTTPException(status_code=404, detail="Unknown tutorial section") from e
        raise HTTPException(status_code=400, detail=str(e)) from e
    except (ProgrammingError, OperationalError) as e:
        db.rollback()
        _ensure_tables()
        raise HTTPException(status_code=503, detail="Tutorial content storage is not ready.") from e
    return {"tutorial_id": tutorial_id, "section": section}


@router.post("/{tutorial_id}/sections/{section_id}/reset")
def reset_section(
    tutorial_id: str,
    section_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_admin(user)
    _require_known_tutorial(tutorial_id)
    _ensure_tables()
    try:
        content_svc.reset_seed_section(db, tutorial_id, section_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail="Only seed sections can be reset") from e
    sections = content_svc.merge_tutorial_sections(db, tutorial_id)
    restored = next((s for s in sections if s["id"] == section_id), None)
    return {"tutorial_id": tutorial_id, "section": restored, "sections": sections}


@router.post("/{tutorial_id}/sections/{section_id}/unhide")
def unhide_section(
    tutorial_id: str,
    section_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_admin(user)
    _require_known_tutorial(tutorial_id)
    _ensure_tables()
    try:
        section = content_svc.unhide_section(db, tutorial_id, section_id, user)
    except ValueError as e:
        raise HTTPException(status_code=404, detail="Hidden section not found") from e
    except (ProgrammingError, OperationalError) as e:
        db.rollback()
        _ensure_tables()
        raise HTTPException(status_code=503, detail="Tutorial content storage is not ready.") from e
    return {
        "tutorial_id": tutorial_id,
        "section": section,
        "sections": content_svc.merge_tutorial_sections(db, tutorial_id),
        "hidden_sections": content_svc.list_hidden_sections(db, tutorial_id),
    }


@router.delete("/{tutorial_id}/sections/{section_id}")
def delete_section(
    tutorial_id: str,
    section_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_admin(user)
    _require_known_tutorial(tutorial_id)
    _ensure_tables()
    try:
        action = content_svc.delete_or_hide_section(db, tutorial_id, section_id, user)
    except ValueError as e:
        raise HTTPException(status_code=404, detail="Unknown tutorial section") from e
    except (ProgrammingError, OperationalError) as e:
        db.rollback()
        _ensure_tables()
        raise HTTPException(status_code=503, detail="Tutorial content storage is not ready.") from e
    return {
        "ok": True,
        "tutorial_id": tutorial_id,
        "section_id": section_id,
        "action": action,
        "sections": content_svc.merge_tutorial_sections(db, tutorial_id),
    }


def _load_tutorial_file(db: Session, file_id: UUID) -> FileObject:
    fo = db.query(FileObject).filter(FileObject.id == file_id).first()
    if not fo:
        raise HTTPException(status_code=404, detail="File not found")
    if not _is_tutorial_media_key(fo.key or ""):
        raise HTTPException(status_code=400, detail="File must be uploaded as tutorial-media")
    return fo


def _require_media_section(db: Session, tutorial_id: str, section_id: str) -> None:
    if not is_known_slot(tutorial_id, section_id, db):
        raise HTTPException(status_code=404, detail="Unknown tutorial section or media not allowed")


@router.get("/{tutorial_id}/media-slots")
def list_media_slots(
    tutorial_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _ = user
    _require_known_tutorial(tutorial_id)
    _ensure_tables()
    try:
        media_items.copy_legacy_slots(db)
        allowed = allowed_media_section_ids(db, tutorial_id)
    except (ProgrammingError, OperationalError):
        db.rollback()
        _ensure_tables()
        return {"tutorial_id": tutorial_id, "slots": {}}
    slots: Dict[str, Dict[str, Any]] = {}
    for section_id in allowed:
        items = media_items.list_items(db, tutorial_id, section_id)
        if items:
            slots[section_id] = {"items": items}
    return {"tutorial_id": tutorial_id, "slots": slots}


@router.post("/{tutorial_id}/media-slots/{section_id}")
def create_media_item(
    tutorial_id: str,
    section_id: str,
    body: MediaItemCreateBody,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_admin(user)
    _require_known_tutorial(tutorial_id)
    _ensure_tables()
    _require_media_section(db, tutorial_id, section_id)
    _load_tutorial_file(db, body.file_id)
    try:
        item = media_items.append_item(
            db,
            tutorial_id=tutorial_id,
            section_id=section_id,
            file_object_id=body.file_id,
            caption=body.caption,
            user=user,
        )
    except ValueError as e:
        if str(e) == "max_items":
            raise HTTPException(status_code=400, detail="A step can have at most 6 media items") from e
        raise
    return {"tutorial_id": tutorial_id, "section_id": section_id, "item": item}


@router.patch("/{tutorial_id}/media-slots/{section_id}/items/{item_id}")
def patch_media_item(
    tutorial_id: str,
    section_id: str,
    item_id: UUID,
    body: MediaItemPatchBody,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_admin(user)
    _require_known_tutorial(tutorial_id)
    _ensure_tables()
    _require_media_section(db, tutorial_id, section_id)
    fields = body.model_fields_set if hasattr(body, "model_fields_set") else body.__fields_set__
    if body.file_id is not None:
        _load_tutorial_file(db, body.file_id)
    try:
        item = media_items.patch_item(
            db,
            tutorial_id=tutorial_id,
            section_id=section_id,
            item_id=item_id,
            file_object_id=body.file_id,
            caption=body.caption,
            caption_set="caption" in fields,
            user=user,
            frame_x=body.frame_x,
            frame_y=body.frame_y,
            frame_zoom=body.frame_zoom,
            frame_x_set="frame_x" in fields,
            frame_y_set="frame_y" in fields,
            frame_zoom_set="frame_zoom" in fields,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail="Media item not found") from e
    return {"tutorial_id": tutorial_id, "section_id": section_id, "item": item}


@router.delete("/{tutorial_id}/media-slots/{section_id}/items/{item_id}")
def delete_media_item(
    tutorial_id: str,
    section_id: str,
    item_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_admin(user)
    _require_known_tutorial(tutorial_id)
    _ensure_tables()
    try:
        media_items.delete_item(db, tutorial_id, section_id, item_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail="Media item not found") from e
    return {"ok": True, "tutorial_id": tutorial_id, "section_id": section_id, "item_id": str(item_id)}


@router.put("/{tutorial_id}/media-slots/{section_id}/reorder")
def reorder_media_items(
    tutorial_id: str,
    section_id: str,
    body: MediaItemReorderBody,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_admin(user)
    _require_known_tutorial(tutorial_id)
    _ensure_tables()
    _require_media_section(db, tutorial_id, section_id)
    try:
        items = media_items.reorder_items(db, tutorial_id, section_id, body.item_ids, user)
    except ValueError as e:
        raise HTTPException(status_code=400, detail="item_ids must match the current slides") from e
    return {"tutorial_id": tutorial_id, "section_id": section_id, "items": items}


@router.put("/{tutorial_id}/media-slots/{section_id}")
def put_media_slot(
    tutorial_id: str,
    section_id: str,
    body: MediaSlotPutBody,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Replace the first slide, or create it when the section has none."""
    _require_admin(user)
    _require_known_tutorial(tutorial_id)
    _ensure_tables()
    _require_media_section(db, tutorial_id, section_id)
    _load_tutorial_file(db, body.file_id)
    try:
        item = media_items.replace_first_or_create(
            db,
            tutorial_id=tutorial_id,
            section_id=section_id,
            file_object_id=body.file_id,
            user=user,
        )
    except (ProgrammingError, OperationalError) as e:
        db.rollback()
        _ensure_tables()
        raise HTTPException(
            status_code=503,
            detail="Tutorial media storage is not ready. Restart the API and try again.",
        ) from e
    return {"tutorial_id": tutorial_id, "section_id": section_id, "item": item}


@router.delete("/{tutorial_id}/media-slots/{section_id}")
def delete_media_slot(
    tutorial_id: str,
    section_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_admin(user)
    _require_known_tutorial(tutorial_id)
    _ensure_tables()
    try:
        media_items.clear_section_media(db, tutorial_id, section_id)
    except (ProgrammingError, OperationalError):
        db.rollback()
        _ensure_tables()
    return {"ok": True, "tutorial_id": tutorial_id, "section_id": section_id}
