"""Create DocumentSignatureRequest envelopes from onboarding base documents."""
from __future__ import annotations

import copy
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple
from uuid import UUID

from sqlalchemy.orm import Session

from ..models.models import (
    DocumentSignatureRequest,
    EmployeeProfile,
    FileObject,
    OnboardingBaseDocument,
    User,
    UserDocument,
)
from ..services.document_signer_roles import LEGACY_STABLE_IDS
from ..services.onboarding_signature_template import (
    SIGNING_FIELD_TYPES,
    signing_fields_in_template,
    validate_and_normalize_template,
)
from ..services.onboarding_storage import read_file_object_bytes
from ..services.task_service import get_user_display

logger = logging.getLogger(__name__)

# Stable namespace for per-user role ids on onboarding envelopes.
_ONBOARDING_USER_ROLE_NS = uuid.UUID("a7c3e1f0-9b2d-4e8a-91c6-5d4f3a2b1c0e")


def onboarding_base_should_use_envelope(bd: OnboardingBaseDocument) -> bool:
    """True when hire package delivery should create a DSR envelope instead of assignment items."""
    tmpl = getattr(bd, "signature_template", None)
    return bool(signing_fields_in_template(tmpl if isinstance(tmpl, dict) else None))


def base_document_needs_esignature(bd: OnboardingBaseDocument) -> bool:
    """True when the base PDF template has signature/initials/date fields (needs e-sign)."""
    return onboarding_base_should_use_envelope(bd)


def _active_onboarding_base_signature(
    db: Session,
    *,
    base_document_id: UUID,
    subject_user_id: UUID,
) -> bool:
    """True if hire already has a non-cancelled signature request for this base doc."""
    from ..models.models import UserDocument as UD

    row = (
        db.query(DocumentSignatureRequest.id)
        .join(UD, UD.id == DocumentSignatureRequest.user_document_id)
        .filter(
            DocumentSignatureRequest.onboarding_base_document_id == base_document_id,
            UD.subject_user_id == subject_user_id,
            DocumentSignatureRequest.cancelled_at.is_(None),
            DocumentSignatureRequest.status != "cancelled",
        )
        .first()
    )
    return row is not None


def _user_role_id(user_id: UUID) -> str:
    return str(uuid.uuid5(_ONBOARDING_USER_ROLE_NS, str(user_id)))


def _build_envelope_roles_and_template(
    db: Session,
    template: dict,
    *,
    subject_user_id: UUID,
) -> Tuple[List[dict], dict, Dict[str, UUID], List[str], Dict[str, str]]:
    """
    Map employee/user template assignees to Document Builder role ids.

    Returns (signer_roles, normalized_with_role_assignees, assignments, required_roles, labels).
    """
    fields = template.get("fields") if isinstance(template.get("fields"), list) else []
    emp_role = LEGACY_STABLE_IDS["employee"]
    roles: List[dict] = []
    labels: Dict[str, str] = {}
    assignments: Dict[str, UUID] = {}
    required_roles: List[str] = []
    seen_roles: set[str] = set()

    # Collect signers in order: New Hire first (if any signing field), then users by first appearance.
    has_employee_signing = any(
        isinstance(f, dict)
        and (f.get("type") or "").strip().lower() in SIGNING_FIELD_TYPES
        and (f.get("assignee") or "employee").lower() == "employee"
        for f in fields
    )
    # Also include employee if any field (not only signing) is employee — tokens etc.
    has_employee_any = any(
        isinstance(f, dict) and (f.get("assignee") or "employee").lower() == "employee" for f in fields
    )
    if has_employee_signing or has_employee_any:
        roles.append(
            {
                "id": emp_role,
                "label": "New Hire",
                "sortOrder": 0,
                "fillsEmployeeTokens": True,
            }
        )
        labels[emp_role] = "New Hire"
        assignments[emp_role] = subject_user_id
        required_roles.append(emp_role)
        seen_roles.add(emp_role)

    user_order: List[UUID] = []
    seen_users: set[UUID] = set()
    for f in fields:
        if not isinstance(f, dict):
            continue
        if (f.get("assignee") or "").lower() != "user":
            continue
        raw_uid = f.get("assignee_user_id")
        if not raw_uid:
            continue
        try:
            uid = UUID(str(raw_uid))
        except Exception:
            continue
        if uid in seen_users:
            continue
        seen_users.add(uid)
        user_order.append(uid)

    for uid in user_order:
        rid = _user_role_id(uid)
        if rid in seen_roles:
            continue
        display = (get_user_display(db, uid) or "").strip() or "Signer"
        sort_order = len(roles)
        roles.append(
            {
                "id": rid,
                "label": display[:120],
                "sortOrder": sort_order,
                "fillsEmployeeTokens": False,
            }
        )
        labels[rid] = display[:120]
        assignments[rid] = uid
        required_roles.append(rid)
        seen_roles.add(rid)

    # Rewrite field assignees to role ids for the envelope snapshot.
    out_fields: List[dict] = []
    for f in fields:
        if not isinstance(f, dict):
            continue
        nf = copy.deepcopy(f)
        a = (nf.get("assignee") or "employee").lower()
        if a == "employee":
            nf["assignee"] = emp_role
            nf.pop("assignee_user_id", None)
        elif a == "user":
            raw_uid = nf.get("assignee_user_id")
            try:
                uid = UUID(str(raw_uid))
            except Exception:
                raise ValueError("user field missing assignee_user_id")
            nf["assignee"] = _user_role_id(uid)
            nf.pop("assignee_user_id", None)
        out_fields.append(nf)

    # Only roles that appear on signing fields are required for the request.
    signing_role_ids: List[str] = []
    seen_sr: set[str] = set()
    for f in out_fields:
        if (f.get("type") or "").strip().lower() not in SIGNING_FIELD_TYPES:
            continue
        rid = str(f.get("assignee") or "")
        if rid and rid not in seen_sr and rid in assignments:
            seen_sr.add(rid)
            signing_role_ids.append(rid)

    if not signing_role_ids:
        raise ValueError("no signing roles in template")

    # Keep role catalog ordered: hire first among required, then users.
    ordered_required = [r for r in required_roles if r in seen_sr]
    # Ensure any signing role not in required_roles is appended (shouldn't happen)
    for r in signing_role_ids:
        if r not in ordered_required:
            ordered_required.append(r)

    normalized = {"version": int(template.get("version") or 1), "fields": out_fields}
    return roles, normalized, assignments, ordered_required, labels


def send_onboarding_base_as_envelope(
    db: Session,
    *,
    bd: OnboardingBaseDocument,
    subject_user_id: UUID,
    requested_by: Optional[User] = None,
) -> Optional[DocumentSignatureRequest]:
    """
    Create a multi-signer (or single-hire) DocumentSignatureRequest from a base document.

    Returns the request row, or None if skipped (dedupe / not applicable).
    Raises ValueError on hard failures.
    """
    if not onboarding_base_should_use_envelope(bd):
        return None

    if _active_onboarding_base_signature(
        db, base_document_id=bd.id, subject_user_id=subject_user_id
    ):
        logger.info(
            "onboarding_base_envelope_skipped_duplicate base=%s subject=%s",
            str(bd.id),
            str(subject_user_id),
        )
        return None

    fo = db.query(FileObject).filter(FileObject.id == bd.file_id).first()
    if not fo:
        raise ValueError("onboarding base document file not found")
    pdf_bytes = read_file_object_bytes(db, fo)

    raw_tmpl = getattr(bd, "signature_template", None)
    if not isinstance(raw_tmpl, dict):
        raise ValueError("onboarding base document has no signature template")

    # Persist assignee_user_id; do not require again if already stored.
    normalized_src = validate_and_normalize_template(
        raw_tmpl, pdf_bytes, require_user_assignee_ids=True
    )

    if requested_by is None:
        ep = db.query(EmployeeProfile).filter(EmployeeProfile.user_id == subject_user_id).first()
        inviter_id = getattr(ep, "invited_by_user_id", None) if ep else None
        if inviter_id:
            requested_by = db.query(User).filter(User.id == inviter_id).first()
    if requested_by is None:
        # Fall back to hire as requester for system bookkeeping (rare).
        requested_by = db.query(User).filter(User.id == subject_user_id).first()
    if requested_by is None:
        raise ValueError("no requester user for onboarding envelope")

    roles, normalized, assignments, required_roles, labels = _build_envelope_roles_and_template(
        db, normalized_src, subject_user_id=subject_user_id
    )

    # Validate assigned users exist
    for rid, uid in assignments.items():
        if not db.query(User).filter(User.id == uid).first():
            raise ValueError(f"signer user not found for role {labels.get(rid, rid)}")

    from ..routes.document_signature_requests import (
        _create_signature_request,
        link_standalone_doc_to_employee_subject,
    )

    title = (
        (getattr(bd, "display_name", None) or "").strip()
        or (getattr(bd, "name", None) or "").strip()
        or "Document"
    )
    now = datetime.now(timezone.utc)
    envelope = UserDocument(
        title=title,
        pages=[],
        signer_roles=roles,
        created_by=requested_by.id,
        created_at=now,
        updated_at=now,
    )
    db.add(envelope)
    db.flush()
    link_standalone_doc_to_employee_subject(envelope, subject_user_id)

    deadline = int(getattr(bd, "signing_deadline_days", None) or getattr(bd, "default_deadline_days", None) or 7)
    if deadline < 1:
        deadline = 7
    msg = (getattr(bd, "notification_message", None) or "").strip() or None
    ep = db.query(EmployeeProfile).filter(EmployeeProfile.user_id == subject_user_id).first()
    requester_ip = (getattr(ep, "invited_from_ip", None) or "").strip() or None

    row = _create_signature_request(
        db,
        requested_by,
        doc=envelope,
        pdf_bytes=pdf_bytes,
        normalized=normalized,
        required_roles=required_roles,
        assignments=assignments,
        labels=labels,
        signing_deadline_days=deadline,
        block_hub_access=bool(getattr(bd, "required", True)),
        message_to_signers=msg,
        origin="invite",
        requester_ip=requester_ip,
        onboarding_base_document_id=bd.id,
    )
    return row
