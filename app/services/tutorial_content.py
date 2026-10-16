"""Merge tutorial seed markdown with admin DB overrides / custom sections."""

from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from ..models.models import TutorialMediaItem, TutorialMediaSlot, TutorialSection, User
from .tutorial_seeds import get_seed_section, get_seed_sections, known_tutorial_ids


def is_known_tutorial(tutorial_id: str) -> bool:
    return tutorial_id in known_tutorial_ids()


def _row_payload(row: TutorialSection, *, origin: str, is_overridden: bool) -> Dict[str, Any]:
    return {
        "id": row.section_id,
        "title": row.title,
        "body_md": row.body_md or "",
        "allows_media": bool(row.allows_media),
        "origin": origin,
        "is_overridden": is_overridden,
        "sort_order": int(row.sort_order),
        "hidden": bool(row.hidden),
    }


def merge_tutorial_sections(db: Session, tutorial_id: str) -> List[Dict[str, Any]]:
    seeds = get_seed_sections(tutorial_id)
    if seeds is None:
        return []

    rows = (
        db.query(TutorialSection)
        .filter(TutorialSection.tutorial_id == tutorial_id)
        .all()
    )
    by_id = {r.section_id: r for r in rows}
    out: List[Dict[str, Any]] = []

    for seed in seeds:
        row = by_id.get(seed.id)
        if row and row.hidden:
            continue
        if row:
            out.append(
                {
                    "id": seed.id,
                    "title": row.title,
                    "body_md": row.body_md or "",
                    "allows_media": bool(row.allows_media),
                    "origin": "seed",
                    "is_overridden": True,
                    "sort_order": int(row.sort_order),
                }
            )
        else:
            out.append(
                {
                    "id": seed.id,
                    "title": seed.title,
                    "body_md": seed.body_md,
                    "allows_media": seed.allows_media,
                    "origin": "seed",
                    "is_overridden": False,
                    "sort_order": seed.sort_order,
                }
            )

    for row in rows:
        if row.origin != "custom":
            continue
        if row.hidden:
            continue
        # Skip if somehow colliding with a seed id
        if get_seed_section(tutorial_id, row.section_id):
            continue
        out.append(
            {
                "id": row.section_id,
                "title": row.title,
                "body_md": row.body_md or "",
                "allows_media": bool(row.allows_media),
                "origin": "custom",
                "is_overridden": True,
                "sort_order": int(row.sort_order),
            }
        )

    out.sort(key=lambda s: (s["sort_order"], s["id"]))
    return out


def section_allows_media(db: Session, tutorial_id: str, section_id: str) -> bool:
    for s in merge_tutorial_sections(db, tutorial_id):
        if s["id"] == section_id:
            return bool(s.get("allows_media"))
    return False


def media_allowed_section_ids(db: Session, tutorial_id: str) -> set:
    return {s["id"] for s in merge_tutorial_sections(db, tutorial_id) if s.get("allows_media")}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def upsert_section_override(
    db: Session,
    *,
    tutorial_id: str,
    section_id: str,
    title: str,
    body_md: str,
    allows_media: bool,
    user: User,
    sort_order: Optional[int] = None,
) -> Dict[str, Any]:
    seed = get_seed_section(tutorial_id, section_id)
    row = (
        db.query(TutorialSection)
        .filter(
            TutorialSection.tutorial_id == tutorial_id,
            TutorialSection.section_id == section_id,
        )
        .first()
    )
    if row and row.origin == "custom":
        origin = "custom"
    elif seed:
        origin = "seed"
    elif row:
        origin = row.origin or "custom"
    else:
        raise ValueError("unknown_section")

    if row is None:
        if not seed:
            raise ValueError("unknown_section")
        order = seed.sort_order if sort_order is None else sort_order
        row = TutorialSection(
            tutorial_id=tutorial_id,
            section_id=section_id,
            sort_order=order,
            title=title,
            body_md=body_md,
            allows_media=allows_media,
            origin="seed",
            hidden=False,
            updated_by=user.id,
            updated_at=_now(),
        )
        db.add(row)
    else:
        row.title = title
        row.body_md = body_md
        row.allows_media = allows_media
        row.hidden = False
        row.updated_by = user.id
        row.updated_at = _now()
        if sort_order is not None:
            row.sort_order = sort_order
        origin = row.origin

    db.commit()
    return {
        "id": section_id,
        "title": row.title,
        "body_md": row.body_md or "",
        "allows_media": bool(row.allows_media),
        "origin": origin,
        "is_overridden": True,
        "sort_order": int(row.sort_order),
    }


def create_custom_section(
    db: Session,
    *,
    tutorial_id: str,
    title: str,
    body_md: str,
    allows_media: bool,
    after_section_id: Optional[str],
    user: User,
) -> Dict[str, Any]:
    merged = merge_tutorial_sections(db, tutorial_id)
    if not merged and get_seed_sections(tutorial_id) is None:
        raise ValueError("unknown_tutorial")

    if after_section_id:
        idx = next((i for i, s in enumerate(merged) if s["id"] == after_section_id), None)
        if idx is None:
            raise ValueError("after_section_not_found")
        prev_order = merged[idx]["sort_order"]
        next_order = merged[idx + 1]["sort_order"] if idx + 1 < len(merged) else prev_order + 20
        sort_order = prev_order + max(1, (next_order - prev_order) // 2) if next_order > prev_order + 1 else prev_order + 10
        # If collision, reindex everyone after insert
        need_reindex = any(s["sort_order"] == sort_order for s in merged)
    else:
        sort_order = (merged[-1]["sort_order"] + 10) if merged else 10
        need_reindex = False
        idx = len(merged) - 1

    section_id = f"custom-{uuid.uuid4().hex[:10]}"
    row = TutorialSection(
        tutorial_id=tutorial_id,
        section_id=section_id,
        sort_order=sort_order,
        title=title,
        body_md=body_md,
        allows_media=allows_media,
        origin="custom",
        hidden=False,
        updated_by=user.id,
        updated_at=_now(),
    )
    db.add(row)
    db.flush()

    if need_reindex or after_section_id:
        # Rebuild order: merged ids with new section inserted after after_section_id
        ids = [s["id"] for s in merged]
        if after_section_id and after_section_id in ids:
            insert_at = ids.index(after_section_id) + 1
            ids.insert(insert_at, section_id)
        else:
            ids.append(section_id)
        _apply_order(db, tutorial_id, ids, user)
    else:
        db.commit()

    return {
        "id": section_id,
        "title": title,
        "body_md": body_md or "",
        "allows_media": bool(allows_media),
        "origin": "custom",
        "is_overridden": True,
        "sort_order": int(row.sort_order),
    }


def _ensure_row_for_order(
    db: Session,
    tutorial_id: str,
    section_id: str,
    sort_order: int,
    user: User,
) -> TutorialSection:
    row = (
        db.query(TutorialSection)
        .filter(
            TutorialSection.tutorial_id == tutorial_id,
            TutorialSection.section_id == section_id,
        )
        .first()
    )
    if row:
        row.sort_order = sort_order
        row.updated_by = user.id
        row.updated_at = _now()
        return row

    seed = get_seed_section(tutorial_id, section_id)
    if not seed:
        raise ValueError(f"unknown_section:{section_id}")
    row = TutorialSection(
        tutorial_id=tutorial_id,
        section_id=section_id,
        sort_order=sort_order,
        title=seed.title,
        body_md=seed.body_md,
        allows_media=seed.allows_media,
        origin="seed",
        hidden=False,
        updated_by=user.id,
        updated_at=_now(),
    )
    db.add(row)
    return row


def _apply_order(db: Session, tutorial_id: str, section_ids: List[str], user: User) -> None:
    for i, sid in enumerate(section_ids):
        _ensure_row_for_order(db, tutorial_id, sid, (i + 1) * 10, user)
    db.commit()


def reorder_sections(db: Session, tutorial_id: str, section_ids: List[str], user: User) -> List[Dict[str, Any]]:
    merged = merge_tutorial_sections(db, tutorial_id)
    current = {s["id"] for s in merged}
    incoming = list(section_ids)
    if set(incoming) != current:
        raise ValueError("section_ids_mismatch")
    _apply_order(db, tutorial_id, incoming, user)
    return merge_tutorial_sections(db, tutorial_id)


def reset_seed_section(db: Session, tutorial_id: str, section_id: str) -> None:
    seed = get_seed_section(tutorial_id, section_id)
    if not seed:
        raise ValueError("not_seed_section")
    row = (
        db.query(TutorialSection)
        .filter(
            TutorialSection.tutorial_id == tutorial_id,
            TutorialSection.section_id == section_id,
        )
        .first()
    )
    if row:
        if row.origin == "custom":
            raise ValueError("not_seed_section")
        db.delete(row)
        db.commit()


def delete_or_hide_section(db: Session, tutorial_id: str, section_id: str, user: User) -> str:
    """Returns 'deleted' or 'hidden'."""
    seed = get_seed_section(tutorial_id, section_id)
    row = (
        db.query(TutorialSection)
        .filter(
            TutorialSection.tutorial_id == tutorial_id,
            TutorialSection.section_id == section_id,
        )
        .first()
    )

    media = (
        db.query(TutorialMediaSlot)
        .filter(
            TutorialMediaSlot.tutorial_id == tutorial_id,
            TutorialMediaSlot.section_id == section_id,
        )
        .first()
    )
    (
        db.query(TutorialMediaItem)
        .filter(
            TutorialMediaItem.tutorial_id == tutorial_id,
            TutorialMediaItem.section_id == section_id,
        )
        .delete(synchronize_session=False)
    )

    if seed:
        if row is None:
            row = TutorialSection(
                tutorial_id=tutorial_id,
                section_id=section_id,
                sort_order=seed.sort_order,
                title=seed.title,
                body_md=seed.body_md,
                allows_media=seed.allows_media,
                origin="seed",
                hidden=True,
                updated_by=user.id,
                updated_at=_now(),
            )
            db.add(row)
        else:
            row.hidden = True
            row.updated_by = user.id
            row.updated_at = _now()
        if media:
            db.delete(media)
        db.commit()
        return "hidden"

    if row and row.origin == "custom":
        db.delete(row)
        if media:
            db.delete(media)
        db.commit()
        return "deleted"

    raise ValueError("unknown_section")


def list_hidden_sections(db: Session, tutorial_id: str) -> List[Dict[str, Any]]:
    """Seed (or seed-origin) rows currently hidden — for admin restore UI."""
    if not is_known_tutorial(tutorial_id):
        return []
    rows = (
        db.query(TutorialSection)
        .filter(
            TutorialSection.tutorial_id == tutorial_id,
            TutorialSection.hidden.is_(True),
        )
        .all()
    )
    out: List[Dict[str, Any]] = []
    for row in rows:
        # Customs are hard-deleted; only surface seed-origin hides.
        if row.origin == "custom" and not get_seed_section(tutorial_id, row.section_id):
            continue
        seed = get_seed_section(tutorial_id, row.section_id)
        out.append(
            {
                "id": row.section_id,
                "title": row.title or (seed.title if seed else row.section_id),
                "origin": "seed" if seed else (row.origin or "seed"),
            }
        )
    out.sort(key=lambda s: s["title"].lower())
    return out


def unhide_section(db: Session, tutorial_id: str, section_id: str, user: User) -> Dict[str, Any]:
    row = (
        db.query(TutorialSection)
        .filter(
            TutorialSection.tutorial_id == tutorial_id,
            TutorialSection.section_id == section_id,
            TutorialSection.hidden.is_(True),
        )
        .first()
    )
    if not row:
        raise ValueError("not_hidden")
    seed = get_seed_section(tutorial_id, section_id)
    if not seed and row.origin == "custom":
        raise ValueError("not_hidden")
    row.hidden = False
    row.updated_by = user.id
    row.updated_at = _now()
    db.commit()
    merged = merge_tutorial_sections(db, tutorial_id)
    restored = next((s for s in merged if s["id"] == section_id), None)
    if not restored:
        raise ValueError("not_hidden")
    return restored


_SLUG_RE = re.compile(r"[^a-z0-9]+")


def slugify_section_id(title: str) -> str:
    base = _SLUG_RE.sub("-", (title or "").strip().lower()).strip("-") or "step"
    return base[:80]
