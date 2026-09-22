"""Fire invite additional documents (Document Types / Employee Contract) after profile complete."""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.orm import Session

from ..models.models import (
    DocumentSignatureTemplate,
    DocumentTemplate,
    DocumentType,
    EmployeeProfile,
    FileObject,
    OnboardingBaseDocument,
    User,
    UserDocument,
)
from ..services.document_template_categories import is_employee_contract_category
from ..services.onboarding_assign import (
    ensure_assignment_items_for_base_doc,
    get_or_create_system_package,
    is_additional_package_role,
    is_onboarding_document_delivery_enabled,
)
from ..services.onboarding_delivery import hire_anchor_start
from ..services.document_signer_roles import (
    LEGACY_STABLE_IDS,
    default_signer_roles,
    ensure_document_signer_roles,
    order_role_ids_present,
    role_label_map,
    synthesize_roles_from_assignees,
)
from ..services.onboarding_signature_template import (
    normalize_document_assignee,
    roles_present_in_signing_fields,
    roles_present_in_template,
    signing_fields_in_template,
    validate_and_normalize_template,
)
from ..services.onboarding_storage import read_file_object_bytes

logger = logging.getLogger(__name__)


def _build_hire_assignments(
    required_roles: List[str],
    *,
    subject_user_id: UUID,
    requested_by_id: UUID,
    roles_catalog: Optional[List[dict]] = None,
) -> Optional[Dict[str, UUID]]:
    """
    Map employee role → new hire; all other roles → inviter.
    Returns None if a required role cannot be assigned.
    """
    emp_id = LEGACY_STABLE_IDS["employee"]
    # Prefer fillsEmployeeTokens / label Employee when catalog present
    if roles_catalog:
        for r in roles_catalog:
            if not isinstance(r, dict):
                continue
            if r.get("fillsEmployeeTokens") is True:
                emp_id = str(r.get("id") or emp_id)
                break
            if str(r.get("label") or "").strip().lower() == "employee":
                emp_id = str(r.get("id") or emp_id)
                break

    assignments: Dict[str, UUID] = {}
    for role in required_roles:
        rid = str(role)
        if rid == emp_id or rid.lower() == "employee":
            assignments[rid] = subject_user_id
        else:
            assignments[rid] = requested_by_id
    if not assignments:
        return None
    return assignments


def _clone_elements_with_new_ids(elements: list, prefix: str) -> list:
    out = []
    for i, el in enumerate(elements or []):
        if not isinstance(el, dict):
            continue
        cloned = dict(el)
        cloned["id"] = f"{prefix}-{i}-{uuid.uuid4().hex[:8]}"
        out.append(cloned)
    return out


def validate_invite_additional_documents(db: Session, refs: Any) -> List[dict]:
    """
    Normalize invite additional_documents to [{source, id, name}].
    Accepts document_type (Employee Contract) or onboarding_base (package_role=additional).
    """
    raw = refs if isinstance(refs, list) else []
    out: List[dict] = []
    seen: set[tuple[str, str]] = set()
    for ref in raw:
        source = (getattr(ref, "source", None) if not isinstance(ref, dict) else ref.get("source")) or ""
        source = str(source).strip().lower()
        rid_raw = getattr(ref, "id", None) if not isinstance(ref, dict) else ref.get("id")
        rid = str(rid_raw or "").strip()
        name_raw = getattr(ref, "name", None) if not isinstance(ref, dict) else ref.get("name")
        if not source or not rid:
            raise HTTPException(status_code=422, detail="additional_documents entries require source and id")
        if source not in ("document_type", "onboarding_base"):
            raise HTTPException(
                status_code=422,
                detail="additional_documents source must be document_type or onboarding_base",
            )
        key = (source, rid)
        if key in seen:
            continue
        try:
            uid = UUID(rid)
        except Exception:
            raise HTTPException(status_code=422, detail=f"Invalid additional document id: {rid}")
        if source == "document_type":
            row = db.query(DocumentType).filter(DocumentType.id == uid).first()
            if not row:
                raise HTTPException(status_code=422, detail=f"Document type not found: {rid}")
            if not is_employee_contract_category(getattr(row, "category", None)):
                raise HTTPException(
                    status_code=422,
                    detail=f"Document type must be in Employee Contract category: {rid}",
                )
            name = (
                (str(name_raw).strip() if name_raw else "")
                or (getattr(row, "name", None) or "").strip()
                or "Document"
            )
        else:
            bd = db.query(OnboardingBaseDocument).filter(OnboardingBaseDocument.id == uid).first()
            if not bd:
                raise HTTPException(status_code=422, detail=f"Onboarding document not found: {rid}")
            if getattr(bd, "employee_visible", True) is False:
                raise HTTPException(status_code=422, detail=f"Onboarding document is inactive: {rid}")
            if not is_additional_package_role(getattr(bd, "package_role", None)):
                raise HTTPException(
                    status_code=422,
                    detail=f"Onboarding document must have package_role additional: {rid}",
                )
            name = (
                (str(name_raw).strip() if name_raw else "")
                or (getattr(bd, "display_name", None) or "").strip()
                or (getattr(bd, "name", None) or "").strip()
                or "Document"
            )
        seen.add(key)
        out.append({"source": source, "id": rid, "name": name})
    return out


def _send_onboarding_base(
    db: Session,
    *,
    base_document_id: UUID,
    subject_user_id: UUID,
) -> int:
    """Create OnboardingAssignmentItem(s) for an additional base document. Returns items created."""
    if not is_onboarding_document_delivery_enabled(db):
        raise ValueError("onboarding document delivery is disabled")
    bd = db.query(OnboardingBaseDocument).filter(OnboardingBaseDocument.id == base_document_id).first()
    if not bd:
        raise ValueError("onboarding document not found")
    if not is_additional_package_role(getattr(bd, "package_role", None)):
        raise ValueError("onboarding document is not package_role additional")
    if getattr(bd, "employee_visible", True) is False:
        raise ValueError("onboarding document is inactive")

    now = datetime.now(timezone.utc)
    ep = db.query(EmployeeProfile).filter(EmployeeProfile.user_id == subject_user_id).first()
    hire_dt = ep.hire_date if ep else None
    hire_start = hire_anchor_start(hire_dt, now)
    pkg = get_or_create_system_package(db)
    created = ensure_assignment_items_for_base_doc(
        db,
        bd=bd,
        subject_user_id=subject_user_id,
        package_id=pkg.id,
        hire_start=hire_start,
        now=now,
        force_delivery=True,
    )
    if created == 0:
        from .onboarding_assign import _assignment_item_exists, _get_or_create_assignment

        asn = _get_or_create_assignment(db, subject_user_id, pkg.id, now)
        if _assignment_item_exists(db, asn.id, bd.id, None) or _assignment_item_exists(
            db, asn.id, bd.id, subject_user_id
        ):
            return 0
        raise ValueError(
            "additional onboarding document produced no assignment "
            "(check delivery_mode, assignees, or employee_visible)"
        )
    return created


def _send_signature_template(
    db: Session,
    *,
    template_id: UUID,
    subject_user_id: UUID,
    requested_by: User,
) -> None:
    from ..routes.document_signature_requests import (
        _create_signature_request,
        link_standalone_doc_to_employee_subject,
    )

    row = db.query(DocumentSignatureTemplate).filter(DocumentSignatureTemplate.id == template_id).first()
    if not row:
        raise ValueError("signature template not found")
    if not row.signature_template:
        raise ValueError("signature template has no fields")

    fo = db.query(FileObject).filter(FileObject.id == row.file_id).first()
    if not fo:
        raise ValueError("signature template file not found")
    pdf_bytes = read_file_object_bytes(db, fo)

    raw = row.signature_template
    if not signing_fields_in_template(raw):
        raise ValueError("signature template has no signing fields")

    normalized = validate_and_normalize_template(raw, pdf_bytes)
    for f in normalized.get("fields") or []:
        if isinstance(f, dict):
            f["assignee"] = normalize_document_assignee(f.get("assignee"))

    present_list = roles_present_in_signing_fields(normalized)
    if not present_list:
        raise ValueError("no signer roles on template")
    present = set(present_list)

    assignees_raw = [
        f.get("assignee")
        for f in normalized.get("fields") or []
        if isinstance(f, dict)
        and (f.get("type") or "").strip().lower() in ("signature", "initials", "date")
    ]
    roles_catalog = synthesize_roles_from_assignees(assignees_raw)
    labels = role_label_map(roles_catalog)
    required_roles = order_role_ids_present(roles_catalog, present)
    if not required_roles:
        raise ValueError("no required roles")

    assignments = _build_hire_assignments(
        required_roles,
        subject_user_id=subject_user_id,
        requested_by_id=requested_by.id,
        roles_catalog=roles_catalog,
    )
    if not assignments:
        raise ValueError("could not build role assignments")

    now = datetime.now(timezone.utc)
    envelope = UserDocument(
        title=(row.name or "Document").strip() or "Document",
        pages=[],
        signer_roles=roles_catalog,
        signature_template_id=row.id,
        created_by=requested_by.id,
        created_at=now,
        updated_at=now,
    )
    db.add(envelope)
    db.flush()
    link_standalone_doc_to_employee_subject(envelope, subject_user_id)

    _create_signature_request(
        db,
        requested_by,
        doc=envelope,
        pdf_bytes=pdf_bytes,
        normalized=normalized,
        required_roles=required_roles,
        assignments=assignments,
        labels=labels,
        signing_deadline_days=7,
        block_hub_access=False,
        message_to_signers=None,
    )


def _active_signature_exists_for_document_type(
    db: Session,
    *,
    type_id: UUID,
    subject_user_id: UUID,
) -> bool:
    """True if this hire already has a non-cancelled signature request for this document type."""
    from ..models.models import DocumentSignatureRequest

    row = (
        db.query(DocumentSignatureRequest.id)
        .join(UserDocument, UserDocument.id == DocumentSignatureRequest.user_document_id)
        .filter(
            UserDocument.document_type_id == type_id,
            UserDocument.subject_user_id == subject_user_id,
            DocumentSignatureRequest.cancelled_at.is_(None),
            DocumentSignatureRequest.status != "cancelled",
        )
        .first()
    )
    return row is not None


def _send_document_type(
    db: Session,
    *,
    type_id: UUID,
    subject_user_id: UUID,
    requested_by: User,
) -> None:
    from ..document_creator.pdf_builder import build_pdf_bytes
    from ..document_creator.signature_fields import build_signature_template_payload
    from ..routes.document_creator import _clone_elements_with_new_ids as _clone_route
    from ..routes.document_creator import _project_token_values, _substitute_project_tokens
    from ..routes.document_signature_requests import (
        _create_signature_request,
        link_standalone_doc_to_employee_subject,
    )
    from ..services.document_title import build_scoped_document_title, unique_title_in_scope

    if _active_signature_exists_for_document_type(
        db, type_id=type_id, subject_user_id=subject_user_id
    ):
        logger.info(
            "invite_additional_document_type_skipped_duplicate type=%s subject=%s",
            str(type_id),
            str(subject_user_id),
        )
        return

    doc_type = db.query(DocumentType).filter(DocumentType.id == type_id).first()
    if not doc_type:
        raise ValueError("document type not found")

    pt_list = doc_type.page_templates or []
    if not isinstance(pt_list, list):
        pt_list = []
    pages: List[dict] = []
    for idx, entry in enumerate(pt_list):
        if not isinstance(entry, dict):
            pages.append({"template_id": None, "elements": []})
            continue
        tid = entry.get("template_id")
        entry_margins = entry.get("margins")
        entry_elements = entry.get("elements") if isinstance(entry.get("elements"), list) else []
        if not tid:
            pages.append({"template_id": None, "elements": entry_elements or [], "margins": entry_margins})
            continue
        try:
            tuid = UUID(tid) if isinstance(tid, str) else tid
        except (ValueError, TypeError):
            pages.append({"template_id": None, "elements": [], "margins": entry_margins})
            continue
        template = db.query(DocumentTemplate).filter(DocumentTemplate.id == tuid).first()
        if not template:
            pages.append({"template_id": str(tuid), "elements": [], "margins": entry_margins})
            continue
        try:
            elements = _clone_route(entry_elements, f"p{idx}") if entry_elements else []
        except Exception:
            elements = _clone_elements_with_new_ids(entry_elements, f"p{idx}") if entry_elements else []
        pages.append({"template_id": str(tuid), "margins": entry_margins, "elements": elements})

    now = datetime.now(timezone.utc)
    token_values = _project_token_values(None, db, when=now, employee_user_id=subject_user_id)
    for page in pages:
        _substitute_project_tokens(page.get("elements", []), token_values)

    type_signer_roles = getattr(doc_type, "signer_roles", None)
    if type_signer_roles:
        signer_roles = ensure_document_signer_roles(type_signer_roles, pages)
    else:
        signer_roles = ensure_document_signer_roles(None, pages) or default_signer_roles()

    doc_title = unique_title_in_scope(
        db,
        build_scoped_document_title(
            db,
            document_type_id=type_id,
            pages=pages,
            project_id=None,
            subject_user_id=subject_user_id,
        ),
        project_id=None,
        subject_user_id=subject_user_id,
    )

    doc = UserDocument(
        title=doc_title,
        document_type_id=type_id,
        project_id=None,
        subject_user_id=subject_user_id,
        pages=pages,
        signer_roles=signer_roles,
        created_by=requested_by.id,
        created_at=now,
        updated_at=now,
    )
    db.add(doc)
    db.flush()

    roles_catalog = ensure_document_signer_roles(getattr(doc, "signer_roles", None), doc.pages)
    labels = role_label_map(roles_catalog)
    peek = build_signature_template_payload(doc.pages or [])
    peek_fields = peek.get("fields") or []
    if not peek_fields:
        raise ValueError("document type has no signature fields")

    present = set(roles_present_in_template(peek))
    required_roles = order_role_ids_present(roles_catalog, present)
    if not required_roles:
        raise ValueError("no signer roles on document type")

    assignments = _build_hire_assignments(
        required_roles,
        subject_user_id=subject_user_id,
        requested_by_id=requested_by.id,
        roles_catalog=roles_catalog,
    )
    if not assignments:
        raise ValueError("could not build role assignments")

    link_standalone_doc_to_employee_subject(doc, subject_user_id)

    try:
        pdf_bytes = build_pdf_bytes(db, doc, canvas_width_px=910)
    except Exception as e:
        raise ValueError(f"PDF generation failed: {e}") from e

    raw = build_signature_template_payload(doc.pages or [])
    for f in raw.get("fields") or []:
        if isinstance(f, dict):
            f["assignee"] = normalize_document_assignee(f.get("assignee"))
    normalized = validate_and_normalize_template(raw, pdf_bytes)
    for f in normalized.get("fields") or []:
        if isinstance(f, dict):
            f["assignee"] = normalize_document_assignee(f.get("assignee"))

    _create_signature_request(
        db,
        requested_by,
        doc=doc,
        pdf_bytes=pdf_bytes,
        normalized=normalized,
        required_roles=required_roles,
        assignments=assignments,
        labels=labels,
        signing_deadline_days=7,
        block_hub_access=False,
        message_to_signers=None,
    )


def fire_invite_additional_documents(
    db: Session,
    *,
    subject_user_id: UUID,
    requested_by_id: Optional[UUID] = None,
) -> None:
    """
    Create signature requests for invite additional documents (idempotent per profile).

    Claims ``invite_additional_documents_applied_at`` early so concurrent hooks cannot
    double-create Document Builder contracts. Items are still processed on later calls
    with per-item dedupe so a mid-loop failure (e.g. additional base doc never committed)
    can recover. ``onboarding_base`` work is committed explicitly — contracts commit
    inside ``_create_signature_request``.
    """
    ep = (
        db.query(EmployeeProfile)
        .filter(EmployeeProfile.user_id == subject_user_id)
        .with_for_update()
        .first()
    )
    if not ep:
        return

    already_claimed = bool(getattr(ep, "invite_additional_documents_applied_at", None))
    if not already_claimed:
        # Claim before creating signature requests. _create_signature_request commits
        # mid-flight; without an early claim, a second hook can still see applied_at=NULL.
        ep.invite_additional_documents_applied_at = datetime.now(timezone.utc)
        try:
            db.commit()
        except Exception:
            db.rollback()
            logger.exception(
                "invite_additional_documents_claim_failed subject=%s",
                str(subject_user_id),
            )
            return

    raw = getattr(ep, "invite_additional_documents", None)
    items: List[Any] = raw if isinstance(raw, list) else []
    if not items:
        return

    inviter_id = requested_by_id or getattr(ep, "invited_by_user_id", None)
    requested_by = None
    if inviter_id:
        requested_by = db.query(User).filter(User.id == inviter_id).first()
    if not requested_by:
        logger.warning(
            "invite_additional_documents_no_inviter subject=%s",
            str(subject_user_id),
        )

    errors: List[dict] = []
    for entry in items:
        if not isinstance(entry, dict):
            continue
        source = str(entry.get("source") or "").strip().lower()
        rid = str(entry.get("id") or "").strip()
        name = str(entry.get("name") or "").strip() or rid
        if not source or not rid:
            continue
        try:
            uid = UUID(rid)
        except Exception:
            errors.append({"source": source, "id": rid, "error": "invalid id"})
            continue
        try:
            if source == "document_type":
                if not requested_by:
                    errors.append({"source": source, "id": rid, "name": name, "error": "no inviter"})
                    continue
                _send_document_type(
                    db,
                    type_id=uid,
                    subject_user_id=subject_user_id,
                    requested_by=requested_by,
                )
            elif source == "onboarding_base":
                _send_onboarding_base(
                    db,
                    base_document_id=uid,
                    subject_user_id=subject_user_id,
                )
                # Contracts commit inside _create_signature_request; base docs must commit here
                # or they are rolled back when the request session closes.
                try:
                    db.commit()
                except Exception:
                    db.rollback()
                    raise
            else:
                logger.warning(
                    "invite_additional_document_skipped_unsupported_source source=%s id=%s doc=%s",
                    source,
                    rid,
                    name,
                )
                errors.append({"source": source, "id": rid, "name": name, "error": "unsupported source"})
        except Exception as exc:
            logger.warning(
                "invite_additional_document_failed source=%s id=%s doc=%s error=%s",
                source,
                rid,
                name,
                str(exc),
            )
            errors.append({"source": source, "id": rid, "name": name, "error": str(exc)[:500]})

    if errors:
        logger.warning(
            "invite_additional_documents_partial_errors subject=%s count=%s already_claimed=%s",
            str(subject_user_id),
            len(errors),
            already_claimed,
        )