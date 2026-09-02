"""
Document Creator API: templates, user documents CRUD, export to PDF.
"""
import copy
import re
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional, List, Any

from fastapi import APIRouter, Depends, HTTPException, Body, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session
from pydantic import BaseModel

from ..db import get_db
from ..models.models import (
    DocumentTemplate,
    DocumentType,
    UserDocument,
    User,
    FileObject,
    Project,
    Client,
    ClientContact,
    ClientSite,
    EmployeeProfile,
    DocumentSignatureRequest,
    DocumentSignatureParticipant,
)
from ..auth.security import get_current_user, require_permissions, _has_permission, _user_is_admin


router = APIRouter(prefix="/document-creator", tags=["document-creator"])

_HR_USER_DOC_READ_PERMS = (
    "document_hub:builder:read",
    "business:projects:documents:read",
    "hr:users:view:general",
    "users:read",
)
_HR_USER_DOC_WRITE_PERMS = (
    "document_hub:builder:write",
    "business:projects:documents:write",
    "hr:users:edit:general",
    "users:write",
)


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
    title: Optional[str] = None
    document_type_id: Optional[str] = None
    project_id: Optional[str] = None
    subject_user_id: Optional[str] = None  # HR user-scoped builder; mutually exclusive with project_id
    pages: Optional[List[dict]] = None  # [{ template_id, areas_content }, ...]
    signer_roles: Optional[List[dict]] = None


class DocumentUpdate(BaseModel):
    title: Optional[str] = None
    project_id: Optional[str] = None  # set to "" to unlink from project
    subject_user_id: Optional[str] = None  # set to "" to unlink from subject user
    pages: Optional[List[dict]] = None
    signer_roles: Optional[List[dict]] = None
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


def _can_view_subject_user_docs(user: User) -> bool:
    if _user_is_admin(user):
        return True
    return any(
        _has_permission(user, p)
        for p in ("document_hub:builder:read", "hr:users:view:general", "users:read")
    )


def _can_edit_subject_user_docs(user: User) -> bool:
    if _user_is_admin(user):
        return True
    return any(
        _has_permission(user, p)
        for p in ("document_hub:builder:write", "hr:users:edit:general", "users:write")
    )


def _parse_optional_uuid(value: Optional[str], *, field: str) -> Optional[uuid.UUID]:
    if value is None or value == "":
        return None
    try:
        return uuid.UUID(value)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid {field}")


def _doc_to_out(d: UserDocument, db: Optional[Session] = None) -> dict:
    from ..services.document_signer_roles import ensure_document_signer_roles

    pages = d.pages
    # Repair display for docs created before richLines token substitution existed:
    # content may already be filled while richLines still hold <Project Name> etc.
    if db is not None:
        pages = _pages_with_project_tokens(
            pages,
            d.project_id,
            db,
            when=d.created_at,
            employee_user_id=getattr(d, "subject_user_id", None),
        )

    signer_roles = ensure_document_signer_roles(getattr(d, "signer_roles", None), d.pages)

    out = {
        "id": str(d.id),
        "title": d.title,
        "document_type_id": str(d.document_type_id) if d.document_type_id else None,
        "project_id": str(d.project_id) if d.project_id else None,
        "subject_user_id": str(d.subject_user_id) if getattr(d, "subject_user_id", None) else None,
        "pages": pages,
        "signer_roles": signer_roles,
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


def _document_scope(d: UserDocument) -> str:
    if getattr(d, "subject_user_id", None):
        return "user"
    if d.project_id:
        return "project"
    return "standalone"


def _signature_status_for_document(
    d: UserDocument,
    latest_request: Optional[DocumentSignatureRequest],
    participants: Optional[List[DocumentSignatureParticipant]],
) -> dict:
    """Derive list-row signature badge from latest non-cancelled request or page fields."""
    parts = participants or []
    if latest_request is not None:
        if latest_request.status == "completed":
            return {
                "signature_status": "signed",
                "signature_label": "SIGNED",
                "signature_signed_count": None,
                "signature_total_count": None,
            }
        if latest_request.status in ("pending", "in_progress"):
            total = len(parts)
            signed = sum(1 for p in parts if p.status == "signed")
            return {
                "signature_status": "in_progress",
                "signature_label": f"{signed} OF {total} SIGNED",
                "signature_signed_count": signed,
                "signature_total_count": total,
            }

    from ..document_creator.signature_fields import build_signature_template_payload

    pages = d.pages if isinstance(d.pages, list) else []
    peek = build_signature_template_payload(pages)
    fields = peek.get("fields") or []
    if fields:
        return {
            "signature_status": "ready",
            "signature_label": "READY",
            "signature_signed_count": None,
            "signature_total_count": None,
        }
    return {
        "signature_status": "draft",
        "signature_label": "DRAFT",
        "signature_signed_count": None,
        "signature_total_count": None,
    }


def _batch_signature_context(
    db: Session, doc_ids: List[uuid.UUID]
) -> dict[uuid.UUID, tuple[Optional[DocumentSignatureRequest], List[DocumentSignatureParticipant]]]:
    if not doc_ids:
        return {}
    rows = (
        db.query(DocumentSignatureRequest)
        .filter(DocumentSignatureRequest.user_document_id.in_(doc_ids))
        .order_by(
            DocumentSignatureRequest.user_document_id.asc(),
            DocumentSignatureRequest.created_at.desc(),
        )
        .all()
    )
    latest_by_doc: dict[uuid.UUID, DocumentSignatureRequest] = {}
    for row in rows:
        did = row.user_document_id
        if did in latest_by_doc:
            continue
        if row.status == "cancelled":
            continue
        latest_by_doc[did] = row

    request_ids = [r.id for r in latest_by_doc.values()]
    parts_by_request: dict[uuid.UUID, List[DocumentSignatureParticipant]] = {}
    if request_ids:
        all_parts = (
            db.query(DocumentSignatureParticipant)
            .filter(DocumentSignatureParticipant.request_id.in_(request_ids))
            .order_by(DocumentSignatureParticipant.sort_order.asc())
            .all()
        )
        for p in all_parts:
            parts_by_request.setdefault(p.request_id, []).append(p)

    out: dict[uuid.UUID, tuple[Optional[DocumentSignatureRequest], List[DocumentSignatureParticipant]]] = {}
    for did in doc_ids:
        req = latest_by_doc.get(did)
        parts = parts_by_request.get(req.id, []) if req else []
        out[did] = (req, parts)
    return out


def _doc_to_summary(
    d: UserDocument,
    db: Optional[Session] = None,
    user: Optional[User] = None,
    *,
    signature_ctx: Optional[
        dict[uuid.UUID, tuple[Optional[DocumentSignatureRequest], List[DocumentSignatureParticipant]]]
    ] = None,
    projects_by_id: Optional[dict[uuid.UUID, Project]] = None,
) -> dict:
    """Slim list payload: metadata + at most the first N pages for list thumbnails."""
    pages = d.pages if isinstance(d.pages, list) else []
    out = {
        "id": str(d.id),
        "title": d.title,
        "document_type_id": str(d.document_type_id) if d.document_type_id else None,
        "project_id": str(d.project_id) if d.project_id else None,
        "subject_user_id": str(d.subject_user_id) if getattr(d, "subject_user_id", None) else None,
        "page_count": len(pages),
        "pages": pages[:_LIST_PREVIEW_PAGE_LIMIT],
        "created_by": str(d.created_by) if d.created_by else None,
        "created_at": d.created_at.isoformat() if d.created_at else None,
        "updated_at": d.updated_at.isoformat() if d.updated_at else None,
    }
    if db is None or user is None:
        return out

    scope = _document_scope(d)
    out["scope"] = scope
    out["can_edit"] = _can_access_document(user, d, db, require_write=True)

    if d.created_by:
        out["created_by_name"] = _holder_display_name(db, d.created_by)

    scope_label: Optional[str] = None
    project_meta: Optional[dict] = None
    if scope == "project" and d.project_id:
        proj = (projects_by_id or {}).get(d.project_id)
        if proj is None:
            proj = db.query(Project).filter(Project.id == d.project_id).first()
        if proj:
            scope_label = (proj.name or "").strip() or None
            project_meta = {
                "id": str(proj.id),
                "business_line": getattr(proj, "business_line", None),
                "is_bidding": bool(getattr(proj, "is_bidding", False)),
            }
    elif scope == "user" and getattr(d, "subject_user_id", None):
        scope_label = _holder_display_name(db, d.subject_user_id)
    out["scope_label"] = scope_label
    if project_meta:
        out["project_meta"] = project_meta

    sig_ctx = signature_ctx or {}
    req, parts = sig_ctx.get(d.id, (None, []))
    out.update(_signature_status_for_document(d, req, parts))
    return out


def _summaries_for_documents(docs: List[UserDocument], db: Session, user: User) -> List[dict]:
    doc_ids = [d.id for d in docs]
    signature_ctx = _batch_signature_context(db, doc_ids)
    project_ids = {d.project_id for d in docs if d.project_id}
    projects_by_id: dict[uuid.UUID, Project] = {}
    if project_ids:
        for proj in db.query(Project).filter(Project.id.in_(project_ids)).all():
            projects_by_id[proj.id] = proj
    return [
        _doc_to_summary(
            d,
            db,
            user,
            signature_ctx=signature_ctx,
            projects_by_id=projects_by_id,
        )
        for d in docs
    ]


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
    ("<Primary Contact Name>", "primary_contact_name"),
    ("<Primary Contact Phone>", "primary_contact_phone"),
    ("<Primary Contact Email>", "primary_contact_email"),
    ("<Reference Code>", "reference_code"),
    ("REFERENCE CODE", "reference_code"),
    ("<Auto Date>", "auto_date"),
    ("<Employee Name>", "employee_name"),
    ("<Employee Address>", "employee_address"),
    ("<Employee Wage>", "employee_wage"),
    ("<Employee Salary>", "employee_wage"),  # legacy alias
    ("<Employee Hiring Date>", "employee_hiring_date"),
]

# Picker catalog (no legacy aliases). Labels must stay in sync with the frontend catalog.
_TOKEN_CATALOG: list[dict[str, str]] = [
    {"token": "<Project Name>", "key": "project_name", "label": "Project name", "group": "project"},
    {"token": "<Project Address>", "key": "project_address", "label": "Project address", "group": "project"},
    {"token": "<Customer Name>", "key": "customer_name", "label": "Customer name", "group": "project"},
    {"token": "<Customer Address>", "key": "customer_address", "label": "Customer address", "group": "project"},
    {"token": "<Primary Contact Name>", "key": "primary_contact_name", "label": "Primary contact name", "group": "project"},
    {"token": "<Primary Contact Phone>", "key": "primary_contact_phone", "label": "Primary contact phone", "group": "project"},
    {"token": "<Primary Contact Email>", "key": "primary_contact_email", "label": "Primary contact email", "group": "project"},
    {"token": "<Reference Code>", "key": "reference_code", "label": "Project code", "group": "project"},
    {"token": "<Auto Date>", "key": "auto_date", "label": "Date when page is added", "group": "project"},
    {"token": "<Employee Name>", "key": "employee_name", "label": "Employee name", "group": "employee"},
    {"token": "<Employee Address>", "key": "employee_address", "label": "Employee address", "group": "employee"},
    {"token": "<Employee Wage>", "key": "employee_wage", "label": "Employee wage", "group": "employee"},
    {"token": "<Employee Hiring Date>", "key": "employee_hiring_date", "label": "Employee hiring date", "group": "employee"},
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


# Canadian postal (A1A 1A1) — signals address_line1 already has locality.
_CA_POSTAL_RE = re.compile(r"\b[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d\b")
_PROVINCE_ALIASES: dict[str, tuple[str, ...]] = {
    "british columbia": ("bc",),
    "bc": ("british columbia",),
    "alberta": ("ab",),
    "ab": ("alberta",),
    "ontario": ("on",),
    "on": ("ontario",),
    "quebec": ("qc", "québec"),
    "qc": ("quebec", "québec"),
    "manitoba": ("mb",),
    "mb": ("manitoba",),
    "saskatchewan": ("sk",),
    "sk": ("saskatchewan",),
    "nova scotia": ("ns",),
    "ns": ("nova scotia",),
    "new brunswick": ("nb",),
    "nb": ("new brunswick",),
    "newfoundland and labrador": ("nl",),
    "nl": ("newfoundland and labrador",),
    "prince edward island": ("pe",),
    "pe": ("prince edward island",),
    "northwest territories": ("nt",),
    "nt": ("northwest territories",),
    "yukon": ("yt",),
    "yt": ("yukon",),
    "nunavut": ("nu",),
    "nu": ("nunavut",),
}


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
    """Replace tokens only when a non-empty value exists (keeps placeholders in templates)."""
    for token, key in _PLACEHOLDER_TOKENS:
        val = values.get(key)
        if not val:
            continue
        content = content.replace(token, str(val))
    return content


def _is_signature_atom_run(run: dict) -> bool:
    kind = (run.get("kind") or "text")
    if kind in ("signature", "date"):
        return True
    text = run.get("text") or ""
    return text == "\ufffc" and bool(run.get("atomId") or run.get("atom_id"))


def _substitute_project_tokens(elements: list, values: dict) -> list:
    """Replace placeholder tokens in text elements (content + richLines runs). Mutates in place."""
    for el in elements:
        if el.get("type") != "text":
            continue
        if el.get("content"):
            # Keep object-replacement chars for signature atoms; only replace known tokens.
            el["content"] = _replace_tokens_in_text(el["content"], values)
        # Main canvas prefers richLines over content when present — must substitute both.
        rich = el.get("richLines") or el.get("rich_lines")
        if isinstance(rich, list):
            for line in rich:
                if not isinstance(line, list):
                    continue
                for run in line:
                    if not isinstance(run, dict) or not isinstance(run.get("text"), str):
                        continue
                    if _is_signature_atom_run(run):
                        continue
                    run["text"] = _replace_tokens_in_text(run["text"], values)
    return elements


def _format_employee_address(ep: EmployeeProfile) -> str:
    """Single-line employee address for inline document tokens.

    Prefer street lines when they already look complete (e.g. full Canadian one-liner
    in address_line1). Avoid appending city/province/postal again — that duplicated
    text and inserted hard newlines that left half-blank lines in the PDF.
    """
    street_parts: list[str] = []
    for part in (
        getattr(ep, "address_line1", None),
        getattr(ep, "address_line2", None),
    ):
        text = _strip_trailing_country(part or "")
        if text:
            street_parts.append(text)
    street = ", ".join(street_parts)

    city = (getattr(ep, "city", None) or "").strip()
    province = (getattr(ep, "province", None) or "").strip()
    postal = (getattr(ep, "postal_code", None) or "").strip()
    locality = ", ".join(p for p in (city, province, postal) if p)

    if not street:
        return locality
    if not locality:
        return street

    street_cf = street.casefold()
    # address_line1 often already stores "9552 198 St, Langley Twp, BC V1M 3CB"
    if _CA_POSTAL_RE.search(street):
        return street
    if postal and postal.casefold() in street_cf:
        return street
    if city and city.casefold() in street_cf and province and (
        province.casefold() in street_cf
        or any(code in street_cf for code in _PROVINCE_ALIASES.get(province.casefold(), ()))
    ):
        return street
    return f"{street}, {locality}"


def _format_employee_wage(pay_rate: Optional[str]) -> str:
    """Dollar + numeric amount only, e.g. '25.50 /hr' -> '$25.50'."""
    raw = (pay_rate or "").strip()
    if not raw:
        return ""
    m = re.search(r"\d[\d,]*(?:\.\d+)?", raw)
    if not m:
        return ""
    return f"${m.group(0)}"


def _employee_token_values(user_id: Optional[uuid.UUID], db: Session) -> dict:
    """Resolve <Employee *> tokens from a user's EmployeeProfile."""
    out = {
        "employee_name": "",
        "employee_address": "",
        "employee_wage": "",
        "employee_hiring_date": "",
    }
    if not user_id:
        return out
    ep = db.query(EmployeeProfile).filter(EmployeeProfile.user_id == user_id).first()
    user = db.get(User, user_id)
    if ep:
        name = f"{(ep.first_name or '').strip()} {(ep.last_name or '').strip()}".strip()
        if not name:
            name = (ep.preferred_name or "").strip()
        out["employee_name"] = name or (getattr(user, "username", None) or "")
        out["employee_address"] = _format_employee_address(ep)
        out["employee_wage"] = _format_employee_wage(getattr(ep, "pay_rate", None))
        hire = getattr(ep, "hire_date", None)
        if hire is not None:
            if isinstance(hire, datetime):
                out["employee_hiring_date"] = _format_auto_date(hire)
            else:
                # date / string fallback
                try:
                    out["employee_hiring_date"] = _format_auto_date(
                        datetime(hire.year, hire.month, hire.day, tzinfo=timezone.utc)
                    )
                except Exception:
                    out["employee_hiring_date"] = str(hire).strip()
    elif user:
        out["employee_name"] = (user.username or "").strip()
    return out


def _contact_phone(contact: ClientContact) -> str:
    """Prefer phone, fall back to mobile_phone."""
    return ((contact.phone or "").strip() or (contact.mobile_phone or "").strip())


def _resolve_project_primary_contact(proj: Project, db: Session) -> Optional[ClientContact]:
    """Project.contact_id, else client's is_primary, else first by sort_index."""
    contact_id = getattr(proj, "contact_id", None)
    if contact_id:
        contact = db.get(ClientContact, contact_id)
        if contact:
            return contact
    if not proj.client_id:
        return None
    primary = (
        db.query(ClientContact)
        .filter(ClientContact.client_id == proj.client_id, ClientContact.is_primary.is_(True))
        .first()
    )
    if primary:
        return primary
    return (
        db.query(ClientContact)
        .filter(ClientContact.client_id == proj.client_id)
        .order_by(ClientContact.sort_index, ClientContact.name)
        .first()
    )


def _project_token_values(
    project_id: Optional[uuid.UUID],
    db: Session,
    *,
    when: Optional[datetime] = None,
    employee_user_id: Optional[uuid.UUID] = None,
) -> dict:
    """Build token substitution dict. Always includes auto_date; project fields when available.

    When employee_user_id is set (e.g. send-for-signature), fill Employee * tokens from that user.
    """
    tz_name = "America/Vancouver"
    values: dict = {
        "project_name": "",
        "project_address": "",
        "customer_name": "",
        "customer_address": "",
        "primary_contact_name": "",
        "primary_contact_phone": "",
        "primary_contact_email": "",
        "reference_code": "",
        "auto_date": "",
        "employee_name": "",
        "employee_address": "",
        "employee_wage": "",
        "employee_hiring_date": "",
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
            contact = _resolve_project_primary_contact(proj, db)
            values.update(
                {
                    "project_name": proj.name or "",
                    "project_address": _format_project_address(proj, db),
                    "customer_name": client_name,
                    "customer_address": customer_address,
                    "primary_contact_name": (contact.name or "").strip() if contact else "",
                    "primary_contact_phone": _contact_phone(contact) if contact else "",
                    "primary_contact_email": (contact.email or "").strip() if contact else "",
                    "reference_code": proj.code or "",
                }
            )
    values["auto_date"] = _format_auto_date(when, tz_name=tz_name)
    if employee_user_id:
        values.update(_employee_token_values(employee_user_id, db))
    return values


def _pages_with_project_tokens(
    pages: Any,
    project_id: Optional[uuid.UUID],
    db: Session,
    *,
    when: Optional[datetime] = None,
    employee_user_id: Optional[uuid.UUID] = None,
) -> Any:
    """Deep-copy pages and fill tokens. Auto Date uses `when` (e.g. doc created_at) or now.

    When employee_user_id is set, also fill <Employee *> tokens from that user's profile.
    """
    if not isinstance(pages, list):
        return pages
    token_values = _project_token_values(
        project_id, db, when=when, employee_user_id=employee_user_id
    )
    pages = copy.deepcopy(pages)
    for page in pages:
        if isinstance(page, dict) and isinstance(page.get("elements"), list):
            _substitute_project_tokens(page["elements"], token_values)
    return pages


# --- Document types (preset page sequences) ---

@router.get("/document-types", response_model=List[dict])
def list_document_types(
    for_picker: bool = Query(
        False,
        description="Kept for clients; category allow-list always applies for non-admins.",
    ),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _=Depends(require_permissions(
        "document_hub:templates:read",
        "documents:read",
        "business:projects:documents:read",
        "settings:document_templates:read",
        "settings:document_templates:write",
        "hr:users:view:general",
        "users:read",
        "document_hub:builder:read",
        "document_hub:builder:write",
    )),
):
    """List document type presets (e.g. cover + back cover + content page)."""
    from ..services.document_template_categories import filter_document_types_for_user

    types = db.query(DocumentType).order_by(DocumentType.category or "", DocumentType.name).all()
    # Always filter by category allow-list (admin bypass inside helper).
    types = filter_document_types_for_user(user, db, types, for_picker=for_picker)
    return [
        {
            "id": str(t.id),
            "name": t.name,
            "description": t.description,
            "category": getattr(t, "category", None),
            "page_templates": t.page_templates or [],
            "signer_roles": getattr(t, "signer_roles", None) or [],
            "created_at": t.created_at.isoformat() if t.created_at else None,
        }
        for t in types
    ]


class DocumentTypeCreate(BaseModel):
    name: str
    description: Optional[str] = None
    category: Optional[str] = None
    page_templates: Optional[List[dict]] = None  # [{ "template_id": "uuid", "label": "Cover", "margins?", "elements?" }]
    signer_roles: Optional[List[dict]] = None


class DocumentTypeUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    page_templates: Optional[List[dict]] = None
    signer_roles: Optional[List[dict]] = None


@router.post("/document-types", response_model=dict)
def create_document_type(
    body: DocumentTypeCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _=Depends(require_permissions(
        "document_hub:templates:write",
        "documents:write",
        "business:projects:documents:write",
        "settings:document_templates:write",
    )),
):
    """Create a document type preset (ordered list of page templates)."""
    from ..services.document_signer_roles import normalize_signer_roles_list
    from ..services.document_template_categories import (
        assert_can_use_document_template_category,
        validate_document_template_category,
    )

    try:
        validated_category = validate_document_template_category(db, body.category)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    assert_can_use_document_template_category(user, db, validated_category)

    doc_type = DocumentType(
        name=body.name or "Unnamed",
        description=body.description,
        category=validated_category,
        page_templates=body.page_templates if body.page_templates is not None else [],
        signer_roles=normalize_signer_roles_list(body.signer_roles) if body.signer_roles is not None else None,
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
        "signer_roles": getattr(doc_type, "signer_roles", None) or [],
        "created_at": doc_type.created_at.isoformat() if doc_type.created_at else None,
    }


@router.patch("/document-types/{document_type_id}", response_model=dict)
def update_document_type(
    document_type_id: str,
    body: DocumentTypeUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _=Depends(require_permissions(
        "document_hub:templates:write",
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
    from ..services.document_template_categories import assert_can_use_document_template_category

    assert_can_use_document_template_category(user, db, getattr(doc_type, "category", None))
    if body.name is not None:
        doc_type.name = body.name
    if body.description is not None:
        doc_type.description = body.description
    if body.category is not None:
        from ..services.document_template_categories import (
            assert_can_use_document_template_category,
            validate_document_template_category,
        )

        try:
            validated_category = validate_document_template_category(
                db,
                body.category,
                allow_legacy=doc_type.category,
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        assert_can_use_document_template_category(user, db, validated_category)
        doc_type.category = validated_category
    if body.page_templates is not None:
        doc_type.page_templates = body.page_templates
    if body.signer_roles is not None:
        from ..services.document_signer_roles import normalize_signer_roles_list

        doc_type.signer_roles = normalize_signer_roles_list(body.signer_roles)
    db.commit()
    db.refresh(doc_type)
    return {
        "id": str(doc_type.id),
        "name": doc_type.name,
        "description": doc_type.description,
        "category": doc_type.category,
        "page_templates": doc_type.page_templates or [],
        "signer_roles": getattr(doc_type, "signer_roles", None) or [],
        "created_at": doc_type.created_at.isoformat() if doc_type.created_at else None,
    }


@router.delete("/document-types/{document_type_id}")
def delete_document_type(
    document_type_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _=Depends(require_permissions(
        "document_hub:templates:write",
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
    from ..services.document_template_categories import assert_can_use_document_template_category

    assert_can_use_document_template_category(user, db, getattr(doc_type, "category", None))
    db.delete(doc_type)
    db.commit()
    return {"ok": True}


@router.post("/document-types/{document_type_id}/duplicate", response_model=dict)
def duplicate_document_type(
    document_type_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _=Depends(require_permissions(
        "document_hub:templates:write",
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
    from ..services.document_template_categories import assert_can_use_document_template_category

    assert_can_use_document_template_category(user, db, getattr(doc_type, "category", None))
    copy_name = (doc_type.name or "Template").strip() + " (copy)"
    page_templates = doc_type.page_templates
    if isinstance(page_templates, list):
        page_templates = copy.deepcopy(page_templates)
    new_type = DocumentType(
        name=copy_name,
        description=doc_type.description,
        category=doc_type.category,
        page_templates=page_templates or [],
        signer_roles=copy.deepcopy(getattr(doc_type, "signer_roles", None)) if getattr(doc_type, "signer_roles", None) else None,
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
        "signer_roles": getattr(new_type, "signer_roles", None) or [],
        "created_at": new_type.created_at.isoformat() if new_type.created_at else None,
    }


@router.get("/document-types/{document_type_id}/expand-pages", response_model=List[dict])
def expand_document_type_pages(
    document_type_id: str,
    project_id: Optional[str] = Query(None, description="When set, substitute project tokens in text elements."),
    subject_user_id: Optional[str] = Query(None, description="When set, substitute employee tokens from that user."),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _=Depends(require_permissions(*_HR_USER_DOC_READ_PERMS)),
):
    """Expand a document type into a list of pages (template_id, margins, elements) with cloned element ids.
    Use when adding pages from a template to an existing document. Uses template default_elements when entry has no elements.
    When project_id is provided, placeholder tokens in text elements are replaced with the project's data.
    When subject_user_id is provided, employee tokens are filled from that user's profile."""
    if project_id and subject_user_id:
        raise HTTPException(status_code=400, detail="project_id and subject_user_id are mutually exclusive")
    try:
        dtid = uuid.UUID(document_type_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid document type id")
    doc_type = db.query(DocumentType).filter(DocumentType.id == dtid).first()
    if not doc_type:
        raise HTTPException(status_code=404, detail="Document type not found")
    from ..services.document_template_categories import assert_can_use_document_template_category

    assert_can_use_document_template_category(
        user,
        db,
        getattr(doc_type, "category", None),
    )
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
    # Auto-fill tokens (project / employee fields + Auto Date at expand time)
    now = datetime.now(timezone.utc)
    pid = _parse_optional_uuid(project_id, field="project_id")
    sid = _parse_optional_uuid(subject_user_id, field="subject_user_id")
    token_values = _project_token_values(pid, db, when=now, employee_user_id=sid)
    for page in pages:
        _substitute_project_tokens(page.get("elements", []), token_values)
    return pages


@router.get("/token-values", response_model=dict)
def get_token_values(
    project_id: Optional[str] = Query(None),
    subject_user_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _=Depends(require_permissions(
        "document_hub:builder:read",
        "document_hub:backgrounds:read",
        "document_hub:templates:read",
        "documents:read",
        "documents:write",
        "business:projects:documents:read",
        "business:projects:documents:write",
        "settings:document_backgrounds:read",
        "settings:document_backgrounds:write",
        "settings:document_templates:read",
        "settings:document_templates:write",
        "hr:users:view:general",
        "users:read",
    )),
):
    """Resolved auto-fill token previews for the editor picker. Empty value means insert the token."""
    if project_id and subject_user_id:
        raise HTTPException(status_code=400, detail="project_id and subject_user_id are mutually exclusive")
    pid = _parse_optional_uuid(project_id, field="project_id")
    sid = _parse_optional_uuid(subject_user_id, field="subject_user_id")
    values = _project_token_values(pid, db, employee_user_id=sid)
    return {
        "tokens": [
            {
                "token": entry["token"],
                "label": entry["label"],
                "group": entry["group"],
                "value": values.get(entry["key"]) or "",
            }
            for entry in _TOKEN_CATALOG
        ]
    }


# --- Templates ---

@router.get("/templates", response_model=List[dict])
def list_templates(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _=Depends(require_permissions(
        "document_hub:backgrounds:read",
        "document_hub:templates:read",
        "documents:read",
        "business:projects:documents:read",
        "settings:document_backgrounds:read",
        "settings:document_backgrounds:write",
        "settings:document_templates:read",
        "settings:document_templates:write",
        "hr:users:view:general",
        "users:read",
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
        "document_hub:backgrounds:read",
        "document_hub:templates:read",
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
        "document_hub:backgrounds:write",
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
        "document_hub:backgrounds:write",
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
        "document_hub:backgrounds:write",
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
    subject_user_id: Optional[str] = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _=Depends(require_permissions(*_HR_USER_DOC_READ_PERMS)),
):
    """List documents. With project_id or subject_user_id, list scoped docs. Otherwise caller's standalone docs."""
    from ..auth.security import _has_project_feature_permission

    if project_id and subject_user_id:
        raise HTTPException(status_code=400, detail="project_id and subject_user_id are mutually exclusive")

    if subject_user_id:
        if not _can_view_subject_user_docs(user):
            raise HTTPException(status_code=403, detail="Forbidden")
        sid = _parse_optional_uuid(subject_user_id, field="subject_user_id")
        if not sid:
            raise HTTPException(status_code=400, detail="Invalid subject_user_id")
        subject = db.get(User, sid)
        if not subject:
            raise HTTPException(status_code=404, detail="Subject user not found")
        q = db.query(UserDocument).filter(UserDocument.subject_user_id == sid)
    elif project_id:
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
            q = db.query(UserDocument).filter(
                UserDocument.created_by == user.id,
                UserDocument.project_id.is_(None),
            )
    else:
        # Creator's hub Document Builder: only true standalone docs (no project, no subject user).
        # Exclude signature-editor envelope docs (send-for-signature from PDF templates).
        q = db.query(UserDocument).filter(
            UserDocument.created_by == user.id,
            UserDocument.project_id.is_(None),
            UserDocument.subject_user_id.is_(None),
            UserDocument.signature_template_id.is_(None),
        )
    docs = q.order_by(
        UserDocument.updated_at.desc().nullslast(), UserDocument.created_at.desc()
    ).all()
    return _summaries_for_documents(docs, db, user)


@router.post("/documents", response_model=dict)
def create_document(
    body: DocumentCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _=Depends(require_permissions(*_HR_USER_DOC_WRITE_PERMS)),
):
    """Create a new user document. If document_type_id is set, pages are built from that preset."""
    from ..services.document_signer_roles import (
        default_signer_roles,
        ensure_document_signer_roles,
        normalize_signer_roles_list,
    )

    if body.project_id and body.subject_user_id:
        raise HTTPException(status_code=400, detail="project_id and subject_user_id are mutually exclusive")

    pid = _parse_optional_uuid(body.project_id, field="project_id")
    sid = _parse_optional_uuid(body.subject_user_id, field="subject_user_id")
    if sid is not None:
        if not _can_edit_subject_user_docs(user):
            raise HTTPException(status_code=403, detail="Forbidden")
        if not db.get(User, sid):
            raise HTTPException(status_code=404, detail="Subject user not found")

    pages = body.pages if body.pages is not None else []
    dtype_id = None
    type_signer_roles = None
    if body.document_type_id:
        try:
            dtype_id = uuid.UUID(body.document_type_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid document_type_id")
        doc_type = db.query(DocumentType).filter(DocumentType.id == dtype_id).first()
        if not doc_type:
            raise HTTPException(status_code=404, detail="Document type not found")
        from ..services.document_template_categories import assert_can_use_document_template_category

        assert_can_use_document_template_category(
            user,
            db,
            getattr(doc_type, "category", None),
        )
        type_signer_roles = getattr(doc_type, "signer_roles", None)
        if body.pages is not None:
            pages = body.pages
        else:
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
    # Auto-fill tokens (project / employee fields + Auto Date at document create time)
    now = datetime.now(timezone.utc)
    token_values = _project_token_values(pid, db, when=now, employee_user_id=sid)
    for page in pages:
        _substitute_project_tokens(page.get("elements", []), token_values)
    if body.signer_roles is not None:
        signer_roles = normalize_signer_roles_list(body.signer_roles) or default_signer_roles()
    elif type_signer_roles:
        signer_roles = ensure_document_signer_roles(type_signer_roles, pages)
    else:
        signer_roles = ensure_document_signer_roles(None, pages)
    from ..services.document_title import (
        build_scoped_document_title,
        unique_title_in_scope,
    )

    if pid is not None or sid is not None:
        doc_title = unique_title_in_scope(
            db,
            build_scoped_document_title(
                db,
                document_type_id=dtype_id,
                pages=pages,
                project_id=pid,
                subject_user_id=sid,
            ),
            project_id=pid,
            subject_user_id=sid,
        )
    else:
        explicit_title = (body.title or "").strip()
        if explicit_title:
            doc_title = explicit_title
        else:
            doc_title = build_scoped_document_title(
                db,
                document_type_id=dtype_id,
                pages=pages,
                project_id=None,
                subject_user_id=None,
            )
    doc = UserDocument(
        title=doc_title,
        document_type_id=dtype_id,
        project_id=pid,
        subject_user_id=sid,
        pages=pages,
        signer_roles=signer_roles,
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
    from ..auth.security import _has_project_feature_permission

    if _user_is_admin(user):
        return True
    if doc.created_by == user.id:
        return True
    subject_id = getattr(doc, "subject_user_id", None)
    if subject_id:
        return _can_edit_subject_user_docs(user) if require_write else _can_view_subject_user_docs(user)
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
    _=Depends(require_permissions(*_HR_USER_DOC_READ_PERMS)),
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
    _=Depends(require_permissions(*_HR_USER_DOC_WRITE_PERMS)),
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
        holder_id = doc.edit_lock_user_id
        if holder_id is None or str(holder_id) != str(user.id):
            raise HTTPException(
                status_code=409,
                detail={
                    "code": "document_in_use",
                    "message": "This document is already open for editing elsewhere.",
                    "holder_name": _holder_display_name(db, holder_id),
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
    _=Depends(require_permissions(*_HR_USER_DOC_WRITE_PERMS)),
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
    _=Depends(require_permissions(*_HR_USER_DOC_WRITE_PERMS)),
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
    _=Depends(require_permissions(*_HR_USER_DOC_WRITE_PERMS)),
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

    content_changing = body.title is not None or body.pages is not None or body.signer_roles is not None
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
        from ..services.document_title import title_taken_in_scope

        new_title = body.title.strip()
        if (doc.project_id or doc.subject_user_id) and title_taken_in_scope(
            db,
            new_title,
            project_id=doc.project_id,
            subject_user_id=doc.subject_user_id,
            exclude_id=doc.id,
        ):
            raise HTTPException(
                status_code=409,
                detail={
                    "code": "document_title_taken",
                    "message": "A document with this name already exists in this scope.",
                },
            )
        doc.title = new_title
    if body.project_id is not None:
        doc.project_id = uuid.UUID(body.project_id) if body.project_id else None
    if body.subject_user_id is not None:
        if body.subject_user_id == "":
            doc.subject_user_id = None
        else:
            sid = _parse_optional_uuid(body.subject_user_id, field="subject_user_id")
            doc.subject_user_id = sid
    if getattr(doc, "project_id", None) and getattr(doc, "subject_user_id", None):
        raise HTTPException(status_code=400, detail="project_id and subject_user_id are mutually exclusive")
    if body.pages is not None:
        doc.pages = body.pages
    if body.signer_roles is not None:
        from ..services.document_signer_roles import ensure_document_signer_roles, normalize_signer_roles_list

        roles = normalize_signer_roles_list(body.signer_roles)
        doc.signer_roles = ensure_document_signer_roles(roles, body.pages if body.pages is not None else doc.pages)
    if content_changing or body.project_id is not None or body.subject_user_id is not None:
        doc.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(doc)
    return _doc_to_out(doc, db)


@router.delete("/documents/{document_id}")
def delete_document(
    document_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _=Depends(require_permissions(*_HR_USER_DOC_WRITE_PERMS)),
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
    existing = (
        db.query(DocumentSignatureRequest)
        .filter(DocumentSignatureRequest.user_document_id == did)
        .limit(1)
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=409,
            detail="Cannot delete this document because it has signature request history. "
            "Signature records must be preserved.",
        )
    db.delete(doc)
    db.commit()
    return {"ok": True}


@router.post("/documents/{document_id}/export-pdf")
def export_document_pdf(
    document_id: str,
    body: Optional[ExportPdfOptions] = Body(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _=Depends(require_permissions(*_HR_USER_DOC_READ_PERMS)),
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
        doc.pages = _pages_with_project_tokens(
            original_pages,
            doc.project_id,
            db,
            when=doc.created_at,
            employee_user_id=getattr(doc, "subject_user_id", None),
        )
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


@router.post("/documents/{document_id}/signature-template")
def document_signature_template(
    document_id: str,
    body: Optional[ExportPdfOptions] = Body(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _=Depends(require_permissions(*_HR_USER_DOC_READ_PERMS)),
):
    """
    Build the filled PDF (same as export-pdf) and return validated signature_template
    metadata for inline Signature atoms + free Initials elements.
    Does not modify export-pdf behavior.
    """
    try:
        did = uuid.UUID(document_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid document id")
    doc = db.query(UserDocument).filter(UserDocument.id == did).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if not _can_access_document(user, doc, db, require_write=False):
        raise HTTPException(status_code=403, detail="Forbidden")

    from ..document_creator.pdf_builder import build_pdf_bytes
    from ..document_creator.signature_fields import build_signature_template_payload
    from ..services.onboarding_signature_template import validate_and_normalize_template

    original_pages = doc.pages
    tokenized = _pages_with_project_tokens(
        original_pages,
        doc.project_id,
        db,
        when=doc.created_at,
        employee_user_id=getattr(doc, "subject_user_id", None),
    )
    doc.pages = tokenized
    try:
        try:
            pdf_bytes = build_pdf_bytes(db, doc, canvas_width_px=(body.canvas_width_px if body else None))
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"PDF generation failed: {str(e)}")
        raw = build_signature_template_payload(tokenized)
        if not raw.get("fields"):
            return {
                "signature_template": {"version": 1, "fields": []},
                "page_sizes": [],
                "field_count": 0,
            }
        try:
            normalized = validate_and_normalize_template(raw, pdf_bytes)
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid signature template: {e}")
        from ..services.onboarding_signature_template import get_pdf_page_sizes

        sizes = get_pdf_page_sizes(pdf_bytes)
        return {
            "signature_template": normalized,
            "page_sizes": [{"width": w, "height": h} for w, h in sizes],
            "field_count": len(normalized.get("fields") or []),
        }
    finally:
        doc.pages = original_pages
