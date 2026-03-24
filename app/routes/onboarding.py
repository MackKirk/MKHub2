"""HR onboarding admin API + /auth/me/onboarding/* for Step 2."""
import base64
import json
import re
from datetime import datetime, timezone
from typing import Any, List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Form, HTTPException, Request
from fastapi.responses import Response, StreamingResponse
from sqlalchemy.orm import Session

from ..auth.security import _has_permission, get_current_user
from ..db import get_db
from ..models.models import (
    EmployeeDocument,
    EmployeeProfile,
    OnboardingAssignment,
    OnboardingAssignmentItem,
    OnboardingBaseDocument,
    OnboardingPackage,
    OnboardingPackageItem,
    OnboardingSignedDocument,
    OnboardingTrigger,
    User,
)
from ..services.onboarding_assign import (
    create_resend_assignment_items,
    get_or_create_hr_documents_folder,
    promote_scheduled_assignment_items,
)
from ..services.onboarding_sign import (
    apply_template_field_overlays,
    build_signed_pdf_with_certificate,
    build_signed_pdf_with_certificate_from_merged,
    default_placement,
)
from ..services.onboarding_signature_template import (
    filter_fields_for_signer,
    get_pdf_page_sizes,
    signer_role_for_base_document,
    template_is_active,
    validate_and_normalize_template,
    validate_field_values_for_signing,
)
from ..services.onboarding_storage import read_file_object_bytes, save_pdf_bytes_as_file_object
from ..services.task_service import get_user_display
from ..utils.pdf_hash import sha256_bytes


def _admin(user: User) -> bool:
    if any(r.name == "admin" for r in user.roles):
        return True
    return _has_permission(user, "hr:users:read") or _has_permission(user, "users:read") or _has_permission(user, "users:write")


def _client_ip(request: Request) -> str:
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip()
    return request.client.host if request.client else ""


router = APIRouter(prefix="/onboarding", tags=["onboarding"])
me_router = APIRouter(prefix="/auth/me/onboarding", tags=["onboarding"])


def _assignee_user_ids_from_bd(bd: OnboardingBaseDocument) -> List[str]:
    """Normalized list of assignee UUID strings (deduped). Falls back to legacy assignee_user_id."""
    raw = getattr(bd, "assignee_user_ids", None)
    out: List[str] = []
    if isinstance(raw, list):
        for x in raw:
            s = str(x).strip()
            if s:
                out.append(s)
    seen = set()
    uniq: List[str] = []
    for s in out:
        if s not in seen:
            seen.add(s)
            uniq.append(s)
    if not uniq and getattr(bd, "assignee_user_id", None):
        uniq = [str(bd.assignee_user_id)]
    return uniq


def _base_document_dict(r: OnboardingBaseDocument) -> dict:
    assignee_ids = _assignee_user_ids_from_bd(r)
    return {
        "id": str(r.id),
        "name": r.name,
        "file_id": str(r.file_id),
        "content_hash": r.content_hash,
        "sign_placement": r.sign_placement or default_placement(),
        "default_deadline_days": r.default_deadline_days,
        "assignee_type": (getattr(r, "assignee_type", None) or "employee").lower(),
        "assignee_user_id": assignee_ids[0] if assignee_ids else None,
        "assignee_user_ids": assignee_ids,
        "required": getattr(r, "required", True),
        "employee_visible": getattr(r, "employee_visible", True),
        "sort_order": getattr(r, "sort_order", 0) or 0,
        "display_name": getattr(r, "display_name", None),
        "notification_message": getattr(r, "notification_message", None),
        "delivery_mode": getattr(r, "delivery_mode", None) or "on_hire",
        "delivery_amount": getattr(r, "delivery_amount", None),
        "delivery_unit": getattr(r, "delivery_unit", None),
        "delivery_direction": getattr(r, "delivery_direction", None),
        "requires_signature": getattr(r, "requires_signature", True),
        "notification_policy": getattr(r, "notification_policy", None),
        "signing_deadline_days": getattr(r, "signing_deadline_days", None) or 7,
        "signature_template": getattr(r, "signature_template", None),
    }


def _apply_base_document_preferences(bd: OnboardingBaseDocument, payload: dict) -> None:
    if "assignee_type" in payload:
        at = (payload.get("assignee_type") or "employee").lower()
        if at not in ("employee", "user"):
            raise HTTPException(400, "assignee_type must be employee or user")
        bd.assignee_type = at
        if at == "employee":
            bd.assignee_user_id = None
            bd.assignee_user_ids = None
    if "assignee_user_ids" in payload:
        raw = payload.get("assignee_user_ids")
        if raw is None:
            bd.assignee_user_ids = None
            bd.assignee_user_id = None
        elif isinstance(raw, list):
            seen_u = set()
            uniq_u: List[UUID] = []
            for x in raw:
                try:
                    u = UUID(str(x))
                    if u not in seen_u:
                        seen_u.add(u)
                        uniq_u.append(u)
                except Exception:
                    continue
            bd.assignee_user_ids = [str(u) for u in uniq_u] if uniq_u else None
            bd.assignee_user_id = uniq_u[0] if len(uniq_u) == 1 else None
        else:
            raise HTTPException(400, "assignee_user_ids must be a list or null")
    if "assignee_user_id" in payload and "assignee_user_ids" not in payload:
        v = payload.get("assignee_user_id")
        bd.assignee_user_id = UUID(str(v)) if v else None
        if bd.assignee_user_id:
            bd.assignee_user_ids = [str(bd.assignee_user_id)]
        elif (bd.assignee_type or "employee").lower() == "user":
            bd.assignee_user_ids = None
    if "required" in payload:
        bd.required = bool(payload.get("required", True))
    if "employee_visible" in payload:
        bd.employee_visible = bool(payload.get("employee_visible", True))
    if "sort_order" in payload:
        bd.sort_order = int(payload.get("sort_order") or 0)
    if "display_name" in payload:
        v = payload.get("display_name")
        bd.display_name = (v or "").strip() or None if v is not None else bd.display_name
    if "notification_message" in payload:
        v = payload.get("notification_message")
        bd.notification_message = (v or "").strip() or None if v is not None else bd.notification_message
    if "delivery_mode" in payload:
        mode = (payload.get("delivery_mode") or "on_hire").lower()
        if mode not in ("on_hire", "custom", "none"):
            raise HTTPException(400, "delivery_mode must be on_hire, custom, or none")
        bd.delivery_mode = mode
    if "delivery_amount" in payload:
        bd.delivery_amount = payload.get("delivery_amount")
    if "delivery_unit" in payload:
        bd.delivery_unit = payload.get("delivery_unit")
    if "delivery_direction" in payload:
        bd.delivery_direction = payload.get("delivery_direction")
    if "requires_signature" in payload:
        bd.requires_signature = bool(payload.get("requires_signature", True))
    if "notification_policy" in payload:
        bd.notification_policy = payload.get("notification_policy")
    if "signing_deadline_days" in payload:
        ddays = int(payload["signing_deadline_days"] or 7)
        if ddays < 1:
            raise HTTPException(400, "signing_deadline_days must be >= 1")
        bd.signing_deadline_days = ddays
    if bd.delivery_mode == "custom":
        if not bd.delivery_amount or bd.delivery_amount < 1:
            raise HTTPException(400, "custom delivery requires delivery_amount >= 1")
        u = (bd.delivery_unit or "").lower()
        if u not in ("days", "weeks", "months"):
            raise HTTPException(400, "delivery_unit must be days, weeks, or months")
        d = (bd.delivery_direction or "").lower()
        if d not in ("before", "after"):
            raise HTTPException(400, "delivery_direction must be before or after")
    at = (bd.assignee_type or "employee").lower()
    if at == "user" and not _assignee_user_ids_from_bd(bd):
        raise HTTPException(400, "assignee_user_ids must include at least one user when assignee_type is user")


# ----- Admin -----


@router.get("/base-documents")
def list_base_documents(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if not _admin(user):
        raise HTTPException(403, "Forbidden")
    rows = (
        db.query(OnboardingBaseDocument)
        .order_by(OnboardingBaseDocument.sort_order.asc(), OnboardingBaseDocument.name.asc())
        .all()
    )
    return [_base_document_dict(r) for r in rows]


@router.get("/base-documents/{doc_id}/thumbnail")
def thumbnail_base_document(
    doc_id: UUID,
    w: int = 200,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """PNG thumbnail of first PDF page (admin)."""
    if not _admin(user):
        raise HTTPException(403, "Forbidden")
    bd = db.query(OnboardingBaseDocument).filter(OnboardingBaseDocument.id == doc_id).first()
    if not bd:
        raise HTTPException(404, "Not found")
    from ..models.models import FileObject

    fo = db.query(FileObject).filter(FileObject.id == bd.file_id).first()
    if not fo:
        raise HTTPException(404, "File not found")
    data = read_file_object_bytes(db, fo)
    try:
        import fitz  # PyMuPDF
    except ImportError:
        raise HTTPException(503, "PDF thumbnails unavailable")
    tw = max(80, min(480, int(w or 200)))
    try:
        doc = fitz.open(stream=data, filetype="pdf")
    except Exception:
        raise HTTPException(400, "Invalid PDF")
    try:
        if doc.page_count < 1:
            raise HTTPException(400, "Empty PDF")
        page = doc[0]
        pw = float(page.rect.width) or 1.0
        scale = tw / pw
        mat = fitz.Matrix(scale, scale)
        pix = page.get_pixmap(matrix=mat, alpha=False)
        png = pix.tobytes("png")
        return Response(content=png, media_type="image/png", headers={"Cache-Control": "private, max-age=3600"})
    finally:
        doc.close()


@router.get("/base-documents/{doc_id}/preview")
def preview_base_document(doc_id: UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Return base PDF for admin preview (inline in browser)."""
    if not _admin(user):
        raise HTTPException(403, "Forbidden")
    bd = db.query(OnboardingBaseDocument).filter(OnboardingBaseDocument.id == doc_id).first()
    if not bd:
        raise HTTPException(404, "Not found")
    from ..models.models import FileObject

    fo = db.query(FileObject).filter(FileObject.id == bd.file_id).first()
    if not fo:
        raise HTTPException(404, "File not found")
    data = read_file_object_bytes(db, fo)
    safe = re.sub(r'[^\w\s.-]', "_", (bd.name or "document").strip())[:120] or "document"
    return Response(
        content=data,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{safe}.pdf"'},
    )


@router.post("/base-documents")
def create_base_document(
    payload: dict,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not _admin(user):
        raise HTTPException(403, "Forbidden")
    name = (payload.get("name") or "").strip()
    if not name:
        raise HTTPException(400, "name required")
    try:
        fid = UUID(str(payload["file_id"]))
    except Exception:
        raise HTTPException(400, "file_id required")
    from ..models.models import FileObject

    if not db.query(FileObject).filter(FileObject.id == fid).first():
        raise HTTPException(400, "file not found")
    placement = payload.get("sign_placement") or default_placement()
    days = 7  # signing window configured per package item; base default for Resend only
    pdf_bytes = read_file_object_bytes(db, db.query(FileObject).filter(FileObject.id == fid).first())
    h = sha256_bytes(pdf_bytes)
    bd = OnboardingBaseDocument(
        name=name,
        file_id=fid,
        content_hash=h,
        sign_placement=placement,
        default_deadline_days=days,
    )
    db.add(bd)
    db.commit()
    db.refresh(bd)
    return {"id": str(bd.id)}


@router.put("/base-documents/{doc_id}")
def update_base_document(
    doc_id: UUID,
    payload: dict,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not _admin(user):
        raise HTTPException(403, "Forbidden")
    bd = db.query(OnboardingBaseDocument).filter(OnboardingBaseDocument.id == doc_id).first()
    if not bd:
        raise HTTPException(404, "Not found")
    if payload.get("name"):
        bd.name = payload["name"].strip()
    if payload.get("file_id"):
        from ..models.models import FileObject

        fid = UUID(str(payload["file_id"]))
        fo = db.query(FileObject).filter(FileObject.id == fid).first()
        if not fo:
            raise HTTPException(400, "file not found")
        bd.file_id = fid
        bd.content_hash = sha256_bytes(read_file_object_bytes(db, fo))
    if "sign_placement" in payload:
        bd.sign_placement = payload["sign_placement"] or default_placement()
    if "default_deadline_days" in payload:
        bd.default_deadline_days = int(payload["default_deadline_days"])
    pref_keys = {
        "assignee_type",
        "assignee_user_id",
        "assignee_user_ids",
        "required",
        "employee_visible",
        "sort_order",
        "display_name",
        "notification_message",
        "delivery_mode",
        "delivery_amount",
        "delivery_unit",
        "delivery_direction",
        "requires_signature",
        "notification_policy",
        "signing_deadline_days",
    }
    if any(k in payload for k in pref_keys):
        _apply_base_document_preferences(bd, payload)
    if "signature_template" in payload:
        st = payload.get("signature_template")
        if st is None:
            bd.signature_template = None
        else:
            from ..models.models import FileObject

            fo = db.query(FileObject).filter(FileObject.id == bd.file_id).first()
            if not fo:
                raise HTTPException(400, "file not found")
            pdf_bytes = read_file_object_bytes(db, fo)
            bd.signature_template = validate_and_normalize_template(st, pdf_bytes)
    db.commit()
    return {"status": "ok"}


@router.delete("/base-documents/{doc_id}")
def delete_base_document(doc_id: UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if not _admin(user):
        raise HTTPException(403, "Forbidden")
    bd = db.query(OnboardingBaseDocument).filter(OnboardingBaseDocument.id == doc_id).first()
    if not bd:
        raise HTTPException(404, "Not found")
    pending = (
        db.query(OnboardingAssignmentItem)
        .filter(
            OnboardingAssignmentItem.base_document_id == doc_id,
            OnboardingAssignmentItem.status.in_(["pending", "scheduled"]),
        )
        .first()
    )
    if pending:
        raise HTTPException(400, "Document has pending or scheduled assignment items; remove or complete them first")
    db.delete(bd)
    db.commit()
    return {"status": "ok"}


@router.get("/packages")
def list_packages(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if not _admin(user):
        raise HTTPException(403, "Forbidden")
    rows = db.query(OnboardingPackage).order_by(OnboardingPackage.name.asc()).all()
    return [
        {
            "id": str(r.id),
            "name": r.name,
            "description": r.description,
            "active": r.active,
        }
        for r in rows
    ]


@router.post("/packages")
def create_package(payload: dict, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if not _admin(user):
        raise HTTPException(403, "Forbidden")
    p = OnboardingPackage(
        name=(payload.get("name") or "Package").strip(),
        description=payload.get("description"),
        active=payload.get("active", True),
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    return {"id": str(p.id)}


@router.put("/packages/{pkg_id}")
def update_package(pkg_id: UUID, payload: dict, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if not _admin(user):
        raise HTTPException(403, "Forbidden")
    p = db.query(OnboardingPackage).filter(OnboardingPackage.id == pkg_id).first()
    if not p:
        raise HTTPException(404, "Not found")
    if "name" in payload:
        p.name = (payload["name"] or "").strip()
    if "description" in payload:
        p.description = payload.get("description")
    if "active" in payload:
        p.active = bool(payload["active"])
    db.commit()
    return {"status": "ok"}


@router.delete("/packages/{pkg_id}")
def delete_package(pkg_id: UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if not _admin(user):
        raise HTTPException(403, "Forbidden")
    p = db.query(OnboardingPackage).filter(OnboardingPackage.id == pkg_id).first()
    if not p:
        raise HTTPException(404, "Not found")
    for a in db.query(OnboardingAssignment).filter(OnboardingAssignment.package_id == pkg_id).all():
        db.query(OnboardingAssignmentItem).filter(OnboardingAssignmentItem.assignment_id == a.id).delete()
        db.delete(a)
    db.query(OnboardingTrigger).filter(OnboardingTrigger.package_id == pkg_id).delete()
    db.query(OnboardingPackageItem).filter(OnboardingPackageItem.package_id == pkg_id).delete()
    db.delete(p)
    db.commit()
    return {"status": "ok"}


@router.get("/packages/{pkg_id}/items")
def list_package_items(pkg_id: UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if not _admin(user):
        raise HTTPException(403, "Forbidden")
    rows = (
        db.query(OnboardingPackageItem)
        .filter(OnboardingPackageItem.package_id == pkg_id)
        .order_by(OnboardingPackageItem.sort_order.asc())
        .all()
    )
    return [_package_item_dict(r) for r in rows]


def _package_item_dict(r: OnboardingPackageItem) -> dict:
    return {
        "id": str(r.id),
        "base_document_id": str(r.base_document_id),
        "required": r.required,
        "employee_visible": r.employee_visible,
        "sort_order": r.sort_order,
        "display_name": r.display_name,
        "notification_message": r.notification_message,
        "delivery_mode": r.delivery_mode or "on_hire",
        "delivery_amount": r.delivery_amount,
        "delivery_unit": r.delivery_unit,
        "delivery_direction": r.delivery_direction,
        "requires_signature": r.requires_signature if r.requires_signature is not None else True,
        "notification_policy": r.notification_policy,
        "recipient_scope": (r.recipient_scope or "everyone").lower(),
        "recipient_user_ids": list(r.recipient_user_ids) if r.recipient_user_ids is not None else [],
        "signing_deadline_days": getattr(r, "signing_deadline_days", None) or 7,
    }


def _apply_package_item_fields(it: OnboardingPackageItem, payload: dict, partial: bool) -> None:
    if not partial or "required" in payload:
        it.required = bool(payload.get("required", True))
    if not partial or "employee_visible" in payload:
        it.employee_visible = bool(payload.get("employee_visible", True))
    if not partial or "sort_order" in payload:
        it.sort_order = int(payload.get("sort_order") or it.sort_order or 0)
    if not partial or "display_name" in payload:
        it.display_name = (payload.get("display_name") or "").strip() or None
    if not partial or "notification_message" in payload:
        v = payload.get("notification_message")
        it.notification_message = (v or "").strip() or None if v is not None else it.notification_message
    if not partial or "delivery_mode" in payload:
        mode = (payload.get("delivery_mode") or "on_hire").lower()
        if mode not in ("on_hire", "custom", "none"):
            raise HTTPException(400, "delivery_mode must be on_hire, custom, or none")
        it.delivery_mode = mode
    if not partial or "delivery_amount" in payload:
        it.delivery_amount = payload.get("delivery_amount")
    if not partial or "delivery_unit" in payload:
        it.delivery_unit = payload.get("delivery_unit")
    if not partial or "delivery_direction" in payload:
        it.delivery_direction = payload.get("delivery_direction")
    if not partial or "requires_signature" in payload:
        it.requires_signature = bool(payload.get("requires_signature", True))
    if not partial or "notification_policy" in payload:
        it.notification_policy = payload.get("notification_policy")
    if it.delivery_mode == "custom":
        if not it.delivery_amount or it.delivery_amount < 1:
            raise HTTPException(400, "custom delivery requires delivery_amount >= 1")
        u = (it.delivery_unit or "").lower()
        if u not in ("days", "weeks", "months"):
            raise HTTPException(400, "delivery_unit must be days, weeks, or months")
        d = (it.delivery_direction or "").lower()
        if d not in ("before", "after"):
            raise HTTPException(400, "delivery_direction must be before or after")
    if not partial:
        scope = (payload.get("recipient_scope") or "everyone").lower()
        if scope not in ("everyone", "specific_users"):
            raise HTTPException(400, "recipient_scope must be everyone or specific_users")
        it.recipient_scope = scope
        uids = [str(x) for x in (payload.get("recipient_user_ids") or [])]
        if scope == "specific_users":
            if not uids:
                raise HTTPException(400, "recipient_user_ids required and non-empty when recipient_scope is specific_users")
            it.recipient_user_ids = uids
        else:
            it.recipient_user_ids = []
    else:
        if "recipient_scope" in payload:
            scope = (payload.get("recipient_scope") or "everyone").lower()
            if scope not in ("everyone", "specific_users"):
                raise HTTPException(400, "recipient_scope must be everyone or specific_users")
            it.recipient_scope = scope
        if "recipient_user_ids" in payload:
            it.recipient_user_ids = [str(x) for x in (payload.get("recipient_user_ids") or [])]
        sc = (it.recipient_scope or "everyone").lower()
        if sc == "specific_users" and not (it.recipient_user_ids or []):
            raise HTTPException(400, "recipient_user_ids required when recipient_scope is specific_users")
        if sc == "everyone" and "recipient_scope" in payload:
            it.recipient_user_ids = []
    if not partial:
        ddays = int(payload.get("signing_deadline_days") or 7)
        if ddays < 1:
            raise HTTPException(400, "signing_deadline_days must be >= 1")
        it.signing_deadline_days = ddays
    else:
        if "signing_deadline_days" in payload:
            ddays = int(payload["signing_deadline_days"] or 7)
            if ddays < 1:
                raise HTTPException(400, "signing_deadline_days must be >= 1")
            it.signing_deadline_days = ddays


@router.post("/packages/{pkg_id}/items")
def add_package_item(pkg_id: UUID, payload: dict, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if not _admin(user):
        raise HTTPException(403, "Forbidden")
    if not db.query(OnboardingPackage).filter(OnboardingPackage.id == pkg_id).first():
        raise HTTPException(404, "Package not found")
    bid = UUID(str(payload["base_document_id"]))
    if not db.query(OnboardingBaseDocument).filter(OnboardingBaseDocument.id == bid).first():
        raise HTTPException(400, "Base document not found")
    max_so = (
        db.query(OnboardingPackageItem)
        .filter(OnboardingPackageItem.package_id == pkg_id)
        .order_by(OnboardingPackageItem.sort_order.desc())
        .first()
    )
    next_so = (max_so.sort_order + 1) if max_so else 0
    it = OnboardingPackageItem(
        package_id=pkg_id,
        base_document_id=bid,
        sort_order=int(payload.get("sort_order", next_so)),
    )
    _apply_package_item_fields(it, {**payload, "sort_order": int(payload.get("sort_order", next_so))}, partial=False)
    db.add(it)
    db.commit()
    db.refresh(it)
    return {"id": str(it.id)}


@router.put("/package-items/{item_id}")
def update_package_item(item_id: UUID, payload: dict, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if not _admin(user):
        raise HTTPException(403, "Forbidden")
    it = db.query(OnboardingPackageItem).filter(OnboardingPackageItem.id == item_id).first()
    if not it:
        raise HTTPException(404, "Not found")
    _apply_package_item_fields(it, payload, partial=True)
    db.commit()
    return {"status": "ok"}


@router.delete("/package-items/{item_id}")
def delete_package_item(item_id: UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if not _admin(user):
        raise HTTPException(403, "Forbidden")
    it = db.query(OnboardingPackageItem).filter(OnboardingPackageItem.id == item_id).first()
    if not it:
        raise HTTPException(404, "Not found")
    db.delete(it)
    db.commit()
    return {"status": "ok"}


@router.post("/base-documents/{doc_id}/resend")
def resend_document(doc_id: UUID, payload: dict, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if not _admin(user):
        raise HTTPException(403, "Forbidden")
    uids = [UUID(str(x)) for x in (payload.get("user_ids") or [])]
    if not uids:
        raise HTTPException(400, "user_ids required")
    n = create_resend_assignment_items(db, doc_id, uids, user.id)
    return {"created": n}


@router.get("/assignments")
def list_assignments(
    user_id: Optional[str] = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not _admin(user):
        raise HTTPException(403, "Forbidden")
    q = db.query(OnboardingAssignment)
    if user_id:
        try:
            q = q.filter(OnboardingAssignment.user_id == UUID(user_id))
        except Exception:
            pass
    rows = q.order_by(OnboardingAssignment.assigned_at.desc()).limit(500).all()
    out = []
    for a in rows:
        items = db.query(OnboardingAssignmentItem).filter(OnboardingAssignmentItem.assignment_id == a.id).all()
        pending = sum(1 for i in items if i.status in ("pending", "scheduled"))
        u = db.query(User).filter(User.id == a.user_id).first()
        p = db.query(OnboardingPackage).filter(OnboardingPackage.id == a.package_id).first()
        out.append(
            {
                "id": str(a.id),
                "user_id": str(a.user_id),
                "username": u.username if u else "",
                "package_id": str(a.package_id),
                "package_name": p.name if p else "",
                "assigned_at": a.assigned_at.isoformat() if a.assigned_at else None,
                "items_total": len(items),
                "items_pending": pending,
            }
        )
    return out


# ----- Me (Step 2) -----


def _my_items(db: Session, user_id: UUID) -> List[OnboardingAssignmentItem]:
    return (
        db.query(OnboardingAssignmentItem)
        .join(OnboardingAssignment, OnboardingAssignment.id == OnboardingAssignmentItem.assignment_id)
        .filter(
            OnboardingAssignment.user_id == user_id,
            OnboardingAssignmentItem.employee_visible.is_(True),
            OnboardingAssignmentItem.status.in_(["pending", "signed"]),
        )
        .order_by(OnboardingAssignmentItem.deadline_at.asc())
        .all()
    )


@me_router.get("/documents")
def me_list_documents(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    promote_scheduled_assignment_items(db, user.id)
    items = _my_items(db, user.id)
    now = datetime.now(timezone.utc)
    out = []
    for it in items:
        bd = db.query(OnboardingBaseDocument).filter(OnboardingBaseDocument.id == it.base_document_id).first()
        if not bd:
            continue
        deadline = it.deadline_at
        if deadline.tzinfo is None:
            deadline = deadline.replace(tzinfo=timezone.utc)
        remaining = (deadline - now).days
        name = (it.display_name or "").strip() or bd.name
        subject_label = None
        if getattr(it, "subject_user_id", None):
            su = db.query(User).filter(User.id == it.subject_user_id).first()
            sep = db.query(EmployeeProfile).filter(EmployeeProfile.user_id == it.subject_user_id).first()
            if sep and (sep.first_name or sep.last_name):
                subject_label = f"{(sep.first_name or '').strip()} {(sep.last_name or '').strip()}".strip()
            elif su:
                subject_label = su.username
        out.append(
            {
                "id": str(it.id),
                "document_name": name,
                "user_message": it.user_message,
                "status": it.status,
                "deadline_at": it.deadline_at.isoformat() if it.deadline_at else None,
                "remaining_days": max(0, remaining) if it.status == "pending" else None,
                "required": it.required,
                "signed_file_id": str(it.signed_file_id) if it.signed_file_id else None,
                "subject_user_id": str(it.subject_user_id) if getattr(it, "subject_user_id", None) else None,
                "subject_label": subject_label,
            }
        )
    return out


@me_router.get("/documents/{item_id}/preview")
def me_preview_base(item_id: UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    it = (
        db.query(OnboardingAssignmentItem)
        .join(OnboardingAssignment, OnboardingAssignment.id == OnboardingAssignmentItem.assignment_id)
        .filter(
            OnboardingAssignmentItem.id == item_id,
            OnboardingAssignment.user_id == user.id,
        )
        .first()
    )
    if not it:
        raise HTTPException(404, "Not found")
    if it.status == "scheduled":
        raise HTTPException(403, "Document not yet available")
    bd = db.query(OnboardingBaseDocument).filter(OnboardingBaseDocument.id == it.base_document_id).first()
    if not bd:
        raise HTTPException(404, "Document not found")
    from ..models.models import FileObject

    fo = db.query(FileObject).filter(FileObject.id == bd.file_id).first()
    if not fo:
        raise HTTPException(404, "File not found")
    data = read_file_object_bytes(db, fo)
    disp = (it.display_name or "").strip() or bd.name
    return Response(content=data, media_type="application/pdf", headers={"Content-Disposition": f'inline; filename="{disp}.pdf"'})


@me_router.get("/documents/{item_id}/signing-context")
def me_signing_context(item_id: UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Template fields + page sizes for the signing UI (pending items only)."""
    promote_scheduled_assignment_items(db, user.id)
    it = (
        db.query(OnboardingAssignmentItem)
        .join(OnboardingAssignment, OnboardingAssignment.id == OnboardingAssignmentItem.assignment_id)
        .filter(
            OnboardingAssignmentItem.id == item_id,
            OnboardingAssignment.user_id == user.id,
        )
        .first()
    )
    if not it:
        raise HTTPException(404, "Not found")
    if it.status == "scheduled":
        raise HTTPException(403, "Document not yet available")
    if it.status != "pending":
        raise HTTPException(400, "Document is not pending signature")
    bd = db.query(OnboardingBaseDocument).filter(OnboardingBaseDocument.id == it.base_document_id).first()
    if not bd:
        raise HTTPException(404, "Document not found")
    from ..models.models import FileObject

    fo = db.query(FileObject).filter(FileObject.id == bd.file_id).first()
    if not fo:
        raise HTTPException(404, "File not found")
    pdf_bytes = read_file_object_bytes(db, fo)
    tmpl = getattr(bd, "signature_template", None)
    fields = filter_fields_for_signer(tmpl, bd)
    page_sizes = get_pdf_page_sizes(pdf_bytes)
    use_tpl = template_is_active(tmpl) and len(fields) > 0
    return {
        "base_document_id": str(bd.id),
        "assignment_item_id": str(it.id),
        "document_name": (it.display_name or "").strip() or bd.name,
        "assignee_role": signer_role_for_base_document(bd),
        "uses_template": use_tpl,
        "signature_template": {"version": (tmpl or {}).get("version", 1), "fields": fields} if use_tpl else None,
        "page_sizes": [{"width": w, "height": h} for w, h in page_sizes],
    }


@me_router.get("/status")
def me_onboarding_status(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    promote_scheduled_assignment_items(db, user.id)
    items = _my_items(db, user.id)
    now = datetime.now(timezone.utc)
    pending_required = [i for i in items if i.status == "pending" and i.required]
    has_pending = len(pending_required) > 0
    past_deadline = False
    earliest = None
    for i in pending_required:
        d = i.deadline_at
        if d.tzinfo is None:
            d = d.replace(tzinfo=timezone.utc)
        if d < now:
            past_deadline = True
        if earliest is None or d < earliest:
            earliest = d
    return {
        "has_pending": has_pending,
        "past_deadline": past_deadline and has_pending,
        "pending_count": len(pending_required),
        "earliest_deadline": earliest.isoformat() if earliest else None,
    }


@me_router.post("/sign")
async def me_sign(
    request: Request,
    assignment_item_id: str = Form(...),
    agreement: str = Form(""),
    signature_base64: str = Form(""),
    field_values_json: str = Form(""),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if agreement.lower() not in ("true", "1", "yes", "on"):
        raise HTTPException(400, "You must agree to sign")
    try:
        aid = UUID(assignment_item_id)
    except Exception:
        raise HTTPException(400, "Invalid assignment_item_id")
    it = (
        db.query(OnboardingAssignmentItem)
        .join(OnboardingAssignment, OnboardingAssignment.id == OnboardingAssignmentItem.assignment_id)
        .filter(
            OnboardingAssignmentItem.id == aid,
            OnboardingAssignment.user_id == user.id,
        )
        .first()
    )
    if not it or it.status != "pending":
        raise HTTPException(400, "Invalid or already signed")
    now = datetime.now(timezone.utc)
    bd = db.query(OnboardingBaseDocument).filter(OnboardingBaseDocument.id == it.base_document_id).first()
    if not bd:
        raise HTTPException(404, "Base document missing")
    if not getattr(bd, "requires_signature", True):
        raise HTTPException(400, "This document does not require a signature")
    from ..models.models import FileObject

    fo = db.query(FileObject).filter(FileObject.id == bd.file_id).first()
    if not fo:
        raise HTTPException(404, "File missing")
    base_pdf = read_file_object_bytes(db, fo)
    base_hash = bd.content_hash or sha256_bytes(base_pdf)
    ep = db.query(EmployeeProfile).filter(EmployeeProfile.user_id == user.id).first()
    signer_name = (
        f"{(ep.first_name or '')} {(ep.last_name or '')}".strip()
        if ep
        else user.username
    )
    email = user.email_personal or (user.email or "")
    asn = db.query(OnboardingAssignment).filter(OnboardingAssignment.id == it.assignment_id).first()
    requested_at = asn.assigned_at if asn else now
    if asn and asn.assigned_by_id:
        assigner_label = (get_user_display(db, asn.assigned_by_id) or "").strip()
        requested_by = assigner_label or "Unknown"
    else:
        requested_by = "HR Onboarding"
    acceptance = "I have read and agree to this document."

    tmpl = getattr(bd, "signature_template", None)
    fields = filter_fields_for_signer(tmpl, bd)
    use_template = template_is_active(tmpl) and len(fields) > 0

    if use_template:
        try:
            fv = json.loads(field_values_json) if (field_values_json or "").strip() else {}
        except Exception:
            raise HTTPException(400, "field_values_json must be valid JSON")
        if not isinstance(fv, dict):
            raise HTTPException(400, "field_values must be a JSON object")
        resolved = validate_field_values_for_signing(fields, fv, ep, user)
        merged = apply_template_field_overlays(base_pdf, fields, resolved)
        final_pdf, cert_hash = build_signed_pdf_with_certificate_from_merged(
            merged,
            document_name=(it.display_name or "").strip() or bd.name,
            document_id=str(bd.id),
            base_doc_hash=base_hash,
            requested_by=requested_by,
            requested_at=requested_at,
            signer_name=signer_name,
            signer_email=email or "",
            signed_at=now,
            ip_address=_client_ip(request),
            user_agent=request.headers.get("user-agent") or "",
            acceptance_statement=acceptance,
        )
    else:
        raw = signature_base64.split(",")[-1] if "," in signature_base64 else signature_base64
        try:
            sig_bytes = base64.b64decode(raw)
        except Exception:
            raise HTTPException(400, "Invalid signature image")
        if not sig_bytes or len(sig_bytes) < 50:
            raise HTTPException(400, "Signature image required")
        placement = bd.sign_placement or default_placement()
        final_pdf, cert_hash = build_signed_pdf_with_certificate(
            base_pdf,
            sig_bytes,
            placement,
            document_name=(it.display_name or "").strip() or bd.name,
            document_id=str(bd.id),
            base_doc_hash=base_hash,
            requested_by=requested_by,
            requested_at=requested_at,
            signer_name=signer_name,
            signer_email=email or "",
            signed_at=now,
            ip_address=_client_ip(request),
            user_agent=request.headers.get("user-agent") or "",
            acceptance_statement=acceptance,
        )
    safe_name = re.sub(r"[^\w\s.-]", "", bd.name)[:80] or "document"
    fname = f"{safe_name}_signed_{now.strftime('%Y%m%d')}.pdf"
    signed_fo = save_pdf_bytes_as_file_object(db, final_pdf, fname, user.id, user.id)
    folder = get_or_create_hr_documents_folder(db, user.id, user.id)
    tag = f"folder:{folder.id}"
    edoc = EmployeeDocument(
        user_id=user.id,
        doc_type=tag,
        title=f"{bd.name} (signed {now.strftime('%Y-%m-%d')}).pdf",
        file_id=signed_fo.id,
        created_by=user.id,
    )
    db.add(edoc)
    db.flush()
    sd = OnboardingSignedDocument(
        user_id=user.id,
        base_document_id=bd.id,
        assignment_item_id=it.id,
        signed_file_id=signed_fo.id,
        employee_document_id=edoc.id,
        certificate_hash=cert_hash,
        signer_name=signer_name,
        signer_email=email,
        signed_at=now,
        ip_address=_client_ip(request),
        user_agent=(request.headers.get("user-agent") or "")[:500],
        acceptance_text=acceptance,
    )
    db.add(sd)
    it.status = "signed"
    it.signed_at = now
    it.signed_file_id = signed_fo.id
    db.commit()
    return {
        "status": "ok",
        "signed_file_id": str(signed_fo.id),
        "employee_document_id": str(edoc.id),
    }

