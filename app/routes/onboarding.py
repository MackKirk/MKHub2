"""HR onboarding admin API + /auth/me/onboarding/* for Step 2."""
import base64
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
from ..services.onboarding_assign import create_resend_assignment_items, get_or_create_hr_documents_folder
from ..services.onboarding_sign import build_signed_pdf_with_certificate, default_placement
from ..services.onboarding_storage import read_file_object_bytes, save_pdf_bytes_as_file_object
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


# ----- Admin -----


@router.get("/base-documents")
def list_base_documents(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if not _admin(user):
        raise HTTPException(403, "Forbidden")
    rows = db.query(OnboardingBaseDocument).order_by(OnboardingBaseDocument.name.asc()).all()
    return [
        {
            "id": str(r.id),
            "name": r.name,
            "file_id": str(r.file_id),
            "content_hash": r.content_hash,
            "sign_placement": r.sign_placement or default_placement(),
            "default_deadline_days": r.default_deadline_days,
        }
        for r in rows
    ]


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
    days = int(payload.get("default_deadline_days") or 7)
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
    db.commit()
    return {"status": "ok"}


@router.delete("/base-documents/{doc_id}")
def delete_base_document(doc_id: UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if not _admin(user):
        raise HTTPException(403, "Forbidden")
    bd = db.query(OnboardingBaseDocument).filter(OnboardingBaseDocument.id == doc_id).first()
    if not bd:
        raise HTTPException(404, "Not found")
    if db.query(OnboardingPackageItem).filter(OnboardingPackageItem.base_document_id == doc_id).first():
        raise HTTPException(400, "Document is used in a package")
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
    return [
        {
            "id": str(r.id),
            "base_document_id": str(r.base_document_id),
            "required": r.required,
            "employee_visible": r.employee_visible,
            "sort_order": r.sort_order,
        }
        for r in rows
    ]


@router.post("/packages/{pkg_id}/items")
def add_package_item(pkg_id: UUID, payload: dict, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if not _admin(user):
        raise HTTPException(403, "Forbidden")
    if not db.query(OnboardingPackage).filter(OnboardingPackage.id == pkg_id).first():
        raise HTTPException(404, "Package not found")
    bid = UUID(str(payload["base_document_id"]))
    if not db.query(OnboardingBaseDocument).filter(OnboardingBaseDocument.id == bid).first():
        raise HTTPException(400, "Base document not found")
    it = OnboardingPackageItem(
        package_id=pkg_id,
        base_document_id=bid,
        required=payload.get("required", True),
        employee_visible=payload.get("employee_visible", True),
        sort_order=int(payload.get("sort_order") or 0),
    )
    db.add(it)
    db.commit()
    db.refresh(it)
    return {"id": str(it.id)}


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


@router.get("/packages/{pkg_id}/triggers")
def list_triggers(pkg_id: UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if not _admin(user):
        raise HTTPException(403, "Forbidden")
    rows = (
        db.query(OnboardingTrigger)
        .filter(OnboardingTrigger.package_id == pkg_id)
        .order_by(OnboardingTrigger.sort_order.asc())
        .all()
    )
    return [
        {
            "id": str(r.id),
            "condition_type": r.condition_type,
            "condition_value": r.condition_value or {},
            "sort_order": r.sort_order,
        }
        for r in rows
    ]


@router.post("/packages/{pkg_id}/triggers")
def add_trigger(pkg_id: UUID, payload: dict, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if not _admin(user):
        raise HTTPException(403, "Forbidden")
    if not db.query(OnboardingPackage).filter(OnboardingPackage.id == pkg_id).first():
        raise HTTPException(404, "Package not found")
    t = OnboardingTrigger(
        package_id=pkg_id,
        condition_type=(payload.get("condition_type") or "all").lower(),
        condition_value=payload.get("condition_value") or {},
        sort_order=int(payload.get("sort_order") or 0),
    )
    db.add(t)
    db.commit()
    db.refresh(t)
    return {"id": str(t.id)}


@router.delete("/triggers/{trigger_id}")
def delete_trigger(trigger_id: UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if not _admin(user):
        raise HTTPException(403, "Forbidden")
    t = db.query(OnboardingTrigger).filter(OnboardingTrigger.id == trigger_id).first()
    if not t:
        raise HTTPException(404, "Not found")
    db.delete(t)
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
        pending = sum(1 for i in items if i.status == "pending")
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
        )
        .order_by(OnboardingAssignmentItem.deadline_at.asc())
        .all()
    )


@me_router.get("/documents")
def me_list_documents(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
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
        out.append(
            {
                "id": str(it.id),
                "document_name": bd.name,
                "status": it.status,
                "deadline_at": it.deadline_at.isoformat() if it.deadline_at else None,
                "remaining_days": max(0, remaining) if it.status == "pending" else None,
                "required": it.required,
                "signed_file_id": str(it.signed_file_id) if it.signed_file_id else None,
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
    bd = db.query(OnboardingBaseDocument).filter(OnboardingBaseDocument.id == it.base_document_id).first()
    if not bd:
        raise HTTPException(404, "Document not found")
    from ..models.models import FileObject

    fo = db.query(FileObject).filter(FileObject.id == bd.file_id).first()
    if not fo:
        raise HTTPException(404, "File not found")
    data = read_file_object_bytes(db, fo)
    return Response(content=data, media_type="application/pdf", headers={"Content-Disposition": f'inline; filename="{bd.name}.pdf"'})


@me_router.get("/status")
def me_onboarding_status(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
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
    signature_base64: str = Form(...),
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
    from ..models.models import FileObject

    fo = db.query(FileObject).filter(FileObject.id == bd.file_id).first()
    if not fo:
        raise HTTPException(404, "File missing")
    base_pdf = read_file_object_bytes(db, fo)
    base_hash = bd.content_hash or sha256_bytes(base_pdf)
    raw = signature_base64.split(",")[-1] if "," in signature_base64 else signature_base64
    try:
        sig_bytes = base64.b64decode(raw)
    except Exception:
        raise HTTPException(400, "Invalid signature image")
    if not sig_bytes or len(sig_bytes) < 50:
        raise HTTPException(400, "Signature image required")
    ep = db.query(EmployeeProfile).filter(EmployeeProfile.user_id == user.id).first()
    signer_name = (
        f"{(ep.first_name or '')} {(ep.last_name or '')}".strip()
        if ep
        else user.username
    )
    email = user.email_personal or (user.email or "")
    placement = bd.sign_placement or default_placement()
    asn = db.query(OnboardingAssignment).filter(OnboardingAssignment.id == it.assignment_id).first()
    pkg = db.query(OnboardingPackage).filter(OnboardingPackage.id == asn.package_id).first() if asn else None
    requested_by = pkg.name if pkg else "HR Onboarding"
    requested_at = asn.assigned_at if asn else now
    acceptance = "I have read and agree to this document."
    final_pdf, cert_hash = build_signed_pdf_with_certificate(
        base_pdf,
        sig_bytes,
        placement,
        document_name=bd.name,
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

