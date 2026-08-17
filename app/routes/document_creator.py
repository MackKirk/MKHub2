"""
Document Creator API: templates, user documents CRUD, export to PDF.
"""
import copy
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional, List, Any

from fastapi import APIRouter, Depends, HTTPException, Body, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session
from pydantic import BaseModel

from ..db import get_db
from ..models.models import DocumentTemplate, DocumentType, UserDocument, User, FileObject, Project, Client, ClientSite, EmployeeProfile
from ..auth.security import get_current_user, require_permissions


router = APIRouter(prefix="/document-creator", tags=["document-creator"])


# --- Schemas ---

class TemplateOut(BaseModel):
    id: str
    name: str
    description: Optional[str]
    background_file_id: Optional[str]
    areas_definition: Optional[dict]

    class Config:
        from_attributes = True


class TemplateDetailOut(TemplateOut):
    pass


class DocumentPage(BaseModel):
    template_id: Optional[str] = None
    areas_content: Optional[dict] = None


class DocumentCreate(BaseModel):
    title: str
    document_type_id: Optional[str] = None
    project_id: Optional[str] = None
    pages: Optional[List[dict]] = None  # [{ template_id, areas_content }, ...]


class DocumentUpdate(BaseModel):
    title: Optional[str] = None
    project_id: Optional[str] = None  # set to "" to unlink from project
    pages: Optional[List[dict]] = None
    # ISO timestamp from last GET/PATCH; required when changing title or pages (unless doc has never been saved).
    expected_updated_at: Optional[str] = None
    # Editor session that holds the soft lock; required with content changes when a lock is active.
    edit_lock_session_id: Optional[str] = None


class DocumentEditLockBody(BaseModel):
    session_id: str


class ExportPdfOptions(BaseModel):
    canvas_width_px: Optional[float] = None


EDIT_LOCK_LEASE_SECONDS = 300


def _parse_iso_datetime(value: Optional[str]) -> Optional[datetime]:
    if value is None or value == "":
        return None
    s = value.strip()
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(s)
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def _datetimes_equal(a: Optional[datetime], b: Optional[datetime]) -> bool:
    if a is None and b is None:
        return True
    if a is None or b is None:
        return False
    a_utc = a.astimezone(timezone.utc) if a.tzinfo else a.replace(tzinfo=timezone.utc)
    b_utc = b.astimezone(timezone.utc) if b.tzinfo else b.replace(tzinfo=timezone.utc)
    # Compare at millisecond precision (JS / Postgres ISO differences).
    return int(a_utc.timestamp() * 1000) == int(b_utc.timestamp() * 1000)


def _edit_lock_active(doc: UserDocument, now: Optional[datetime] = None) -> bool:
    expires = getattr(doc, "edit_lock_expires_at", None)
    if not expires or not getattr(doc, "edit_lock_session_id", None):
        return False
    now = now or datetime.now(timezone.utc)
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    return expires > now


def _holder_display_name(db: Session, user_id: Optional[uuid.UUID]) -> Optional[str]:
    """Human-readable lock holder: preferred/legal name from employee profile, else username."""
    if not user_id:
        return None
    u = db.query(User).filter(User.id == user_id).first()
    if not u:
        return None
    ep = db.query(EmployeeProfile).filter(EmployeeProfile.user_id == user_id).first()
    if ep:
        pref = (ep.preferred_name or "").strip()
        ln = (ep.last_name or "").strip()
        if pref:
            return f"{pref} {ln}".strip() if ln else pref
        fn = (ep.first_name or "").strip()
        if fn or ln:
            return f"{fn} {ln}".strip()
    return (u.username or "").strip() or (u.email_personal or "").strip() or str(u.id)


def _edit_lock_payload(doc: UserDocument, db: Session, now: Optional[datetime] = None) -> dict:
    now = now or datetime.now(timezone.utc)
    active = _edit_lock_active(doc, now)
    expires = getattr(doc, "edit_lock_expires_at", None)
    return {
        "active": active,
        "user_id": str(doc.edit_lock_user_id) if active and doc.edit_lock_user_id else None,
        "user_name": _holder_display_name(db, doc.edit_lock_user_id) if active else None,
        "session_id": doc.edit_lock_session_id if active else None,
        "expires_at": expires.isoformat() if active and expires else None,
    }


def _clear_edit_lock(doc: UserDocument) -> None:
    doc.edit_lock_user_id = None
    doc.edit_lock_session_id = None
    doc.edit_lock_expires_at = None


def _grant_edit_lock(doc: UserDocument, user: User, session_id: str, now: Optional[datetime] = None) -> None:
    now = now or datetime.now(timezone.utc)
    doc.edit_lock_user_id = user.id
    doc.edit_lock_session_id = session_id[:64]
    doc.edit_lock_expires_at = now + timedelta(seconds=EDIT_LOCK_LEASE_SECONDS)


def _template_to_out(t: DocumentTemplate) -> dict:
    return {
        "id": str(t.id),
        "name": t.name,
        "description": t.description,
        "background_file_id": str(t.background_file_id) if t.background_file_id else None,
        "areas_definition": getattr(t, "areas_definition", None),
        "margins": getattr(t, "margins", None),
        "default_elements": getattr(t, "default_elements", None),
    }


def _doc_to_out(d: UserDocument, db: Optional[Session] = None) -> dict:
    pages = d.pages
    # Repair display for docs created before richLines token substitution existed:
    # content may already be filled while richLines still hold <Project Name> etc.
    if db is not None:
        pages = _pages_with_project_tokens(pages, d.project_id, db, when=d.created_at)

    out = {
        "id": str(d.id),
        "title": d.title,
        "document_type_id": str(d.document_type_id) if d.document_type_id else None,
        "project_id": str(d.project_id) if d.project_id else None,
        "pages": pages,
        "created_by": str(d.created_by) if d.created_by else None,
        "created_at": d.created_at.isoformat() if d.created_at else None,
        "updated_at": d.updated_at.isoformat() if d.updated_at else None,
    }
    if db is not None:
        out["edit_lock"] = _edit_lock_payload(d, db)
    else:
        # Lightweight (list/summary paths): lock state without user lookup name.
        now = datetime.now(timezone.utc)
        active = _edit_lock_active(d, now)
        expires = getattr(d, "edit_lock_expires_at", None)
        out["edit_lock"] = {
            "active": active,
            "user_id": str(d.edit_lock_user_id) if active and d.edit_lock_user_id else None,
            "user_name": None,
            "session_id": d.edit_lock_session_id if active else None,
            "expires_at": expires.isoformat() if active and expires else None,
        }
    return out


_LIST_PREVIEW_PAGE_LIMIT = 4


def _doc_to_summary(d: UserDocument) -> dict:
    """Slim list payload: metadata + at most the first N pages for list thumbnails."""
    pages = d.pages if isinstance(d.pages, list) else []
    return {
        "id": str(d.id),
        "title": d.title,
        "document_type_id": str(d.document_type_id) if d.document_type_id else None,
        "project_id": str(d.project_id) if d.project_id else None,
        "page_count": len(pages),
        "pages": pages[:_LIST_PREVIEW_PAGE_LIMIT],
        "created_by": str(d.created_by) if d.created_by else None,
        "created_at": d.created_at.isoformat() if d.created_at else None,
        "updated_at": d.updated_at.isoformat() if d.updated_at else None,
    }


def _clone_elements_with_new_ids(elements: Optional[list], prefix: str) -> list:
    """Clone default_elements and assign new ids so they are unique per page."""
    if not elements or not isinstance(elements, list):
        return []
    import time
    base = str(int(time.time() * 1000))
    out = []
    for i, el in enumerate(elements):
        if not isinstance(el, dict):
            continue
        copy = dict(el)
        copy["id"] = f"{prefix}-{base}-{i}-{uuid.uuid4().hex[:8]}"
        out.append(copy)
    return out


# --- Project token auto-fill ---

# Ordered list of (token_in_template, value_key). Order matters: more specific tokens first.
_PLACEHOLDER_TOKENS: list[tuple[str, str]] = [
    ("<Project Name>", "project_name"),
    ("<Project Address>", "project_address"),
    ("<Customer Name>", "customer_name"),
    ("<Customer Address>", "customer_address"),
    ("<Reference Code>", "reference_code"),
    ("REFERENCE CODE", "reference_code"),
    ("<Auto Date>", "auto_date"),
]


_TRAILING_COUNTRY_NAMES = frozenset(
    {
        "canada",
        "united states of america",
        "united states",
        "usa",
        "u.s.a.",
        "u.s.",
        "us",
    }
)


def _strip_trailing_country(address: str) -> str:
    """Drop a trailing country segment, e.g. '... BC V1M 3C8, Canada' -> '... BC V1M 3C8'."""
    text = (address or "").strip()
    if not text:
        return ""
    parts = [p.strip() for p in text.split(",") if p.strip()]
    while len(parts) > 1 and parts[-1].casefold() in _TRAILING_COUNTRY_NAMES:
        parts.pop()
    return ", ".join(parts)


def _format_address_lines(line1: Optional[str], line2: Optional[str] = None) -> str:
    """Street address only: line1/line2, without trailing country."""
    lines: list[str] = []
    for part in (line1, line2):
        text = _strip_trailing_country(part or "")
        if text:
            lines.append(text)
    return "\n".join(lines)


def _format_customer_address(client: Client) -> str:
    """Primary client street address (line1/line2 only)."""
    return _format_address_lines(client.address_line1, client.address_line2)


def _format_project_address(proj: Project, db: Session) -> str:
    """Site street address when linked; otherwise project.address (no city/postal)."""
    site = db.get(ClientSite, proj.site_id) if proj.site_id else None
    line1 = (getattr(site, "site_address_line1", None) if site else None) or proj.address
    line2 = (getattr(site, "site_address_line2", None) if site else None) or None
    return _format_address_lines(line1, line2)


def _format_auto_date(when: Optional[datetime] = None, tz_name: Optional[str] = None) -> str:
    """Long English date, e.g. August 17, 2026 (project/local timezone)."""
    try:
        from zoneinfo import ZoneInfo

        tz = ZoneInfo((tz_name or "America/Vancouver").strip() or "America/Vancouver")
    except Exception:
        tz = timezone.utc
    dt = when or datetime.now(timezone.utc)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    local = dt.astimezone(tz)
    return f"{local.strftime('%B')} {local.day}, {local.year}"


def _replace_tokens_in_text(content: str, values: dict) -> str:
    for token, key in _PLACEHOLDER_TOKENS:
        content = content.replace(token, values.get(key, ""))
    return content


def _substitute_project_tokens(elements: list, values: dict) -> list:
    """Replace placeholder tokens in text elements (content + richLines runs). Mutates in place."""
    for el in elements:
        if el.get("type") != "text":
            continue
        if el.get("content"):
            el["content"] = _replace_tokens_in_text(el["content"], values)
        # Main canvas prefers richLines over content when present — must substitute both.
        rich = el.get("richLines") or el.get("rich_lines")
        if isinstance(rich, list):
            for line in rich:
                if not isinstance(line, list):
                    continue
                for run in line:
                    if isinstance(run, dict) and isinstance(run.get("text"), str):
                        run["text"] = _replace_tokens_in_text(run["text"], values)
    return elements


def _pages_with_project_tokens(
    pages: Any,
    project_id: Optional[uuid.UUID],
    db: Session,
    *,
    when: Optional[datetime] = None,
) -> Any:
    """Deep-copy pages and fill tokens. Auto Date uses `when` (e.g. doc created_at) or now."""
    if not isinstance(pages, list):
        return pages
    token_values = _project_token_values(project_id, db, when=when)
    pages = copy.deepcopy(pages)
    for page in pages:
        if isinstance(page, dict) and isinstance(page.get("elements"), list):
            _substitute_project_tokens(page["elements"], token_values)
    return pages


def _project_token_values(
    project_id: Optional[uuid.UUID],
    db: Session,
    *,
    when: Optional[datetime] = None,
) -> dict:
    """Build token substitution dict. Always includes auto_date; project fields when available."""
    tz_name = "America/Vancouver"
    values: dict = {
        "project_name": "",
        "project_address": "",
        "customer_name": "",
        "customer_address": "",
        "reference_code": "",
        "auto_date": "",
    }
    if project_id:
        proj = db.get(Project, project_id)
        if proj:
            tz_name = (proj.timezone or "").strip() or tz_name
            client_name = ""
            customer_address = ""
            if proj.client_id:
                client = db.get(Client, proj.client_id)
                if client:
                    client_name = client.display_name or client.name or ""
                    customer_address = _format_customer_address(client)
            values.update(
                {
                    "project_name": proj.name or "",
                    "project_address": _format_project_address(proj, db),
                    "customer_name": client_name,
                    "customer_address": customer_address,
                    "reference_code": proj.code or "",
                }
            )
    values["auto_date"] = _format_auto_date(when, tz_name=tz_name)
    return values


# --- Document types (preset page sequences) ---

@router.get("/document-types", response_model=List[dict])
def list_document_types(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _=Depends(require_permissions(
        "documents:read",
        "business:projects:documents:read",
        "settings:document_templates:read",
        "settings:document_templates:write",
    )),
):
    """List document type presets (e.g. cover + back cover + content page)."""
    types = db.query(DocumentType).order_by(DocumentType.category or "", DocumentType.name).all()
    return [
        {
            "id": str(t.id),
            "name": t.name,
            "description": t.description,
            "category": getattr(t, "category", None),
            "page_templates": t.page_templates or [],
            "created_at": t.created_at.isoformat() if t.created_at else None,
        }
        for t in types
    ]


class DocumentTypeCreate(BaseModel):
    name: str
    description: Optional[str] = None
    category: Optional[str] = None
    page_templates: Optional[List[dict]] = None  # [{ "template_id": "uuid", "label": "Cover", "margins?", "elements?" }]


class DocumentTypeUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    page_templates: Optional[List[dict]] = None


@router.post("/document-types", response_model=dict)
def create_document_type(
    body: DocumentTypeCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _=Depends(require_permissions(
        "documents:write",
        "business:projects:documents:write",
        "settings:document_templates:write",
    )),
):
    """Create a document type preset (ordered list of page templates)."""
    doc_type = DocumentType(
        name=body.name or "Unnamed",
        description=body.description,
        category=body.category,
        page_templates=body.page_templates if body.page_templates is not None else [],
    )
    db.add(doc_type)
    db.commit()
    db.refresh(doc_type)
    return {
        "id": str(doc_type.id),
        "name": doc_type.name,
        "description": doc_type.description,
        "category": doc_type.category,
        "page_templates": doc_type.page_templates or [],
        "created_at": doc_type.created_at.isoformat() if doc_type.created_at else None,
    }


@router.patch("/document-types/{document_type_id}", response_model=dict)
def update_document_type(
    document_type_id: str,
    body: DocumentTypeUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _=Depends(require_permissions(
        "documents:write",
        "business:projects:documents:write",
        "settings:document_templates:write",
    )),
):
    """Update a document type preset."""
    try:
        dtid = uuid.UUID(document_type_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid document type id")
    doc_type = db.query(DocumentType).filter(DocumentType.id == dtid).first()
    if not doc_type:
        raise HTTPException(status_code=404, detail="Document type not found")
    if body.name is not None:
        doc_type.name = body.name
    if body.description is not None:
        doc_type.description = body.description
    if body.category is not None:
        doc_type.category = body.category
    if body.page_templates is not None:
        doc_type.page_templates = body.page_templates
    db.commit()
    db.refresh(doc_type)
    return {
        "id": str(doc_type.id),
        "name": doc_type.name,
        "description": doc_type.description,
        "category": doc_type.category,
        "page_templates": doc_type.page_templates or [],
        "created_at": doc_type.created_at.isoformat() if doc_type.created_at else None,
    }


@router.delete("/document-types/{document_type_id}")
def delete_document_type(
    document_type_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _=Depends(require_permissions(
        "documents:write",
        "business:projects:documents:write",
        "settings:document_templates:write",
    )),
):
    """Delete a document type preset."""
    try:
        dtid = uuid.UUID(document_type_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid document type id")
    doc_type = db.query(DocumentType).filter(DocumentType.id == dtid).first()
    if not doc_type:
        raise HTTPException(status_code=404, detail="Document type not found")
    db.delete(doc_type)
    db.commit()
    return {"ok": True}


@router.post("/document-types/{document_type_id}/duplicate", response_model=dict)
def duplicate_document_type(
    document_type_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _=Depends(require_permissions(
        "documents:write",
        "business:projects:documents:write",
        "settings:document_templates:write",
    )),
):
    """Duplicate a document type preset. Creates a new one with name + ' (copy)' and same category, description, page_templates."""
    try:
        dtid = uuid.UUID(document_type_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid document type id")
    doc_type = db.query(DocumentType).filter(DocumentType.id == dtid).first()
    if not doc_type:
        raise HTTPException(status_code=404, detail="Document type not found")
    copy_name = (doc_type.name or "Template").strip() + " (copy)"
    page_templates = doc_type.page_templates
    if isinstance(page_templates, list):
        page_templates = copy.deepcopy(page_templates)
    new_type = DocumentType(
        name=copy_name,
        description=doc_type.description,
        category=doc_type.category,
        page_templates=page_templates or [],
    )
    db.add(new_type)
    db.commit()
    db.refresh(new_type)
    return {
        "id": str(new_type.id),
        "name": new_type.name,
        "description": new_type.description,
        "category": new_type.category,
        "page_templates": new_type.page_templates or [],
        "created_at": new_type.created_at.isoformat() if new_type.created_at else None,
    }


@router.get("/document-types/{document_type_id}/expand-pages", response_model=List[dict])
def expand_document_type_pages(
    document_type_id: str,
    project_id: Optional[str] = Query(None, description="When set, substitute project tokens in text elements."),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _=Depends(require_permissions("documents:read", "business:projects:documents:read")),
):
    """Expand a document type into a list of pages (template_id, margins, elements) with cloned element ids.
    Use when adding pages from a template to an existing document. Uses template default_elements when entry has no elements.
    When project_id is provided, placeholder tokens in text elements are replaced with the project's data."""
    try:
        dtid = uuid.UUID(document_type_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid document type id")
    doc_type = db.query(DocumentType).filter(DocumentType.id == dtid).first()
    if not doc_type:
        raise HTTPException(status_code=404, detail="Document type not found")
    pt_list = doc_type.page_templates or []
    if not isinstance(pt_list, list):
        pt_list = []
    pages: List[dict] = []
    for idx, entry in enumerate(pt_list):
        if not isinstance(entry, dict):
            pages.append({"template_id": None, "margins": None, "elements": []})
            continue
        tid = entry.get("template_id")
        if not tid:
            pages.append({
                "template_id": None,
                "margins": entry.get("margins"),
                "elements": _clone_elements_with_new_ids(entry.get("elements") if isinstance(entry.get("elements"), list) else [], f"p{idx}"),
            })
            continue
        try:
            tuid = uuid.UUID(tid) if isinstance(tid, str) else tid
        except (ValueError, TypeError):
            pages.append({"template_id": None, "margins": entry.get("margins"), "elements": []})
            continue
        template = db.query(DocumentTemplate).filter(DocumentTemplate.id == tuid).first()
        if not template:
            pages.append({"template_id": str(tuid), "margins": entry.get("margins"), "elements": []})
            continue
        entry_margins = entry.get("margins")
        entry_elements = entry.get("elements") if isinstance(entry.get("elements"), list) else None
        if entry_elements:
            elements = _clone_elements_with_new_ids(entry_elements, f"p{idx}")
        else:
            elements = _clone_elements_with_new_ids(
                template.default_elements if isinstance(template.default_elements, list) else [],
                f"p{idx}",
            )
        margins = entry_margins if entry_margins is not None else getattr(template, "margins", None)
        pages.append({"template_id": str(tuid), "margins": margins, "elements": elements})
    # Auto-fill tokens (project fields + Auto Date at expand time)
    now = datetime.now(timezone.utc)
    try:
        pid = uuid.UUID(project_id) if project_id else None
    except ValueError:
        pid = None
    token_values = _project_token_values(pid, db, when=now)
    for page in pages:
        _substitute_project_tokens(page.get("elements", []), token_values)
    return pages


# --- Templates ---

@router.get("/templates", response_model=List[dict])
def list_templates(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _=Depends(require_permissions(
        "documents:read",
        "business:projects:documents:read",
        "settings:document_backgrounds:read",
        "settings:document_backgrounds:write",
        "settings:document_templates:read",
        "settings:document_templates:write",
    )),
):
    """List all document templates (name, id, thumbnail via background_file_id)."""
    templates = db.query(DocumentTemplate).order_by(DocumentTemplate.name).all()
    return [_template_to_out(t) for t in templates]


@router.get("/templates/{template_id}", response_model=dict)
def get_template(
    template_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _=Depends(require_permissions(
        "documents:read",
        "business:projects:documents:read",
        "settings:document_backgrounds:read",
        "settings:document_backgrounds:write",
        "settings:document_templates:read",
        "settings:document_templates:write",
    )),
):
    """Get template by id including areas_definition."""
    try:
        tid = uuid.UUID(template_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid template id")
    t = db.query(DocumentTemplate).filter(DocumentTemplate.id == tid).first()
    if not t:
        raise HTTPException(status_code=404, detail="Template not found")
    return _template_to_out(t)


class TemplateCreate(BaseModel):
    name: str
    description: Optional[str] = None
    background_file_id: Optional[str] = None
    margins: Optional[dict] = None  # { left_pct, right_pct, top_pct, bottom_pct }
    default_elements: Optional[List[dict]] = None  # list of DocElement-shaped dicts


class TemplateUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    background_file_id: Optional[str] = None
    margins: Optional[dict] = None
    default_elements: Optional[List[dict]] = None


@router.post("/templates", response_model=dict)
def create_template(
    body: TemplateCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _=Depends(require_permissions(
        "documents:write",
        "business:projects:documents:write",
        "settings:document_backgrounds:write",
    )),
):
    """Create a new document template (background)."""
    bg_id = None
    if body.background_file_id:
        try:
            bg_id = uuid.UUID(body.background_file_id)
            fo = db.query(FileObject).filter(FileObject.id == bg_id).first()
            if not fo:
                raise HTTPException(status_code=400, detail="File not found")
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid background_file_id")
    t = DocumentTemplate(
        name=body.name or "Sem nome",
        description=body.description,
        background_file_id=bg_id,
        margins=body.margins,
        default_elements=body.default_elements,
    )
    db.add(t)
    db.commit()
    db.refresh(t)
    return _template_to_out(t)


@router.patch("/templates/{template_id}", response_model=dict)
def update_template(
    template_id: str,
    body: TemplateUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _=Depends(require_permissions(
        "documents:write",
        "business:projects:documents:write",
        "settings:document_backgrounds:write",
    )),
):
    """Update template name, description or background."""
    try:
        tid = uuid.UUID(template_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid template id")
    t = db.query(DocumentTemplate).filter(DocumentTemplate.id == tid).first()
    if not t:
        raise HTTPException(status_code=404, detail="Template not found")
    if body.name is not None:
        t.name = body.name
    if body.description is not None:
        t.description = body.description
    if body.background_file_id is not None:
        if body.background_file_id == "":
            t.background_file_id = None
        else:
            try:
                t.background_file_id = uuid.UUID(body.background_file_id)
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid background_file_id")
    if body.margins is not None:
        t.margins = body.margins
    if body.default_elements is not None:
        t.default_elements = body.default_elements
    db.commit()
    db.refresh(t)
    return _template_to_out(t)


@router.delete("/templates/{template_id}")
def delete_template(
    template_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _=Depends(require_permissions(
        "documents:write",
        "business:projects:documents:write",
        "settings:document_backgrounds:write",
    )),
):
    """Delete a template."""
    try:
        tid = uuid.UUID(template_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid template id")
    t = db.query(DocumentTemplate).filter(DocumentTemplate.id == tid).first()
    if not t:
        raise HTTPException(status_code=404, detail="Template not found")
    db.delete(t)
    db.commit()
    return {"ok": True}


# --- Documents ---

@router.get("/documents", response_model=List[dict])
def list_documents(
    project_id: Optional[str] = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _=Depends(require_permissions("documents:read", "business:projects:documents:read")),
):
    """List documents. Optionally filter by project_id. With project docs permission, list all docs for that project."""
    from ..auth.security import _has_project_feature_permission
    if project_id:
        try:
            pid = uuid.UUID(project_id)
            proj = db.query(Project).filter(Project.id == pid).first()
            line = getattr(proj, "business_line", None) if proj else None
            if proj and _has_project_feature_permission(user, line, "documents", "read"):
                q = db.query(UserDocument).filter(UserDocument.project_id == pid)
            else:
                q = db.query(UserDocument).filter(
                    UserDocument.created_by == user.id,
                    UserDocument.project_id == pid,
                )
        except ValueError:
            q = db.query(UserDocument).filter(UserDocument.created_by == user.id)
    else:
        q = db.query(UserDocument).filter(UserDocument.created_by == user.id)
        if project_id:
            try:
                pid = uuid.UUID(project_id)
                q = q.filter(UserDocument.project_id == pid)
            except ValueError:
                pass
    docs = q.order_by(
        UserDocument.updated_at.desc().nullslast(), UserDocument.created_at.desc()
    ).all()
    return [_doc_to_summary(d) for d in docs]


@router.post("/documents", response_model=dict)
def create_document(
    body: DocumentCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _=Depends(require_permissions("documents:write", "business:projects:documents:write")),
):
    """Create a new user document. If document_type_id is set, pages are built from that preset."""
    pages = body.pages if body.pages is not None else []
    dtype_id = None
    if body.document_type_id:
        try:
            dtype_id = uuid.UUID(body.document_type_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid document_type_id")
        doc_type = db.query(DocumentType).filter(DocumentType.id == dtype_id).first()
        if not doc_type:
            raise HTTPException(status_code=404, detail="Document type not found")
        pt_list = doc_type.page_templates or []
        if not isinstance(pt_list, list):
            pt_list = []
        pages = []
        for idx, entry in enumerate(pt_list):
            if not isinstance(entry, dict):
                pages.append({"template_id": None, "elements": []})
                continue
            tid = entry.get("template_id")
            if not tid:
                pages.append({"template_id": None, "elements": [], "margins": entry.get("margins")})
                continue
            try:
                tuid = uuid.UUID(tid) if isinstance(tid, str) else tid
            except (ValueError, TypeError):
                pages.append({"template_id": None, "elements": [], "margins": entry.get("margins")})
                continue
            template = db.query(DocumentTemplate).filter(DocumentTemplate.id == tuid).first()
            if not template:
                pages.append({"template_id": str(tuid), "elements": [], "margins": entry.get("margins")})
                continue
            entry_margins = entry.get("margins")
            entry_elements = entry.get("elements") if isinstance(entry.get("elements"), list) else []
            elements = _clone_elements_with_new_ids(entry_elements, f"p{idx}") if entry_elements else []
            pages.append({"template_id": str(tuid), "margins": entry_margins, "elements": elements})
    # Auto-fill tokens (project fields + Auto Date at document create time)
    now = datetime.now(timezone.utc)
    try:
        pid = uuid.UUID(body.project_id) if body.project_id else None
    except ValueError:
        pid = None
    token_values = _project_token_values(pid, db, when=now)
    for page in pages:
        _substitute_project_tokens(page.get("elements", []), token_values)
    doc = UserDocument(
        title=body.title or "Sem título",
        document_type_id=dtype_id,
        project_id=uuid.UUID(body.project_id) if body.project_id else None,
        pages=pages,
        created_by=user.id,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return _doc_to_out(doc)


def _can_access_document(
    user: User,
    doc: UserDocument,
    db: Session,
    require_write: bool = False,
) -> bool:
    """True if user can access (read or write) this document."""
    from ..auth.security import _has_project_feature_permission, _user_is_admin

    if _user_is_admin(user):
        return True
    if doc.created_by == user.id:
        return True
    if not doc.project_id:
        return False
    proj = db.query(Project).filter(Project.id == doc.project_id).first()
    if not proj:
        return False
    line = getattr(proj, "business_line", None)
    action = "write" if require_write else "read"
    return _has_project_feature_permission(user, line, "documents", action)


@router.get("/documents/{document_id}", response_model=dict)
def get_document(
    document_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _=Depends(require_permissions("documents:read", "business:projects:documents:read")),
):
    """Get document by id. Owner or user with project documents permission can access."""
    try:
        did = uuid.UUID(document_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid document id")
    doc = db.query(UserDocument).filter(UserDocument.id == did).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if not _can_access_document(user, doc, db, require_write=False):
        raise HTTPException(status_code=403, detail="Forbidden")
    return _doc_to_out(doc, db)


@router.post("/documents/{document_id}/edit-lock", response_model=dict)
def acquire_document_edit_lock(
    document_id: str,
    body: DocumentEditLockBody,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _=Depends(require_permissions("documents:write", "business:projects:documents:write")),
):
    """Acquire or renew an exclusive edit lock for this session."""
    session_id = (body.session_id or "").strip()
    if not session_id or len(session_id) > 64:
        raise HTTPException(status_code=400, detail="Invalid session_id")
    try:
        did = uuid.UUID(document_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid document id")
    doc = db.query(UserDocument).filter(UserDocument.id == did).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if not _can_access_document(user, doc, db, require_write=True):
        raise HTTPException(status_code=403, detail="Forbidden")

    now = datetime.now(timezone.utc)
    if _edit_lock_active(doc, now) and doc.edit_lock_session_id != session_id:
        # Another browser tab / crashed session of the *same* user left a live lease.
        # Let them reclaim it instead of blocking themselves for up to EDIT_LOCK_LEASE_SECONDS.
        if doc.edit_lock_user_id != user.id:
            raise HTTPException(
                status_code=409,
                detail={
                    "code": "document_in_use",
                    "message": "This document is already open for editing elsewhere.",
                    "holder_name": _holder_display_name(db, doc.edit_lock_user_id),
                    "expires_at": doc.edit_lock_expires_at.isoformat() if doc.edit_lock_expires_at else None,
                },
            )

    _grant_edit_lock(doc, user, session_id, now)
    db.commit()
    db.refresh(doc)
    return {"ok": True, "edit_lock": _edit_lock_payload(doc, db, now)}


@router.post("/documents/{document_id}/edit-lock/heartbeat", response_model=dict)
def heartbeat_document_edit_lock(
    document_id: str,
    body: DocumentEditLockBody,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _=Depends(require_permissions("documents:write", "business:projects:documents:write")),
):
    """Renew edit lock lease for the holding session."""
    session_id = (body.session_id or "").strip()
    if not session_id:
        raise HTTPException(status_code=400, detail="Invalid session_id")
    try:
        did = uuid.UUID(document_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid document id")
    doc = db.query(UserDocument).filter(UserDocument.id == did).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if not _can_access_document(user, doc, db, require_write=True):
        raise HTTPException(status_code=403, detail="Forbidden")

    now = datetime.now(timezone.utc)
    if not _edit_lock_active(doc, now) or doc.edit_lock_session_id != session_id:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "document_lock_lost",
                "message": "Edit lock is no longer held by this session.",
                "edit_lock": _edit_lock_payload(doc, db, now),
            },
        )

    _grant_edit_lock(doc, user, session_id, now)
    db.commit()
    db.refresh(doc)
    return {"ok": True, "edit_lock": _edit_lock_payload(doc, db, now)}


@router.delete("/documents/{document_id}/edit-lock", response_model=dict)
def release_document_edit_lock(
    document_id: str,
    session_id: str = Query(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _=Depends(require_permissions("documents:write", "business:projects:documents:write")),
):
    """Release edit lock if held by this session."""
    session_id = (session_id or "").strip()
    if not session_id:
        raise HTTPException(status_code=400, detail="Invalid session_id")
    try:
        did = uuid.UUID(document_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid document id")
    doc = db.query(UserDocument).filter(UserDocument.id == did).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if not _can_access_document(user, doc, db, require_write=True):
        raise HTTPException(status_code=403, detail="Forbidden")

    if doc.edit_lock_session_id == session_id:
        _clear_edit_lock(doc)
        db.commit()
    return {"ok": True}


@router.patch("/documents/{document_id}", response_model=dict)
def update_document(
    document_id: str,
    body: DocumentUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _=Depends(require_permissions("documents:write", "business:projects:documents:write")),
):
    """Update document. Owner or user with project documents write permission can update."""
    try:
        did = uuid.UUID(document_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid document id")
    doc = db.query(UserDocument).filter(UserDocument.id == did).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if not _can_access_document(user, doc, db, require_write=True):
        raise HTTPException(status_code=403, detail="Forbidden")

    content_changing = body.title is not None or body.pages is not None
    if content_changing:
        now = datetime.now(timezone.utc)
        if _edit_lock_active(doc, now):
            session_id = (body.edit_lock_session_id or "").strip()
            if not session_id or session_id != doc.edit_lock_session_id:
                raise HTTPException(
                    status_code=409,
                    detail={
                        "code": "document_in_use",
                        "message": "This document is already open for editing elsewhere.",
                        "holder_name": _holder_display_name(db, doc.edit_lock_user_id),
                        "expires_at": doc.edit_lock_expires_at.isoformat() if doc.edit_lock_expires_at else None,
                    },
                )

        if body.expected_updated_at is None and doc.updated_at is not None:
            raise HTTPException(
                status_code=400,
                detail={
                    "code": "expected_updated_at_required",
                    "message": "expected_updated_at is required when updating title or pages.",
                },
            )
        raw_expected = (body.expected_updated_at or "").strip()
        expected = _parse_iso_datetime(raw_expected) if raw_expected else None
        if raw_expected and expected is None:
            raise HTTPException(status_code=400, detail="Invalid expected_updated_at")
        # Null/empty expected only matches null DB updated_at (brand-new docs).
        if not _datetimes_equal(doc.updated_at, expected):
            raise HTTPException(
                status_code=409,
                detail={
                    "code": "document_version_conflict",
                    "message": "This document was changed elsewhere. Your local changes were not saved over the latest version.",
                    "updated_at": doc.updated_at.isoformat() if doc.updated_at else None,
                },
            )

    if body.title is not None:
        doc.title = body.title
    if body.project_id is not None:
        doc.project_id = uuid.UUID(body.project_id) if body.project_id else None
    if body.pages is not None:
        doc.pages = body.pages
    if content_changing or body.project_id is not None:
        doc.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(doc)
    return _doc_to_out(doc, db)


@router.delete("/documents/{document_id}")
def delete_document(
    document_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _=Depends(require_permissions("documents:write", "business:projects:documents:write")),
):
    """Delete a document. Owner or user with project documents write permission can delete."""
    try:
        did = uuid.UUID(document_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid document id")
    doc = db.query(UserDocument).filter(UserDocument.id == did).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if not _can_access_document(user, doc, db, require_write=True):
        raise HTTPException(status_code=403, detail="Forbidden")
    db.delete(doc)
    db.commit()
    return {"ok": True}


@router.post("/documents/{document_id}/export-pdf")
def export_document_pdf(
    document_id: str,
    body: Optional[ExportPdfOptions] = Body(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _=Depends(require_permissions("documents:read", "business:projects:documents:read")),
):
    """Generate PDF for the document and return file."""
    try:
        did = uuid.UUID(document_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid document id")
    doc = db.query(UserDocument).filter(UserDocument.id == did).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if not _can_access_document(user, doc, db, require_write=False):
        raise HTTPException(status_code=403, detail="Forbidden")

    try:
        from ..document_creator.pdf_builder import build_pdf_bytes
        original_pages = doc.pages
        doc.pages = _pages_with_project_tokens(original_pages, doc.project_id, db, when=doc.created_at)
        try:
            pdf_bytes = build_pdf_bytes(db, doc, canvas_width_px=(body.canvas_width_px if body else None))
        finally:
            doc.pages = original_pages
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PDF generation failed: {str(e)}")

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{doc.title or "document"}.pdf"',
        },
    )
