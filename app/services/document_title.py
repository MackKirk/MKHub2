"""Auto-generated titles for scoped UserDocument instances."""
from __future__ import annotations

import uuid
from typing import List, Optional, Set

from sqlalchemy.orm import Session

from ..models.models import DocumentTemplate, DocumentType, Project, User, UserDocument
from .task_service import get_user_display

UNTITLED_TEMPLATE = "Untitled document"
_TITLE_MAX_LEN = 255


def _truncate_title(title: str) -> str:
    if len(title) <= _TITLE_MAX_LEN:
        return title
    return title[: _TITLE_MAX_LEN - 3].rstrip() + "..."


def resolve_template_name(
    db: Session,
    *,
    document_type_id: Optional[uuid.UUID],
    pages: Optional[List[dict]],
) -> str:
    if document_type_id:
        doc_type = db.query(DocumentType).filter(DocumentType.id == document_type_id).first()
        if doc_type and (doc_type.name or "").strip():
            return doc_type.name.strip()
    if pages:
        for page in pages:
            if not isinstance(page, dict):
                continue
            tid = page.get("template_id")
            if not tid:
                continue
            try:
                tuid = uuid.UUID(str(tid))
            except (ValueError, TypeError):
                continue
            template = db.query(DocumentTemplate).filter(DocumentTemplate.id == tuid).first()
            if template and (template.name or "").strip():
                return template.name.strip()
            break
    return UNTITLED_TEMPLATE


def resolve_scope_label(
    db: Session,
    *,
    project_id: Optional[uuid.UUID],
    subject_user_id: Optional[uuid.UUID],
) -> Optional[str]:
    if project_id:
        proj = db.query(Project).filter(Project.id == project_id).first()
        if proj and (proj.name or "").strip():
            return proj.name.strip()
        return None
    if subject_user_id:
        label = get_user_display(db, subject_user_id)
        if label and str(label).strip():
            return str(label).strip()
        user = db.query(User).filter(User.id == subject_user_id).first()
        if user:
            fallback = (user.username or user.email_personal or "").strip()
            return fallback or None
    return None


def build_scoped_document_title(
    db: Session,
    *,
    document_type_id: Optional[uuid.UUID],
    pages: Optional[List[dict]],
    project_id: Optional[uuid.UUID],
    subject_user_id: Optional[uuid.UUID],
) -> str:
    template = resolve_template_name(db, document_type_id=document_type_id, pages=pages)
    scope = resolve_scope_label(db, project_id=project_id, subject_user_id=subject_user_id)
    if scope:
        return _truncate_title(f"{template} - {scope}")
    return _truncate_title(template)


def existing_titles_in_scope(
    db: Session,
    *,
    project_id: Optional[uuid.UUID],
    subject_user_id: Optional[uuid.UUID],
    exclude_id: Optional[uuid.UUID] = None,
) -> Set[str]:
    if project_id:
        q = db.query(UserDocument.title).filter(UserDocument.project_id == project_id)
    elif subject_user_id:
        q = db.query(UserDocument.title).filter(UserDocument.subject_user_id == subject_user_id)
    else:
        return set()
    if exclude_id:
        q = q.filter(UserDocument.id != exclude_id)
    return {row[0] for row in q.all() if row[0]}


def unique_title_in_scope(
    db: Session,
    title: str,
    *,
    project_id: Optional[uuid.UUID],
    subject_user_id: Optional[uuid.UUID],
    exclude_id: Optional[uuid.UUID] = None,
) -> str:
    base = _truncate_title((title or "").strip() or UNTITLED_TEMPLATE)
    existing = existing_titles_in_scope(
        db,
        project_id=project_id,
        subject_user_id=subject_user_id,
        exclude_id=exclude_id,
    )
    if base not in existing:
        return base
    n = 1
    while True:
        candidate = _truncate_title(f"{base} ({n})")
        if candidate not in existing:
            return candidate
        n += 1


def title_taken_in_scope(
    db: Session,
    title: str,
    *,
    project_id: Optional[uuid.UUID],
    subject_user_id: Optional[uuid.UUID],
    exclude_id: Optional[uuid.UUID] = None,
) -> bool:
    normalized = (title or "").strip()
    if not normalized:
        return False
    return normalized in existing_titles_in_scope(
        db,
        project_id=project_id,
        subject_user_id=subject_user_id,
        exclude_id=exclude_id,
    )
