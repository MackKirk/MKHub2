"""Project warranties API routes."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Body
from sqlalchemy.orm import Session

from ..auth.security import (
    get_current_user,
    require_permissions,
    expand_project_permission_aliases,
    _has_permission,
    _user_is_admin,
    _has_project_feature_permission,
    has_project_files_category_permission,
)
from ..db import get_db
from ..models.models import (
    ClientFile,
    EmployeeProfile,
    FileObject,
    Project,
    ProjectWarranty,
    User,
    WarrantyActivityLog,
    WarrantyClaim,
    WarrantyMaintenance,
)
from ..services.audit import create_audit_log, compute_diff
from ..services.warranty import (
    WARRANTY_FILE_CATEGORY,
    apply_warranty_status_transitions,
    build_warranty_summary,
    calculate_next_maintenance_date,
    claim_to_dict,
    count_open_claims_for_warranty,
    generate_claim_number,
    validate_claim_payload,
    validate_warranty_payload,
    warranty_document_to_dict,
    warranty_to_dict,
)
from ..services.warranty_activity import log_warranty_activity

router = APIRouter(tags=["project-warranties"])


def _assert_awarded_project_for_warranties(p: Project) -> None:
    if getattr(p, "is_bidding", False):
        raise HTTPException(
            status_code=403,
            detail="Warranties are only available for awarded projects",
        )


def _get_project(db: Session, project_id: str) -> Project:
    p = db.query(Project).filter(Project.id == project_id, Project.deleted_at.is_(None)).first()
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")
    return p


def _assert_project_line_read(user: User, proj: Project) -> None:
    from ..routes.projects import _assert_project_line_read as _plr

    _plr(user, proj)


def _assert_project_line_write(user: User, proj: Project) -> None:
    from ..routes.projects import _assert_project_line_write as _plw

    _plw(user, proj)


def _user_display_name(db: Session, user_id: Optional[uuid.UUID]) -> Optional[str]:
    if not user_id:
        return None
    row = (
        db.query(User, EmployeeProfile)
        .outerjoin(EmployeeProfile, EmployeeProfile.user_id == User.id)
        .filter(User.id == user_id)
        .first()
    )
    if not row:
        return None
    u, ep = row
    if ep:
        name = f"{ep.first_name or ''} {ep.last_name or ''}".strip()
        if name:
            return name
    return u.username


def _can_view_warranty_costs(user: User, proj: Project) -> bool:
    if _user_is_admin(user):
        return True
    line = getattr(proj, "business_line", None)
    if _has_project_feature_permission(user, line, "warranties", "write"):
        return True
    keys = list(expand_project_permission_aliases("business:projects:warranties:costs:read"))
    return any(_has_permission(user, k) for k in keys)


def _get_warranty(db: Session, project_id: str, warranty_id: str) -> ProjectWarranty:
    try:
        wid = uuid.UUID(str(warranty_id))
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid warranty id")
    row = (
        db.query(ProjectWarranty)
        .filter(ProjectWarranty.id == wid, ProjectWarranty.project_id == project_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Warranty not found")
    return row


def _get_claim(db: Session, project_id: str, claim_id: str) -> WarrantyClaim:
    try:
        cid = uuid.UUID(str(claim_id))
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid claim id")
    row = (
        db.query(WarrantyClaim)
        .filter(WarrantyClaim.id == cid, WarrantyClaim.project_id == project_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Claim not found")
    return row


@router.get("/{project_id}/warranties/summary")
def get_warranties_summary(
    project_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _=Depends(require_permissions("business:projects:warranties:read")),
):
    proj = _get_project(db, project_id)
    _assert_project_line_read(user, proj)
    _assert_awarded_project_for_warranties(proj)
    return build_warranty_summary(db, proj.id)


@router.get("/{project_id}/warranties")
def list_warranties(
    project_id: str,
    status: Optional[str] = None,
    warranty_type: Optional[str] = None,
    provider_type: Optional[str] = None,
    internal_responsible_user_id: Optional[str] = None,
    expiration_from: Optional[str] = None,
    expiration_to: Optional[str] = None,
    maintenance_from: Optional[str] = None,
    maintenance_to: Optional[str] = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _=Depends(require_permissions("business:projects:warranties:read")),
):
    proj = _get_project(db, project_id)
    _assert_project_line_read(user, proj)
    _assert_awarded_project_for_warranties(proj)

    q = db.query(ProjectWarranty).filter(
        ProjectWarranty.project_id == project_id,
        ProjectWarranty.cancelled_at.is_(None),
    )
    if status:
        q = q.filter(ProjectWarranty.status == status.strip().lower())
    if warranty_type:
        q = q.filter(ProjectWarranty.warranty_type == warranty_type.strip().lower())
    if provider_type:
        q = q.filter(ProjectWarranty.provider_type == provider_type.strip().lower())
    if internal_responsible_user_id:
        q = q.filter(ProjectWarranty.internal_responsible_user_id == internal_responsible_user_id)
    if expiration_from:
        q = q.filter(ProjectWarranty.end_date >= expiration_from)
    if expiration_to:
        q = q.filter(ProjectWarranty.end_date <= expiration_to)
    if maintenance_from:
        q = q.filter(ProjectWarranty.next_maintenance_due_date >= maintenance_from)
    if maintenance_to:
        q = q.filter(ProjectWarranty.next_maintenance_due_date <= maintenance_to)

    rows = q.order_by(ProjectWarranty.created_at.desc()).all()
    for w in rows:
        apply_warranty_status_transitions(w)
    db.commit()

    return [
        warranty_to_dict(w, count_open_claims_for_warranty(db, w.id))
        for w in rows
    ]


@router.post("/{project_id}/warranties")
def create_warranty(
    project_id: str,
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _=Depends(require_permissions("business:projects:warranties:write")),
):
    proj = _get_project(db, project_id)
    _assert_project_line_write(user, proj)
    _assert_awarded_project_for_warranties(proj)

    validated = validate_warranty_payload(db, proj, payload)
    name = validated.get("name") or (payload.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Warranty name is required")

    row = ProjectWarranty(
        project_id=proj.id,
        name=name,
        warranty_type=validated.get("warranty_type") or payload.get("warranty_type") or "workmanship",
        provider_type=validated.get("provider_type") or payload.get("provider_type") or "other",
        status=validated.get("status") or payload.get("status") or "draft",
        created_by=user.id,
    )
    for k, v in validated.items():
        if k != "name" and hasattr(row, k):
            setattr(row, k, v)
    db.add(row)
    db.flush()

    log_warranty_activity(
        db,
        project_id=proj.id,
        warranty_id=row.id,
        action="warranty_created",
        created_by=user.id,
        details={"name": row.name, "status": row.status},
    )
    try:
        create_audit_log(
            db=db,
            entity_type="project_warranty",
            entity_id=str(row.id),
            action="CREATE",
            actor_id=str(user.id),
            changes_json={"name": row.name, "status": row.status},
            context={"project_id": project_id},
        )
    except Exception:
        pass
    db.commit()
    return warranty_to_dict(row, 0)


@router.get("/{project_id}/warranties/{warranty_id}")
def get_warranty(
    project_id: str,
    warranty_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _=Depends(require_permissions("business:projects:warranties:read")),
):
    proj = _get_project(db, project_id)
    _assert_project_line_read(user, proj)
    _assert_awarded_project_for_warranties(proj)
    row = _get_warranty(db, project_id, warranty_id)
    apply_warranty_status_transitions(row)
    db.commit()
    return warranty_to_dict(row, count_open_claims_for_warranty(db, row.id))


@router.patch("/{project_id}/warranties/{warranty_id}")
def update_warranty(
    project_id: str,
    warranty_id: str,
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _=Depends(require_permissions("business:projects:warranties:write")),
):
    proj = _get_project(db, project_id)
    _assert_project_line_write(user, proj)
    _assert_awarded_project_for_warranties(proj)
    row = _get_warranty(db, project_id, warranty_id)

    before = warranty_to_dict(row, 0)
    validated = validate_warranty_payload(db, proj, payload, existing=row)
    old_status = row.status
    for k, v in validated.items():
        if hasattr(row, k):
            setattr(row, k, v)
    row.updated_at = datetime.now(timezone.utc)
    row.updated_by = user.id
    apply_warranty_status_transitions(row)

    if old_status != row.status:
        log_warranty_activity(
            db,
            project_id=proj.id,
            warranty_id=row.id,
            action="status_changed",
            created_by=user.id,
            details={"old_status": old_status, "new_status": row.status},
        )

    log_warranty_activity(
        db,
        project_id=proj.id,
        warranty_id=row.id,
        action="warranty_updated",
        created_by=user.id,
        details={"fields": list(validated.keys())},
    )
    try:
        after = warranty_to_dict(row, 0)
        diff = compute_diff(before, after)
        if diff:
            create_audit_log(
                db=db,
                entity_type="project_warranty",
                entity_id=str(row.id),
                action="UPDATE",
                actor_id=str(user.id),
                changes_json=diff,
                context={"project_id": project_id},
            )
    except Exception:
        pass
    db.commit()
    return warranty_to_dict(row, count_open_claims_for_warranty(db, row.id))


@router.post("/{project_id}/warranties/{warranty_id}/void")
def void_warranty(
    project_id: str,
    warranty_id: str,
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _=Depends(require_permissions("business:projects:warranties:write")),
):
    payload = dict(payload)
    payload["status"] = "voided"
    return update_warranty(project_id, warranty_id, payload, db, user)


@router.post("/{project_id}/warranties/{warranty_id}/cancel")
def cancel_warranty(
    project_id: str,
    warranty_id: str,
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _=Depends(require_permissions("business:projects:warranties:write")),
):
    payload = dict(payload)
    payload["status"] = "cancelled"
    return update_warranty(project_id, warranty_id, payload, db, user)


@router.post("/{project_id}/warranties/{warranty_id}/maintenance/complete")
def complete_warranty_maintenance(
    project_id: str,
    warranty_id: str,
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _=Depends(require_permissions("business:projects:warranties:write")),
):
    proj = _get_project(db, project_id)
    _assert_project_line_write(user, proj)
    _assert_awarded_project_for_warranties(proj)
    row = _get_warranty(db, project_id, warranty_id)

    if not row.maintenance_required:
        raise HTTPException(status_code=400, detail="Maintenance is not required for this warranty")

    completed_at = payload.get("completed_at")
    if completed_at:
        try:
            completed_dt = datetime.fromisoformat(str(completed_at).replace("Z", "+00:00"))
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid completed_at")
    else:
        completed_dt = datetime.now(timezone.utc)

    completed_date = completed_dt.date()
    next_due = calculate_next_maintenance_date(
        completed_date,
        row.maintenance_frequency,
        row.maintenance_interval_value,
        row.maintenance_interval_unit,
    )

    maint = WarrantyMaintenance(
        warranty_id=row.id,
        project_id=proj.id,
        completed_at=completed_dt,
        completed_by=user.id,
        notes=(payload.get("notes") or "").strip() or None,
        next_due_date_snapshot=next_due,
        created_by=user.id,
    )
    db.add(maint)

    row.last_maintenance_completed_at = completed_dt
    row.last_maintenance_completed_by = user.id
    row.next_maintenance_due_date = next_due
    row.updated_at = datetime.now(timezone.utc)
    row.updated_by = user.id

    log_warranty_activity(
        db,
        project_id=proj.id,
        warranty_id=row.id,
        action="maintenance_completed",
        created_by=user.id,
        details={"completed_at": completed_dt.isoformat(), "next_due_date": next_due.isoformat() if next_due else None},
    )
    db.commit()
    return {
        "warranty": warranty_to_dict(row, count_open_claims_for_warranty(db, row.id)),
        "maintenance_id": str(maint.id),
    }


@router.get("/{project_id}/warranties/{warranty_id}/maintenance-history")
def list_maintenance_history(
    project_id: str,
    warranty_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _=Depends(require_permissions("business:projects:warranties:read")),
):
    proj = _get_project(db, project_id)
    _assert_project_line_read(user, proj)
    _assert_awarded_project_for_warranties(proj)
    _get_warranty(db, project_id, warranty_id)

    rows = (
        db.query(WarrantyMaintenance)
        .filter(WarrantyMaintenance.warranty_id == warranty_id)
        .order_by(WarrantyMaintenance.completed_at.desc())
        .all()
    )
    return [
        {
            "id": str(r.id),
            "completed_at": r.completed_at.isoformat() if r.completed_at else None,
            "completed_by": str(r.completed_by) if r.completed_by else None,
            "completed_by_display": _user_display_name(db, r.completed_by),
            "notes": r.notes,
            "next_due_date_snapshot": r.next_due_date_snapshot.isoformat() if r.next_due_date_snapshot else None,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]


@router.get("/{project_id}/warranties/{warranty_id}/documents")
def list_warranty_documents(
    project_id: str,
    warranty_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _=Depends(require_permissions("business:projects:warranties:read")),
):
    proj = _get_project(db, project_id)
    _assert_project_line_read(user, proj)
    _assert_awarded_project_for_warranties(proj)
    _get_warranty(db, project_id, warranty_id)

    files = (
        db.query(ClientFile)
        .join(FileObject, FileObject.id == ClientFile.file_object_id)
        .filter(
            ClientFile.client_id == proj.client_id,
            ClientFile.category == WARRANTY_FILE_CATEGORY,
            ClientFile.related_warranty_id == warranty_id,
            ClientFile.deleted_at.is_(None),
            FileObject.project_id == project_id,
        )
        .order_by(ClientFile.uploaded_at.desc())
        .all()
    )
    return [warranty_document_to_dict(db, f) for f in files]


@router.post("/{project_id}/warranties/{warranty_id}/documents")
def attach_warranty_document(
    project_id: str,
    warranty_id: str,
    file_object_id: str = Query(...),
    original_name: Optional[str] = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _=Depends(require_permissions("business:projects:warranties:write")),
):
    proj = _get_project(db, project_id)
    _assert_project_line_write(user, proj)
    _assert_awarded_project_for_warranties(proj)
    warranty = _get_warranty(db, project_id, warranty_id)

    if not has_project_files_category_permission(user, WARRANTY_FILE_CATEGORY, action="write", project=proj):
        raise HTTPException(status_code=403, detail="Forbidden")

    fo = db.query(FileObject).filter(FileObject.id == file_object_id).first()
    if not fo:
        raise HTTPException(status_code=404, detail="File not found")
    fo.project_id = proj.id

    cf = ClientFile(
        client_id=proj.client_id,
        file_object_id=fo.id,
        category=WARRANTY_FILE_CATEGORY,
        key=fo.key,
        original_name=original_name,
        uploaded_by=user.id,
        related_warranty_id=warranty.id,
    )
    db.add(cf)
    db.flush()

    log_warranty_activity(
        db,
        project_id=proj.id,
        warranty_id=warranty.id,
        action="document_uploaded",
        created_by=user.id,
        details={"file_name": original_name or fo.key, "client_file_id": str(cf.id)},
    )
    db.commit()
    return warranty_document_to_dict(db, cf)


@router.get("/{project_id}/warranty-claims")
def list_warranty_claims(
    project_id: str,
    status: Optional[str] = None,
    coverage_decision: Optional[str] = None,
    severity: Optional[str] = None,
    assigned_user_id: Optional[str] = None,
    warranty_id: Optional[str] = None,
    reported_from: Optional[str] = None,
    reported_to: Optional[str] = None,
    follow_up_from: Optional[str] = None,
    follow_up_to: Optional[str] = None,
    open_only: bool = False,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _=Depends(require_permissions("business:projects:warranties:read")),
):
    proj = _get_project(db, project_id)
    _assert_project_line_read(user, proj)
    _assert_awarded_project_for_warranties(proj)
    include_costs = _can_view_warranty_costs(user, proj)

    q = db.query(WarrantyClaim).filter(
        WarrantyClaim.project_id == project_id,
        WarrantyClaim.cancelled_at.is_(None),
    )
    if status:
        q = q.filter(WarrantyClaim.status == status.strip().lower())
    if coverage_decision:
        q = q.filter(WarrantyClaim.coverage_decision == coverage_decision.strip().lower())
    if severity:
        q = q.filter(WarrantyClaim.severity == severity.strip().lower())
    if assigned_user_id:
        q = q.filter(WarrantyClaim.assigned_user_id == assigned_user_id)
    if warranty_id:
        q = q.filter(WarrantyClaim.warranty_id == warranty_id)
    if reported_from:
        q = q.filter(WarrantyClaim.reported_date >= reported_from)
    if reported_to:
        q = q.filter(WarrantyClaim.reported_date <= reported_to)
    if follow_up_from:
        q = q.filter(WarrantyClaim.follow_up_date >= follow_up_from)
    if follow_up_to:
        q = q.filter(WarrantyClaim.follow_up_date <= follow_up_to)
    if open_only:
        q = q.filter(WarrantyClaim.status.in_(["reported", "under_review", "site_visit_required", "scheduled", "in_progress"]))

    rows = q.order_by(WarrantyClaim.reported_date.desc()).all()
    return [claim_to_dict(c, include_costs=include_costs) for c in rows]


@router.post("/{project_id}/warranty-claims")
def create_warranty_claim(
    project_id: str,
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _=Depends(require_permissions("business:projects:warranties:write")),
):
    proj = _get_project(db, project_id)
    _assert_project_line_write(user, proj)
    _assert_awarded_project_for_warranties(proj)

    validated = validate_claim_payload(payload)
    warranty_id = validated.get("warranty_id") or payload.get("warranty_id")
    if warranty_id:
        _get_warranty(db, project_id, str(warranty_id))

    from datetime import date as date_cls

    reported = validated.get("reported_date") or _today_from_payload(payload.get("reported_date")) or date_cls.today()

    row = WarrantyClaim(
        project_id=proj.id,
        warranty_id=warranty_id,
        claim_number=generate_claim_number(db, proj.id),
        reported_date=reported,
        description=validated.get("description") or payload.get("description"),
        severity=validated.get("severity") or payload.get("severity") or "medium",
        status=validated.get("status") or payload.get("status") or "reported",
        created_by=user.id,
    )
    for k, v in validated.items():
        if hasattr(row, k) and k not in ("description",):
            setattr(row, k, v)
    if not row.reported_by_user_id:
        row.reported_by_user_id = user.id

    db.add(row)
    db.flush()

    log_warranty_activity(
        db,
        project_id=proj.id,
        warranty_id=row.warranty_id,
        claim_id=row.id,
        action="claim_created",
        created_by=user.id,
        details={"claim_number": row.claim_number, "severity": row.severity},
    )

    if row.severity == "emergency":
        from ..services.notifications import create_notification

        if proj.project_admin_id:
            create_notification(
                db,
                str(proj.project_admin_id),
                "push",
                "warranty_claim_emergency",
                payload_json={"claim_number": row.claim_number, "project_id": project_id},
            )

    db.commit()
    include_costs = _can_view_warranty_costs(user, proj)
    return claim_to_dict(row, include_costs=include_costs)


def _today_from_payload(val):
    from ..services.warranty import _as_date

    return _as_date(val)


@router.get("/{project_id}/warranty-claims/{claim_id}")
def get_warranty_claim(
    project_id: str,
    claim_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _=Depends(require_permissions("business:projects:warranties:read")),
):
    proj = _get_project(db, project_id)
    _assert_project_line_read(user, proj)
    _assert_awarded_project_for_warranties(proj)
    row = _get_claim(db, project_id, claim_id)
    return claim_to_dict(row, include_costs=_can_view_warranty_costs(user, proj))


@router.patch("/{project_id}/warranty-claims/{claim_id}")
def update_warranty_claim(
    project_id: str,
    claim_id: str,
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _=Depends(require_permissions("business:projects:warranties:write")),
):
    proj = _get_project(db, project_id)
    _assert_project_line_write(user, proj)
    _assert_awarded_project_for_warranties(proj)
    row = _get_claim(db, project_id, claim_id)
    if row.cancelled_at:
        raise HTTPException(status_code=400, detail="Cannot update a cancelled claim")

    include_costs = _can_view_warranty_costs(user, proj)
    before = claim_to_dict(row, include_costs=include_costs)
    validated = validate_claim_payload(payload, existing=row)

    if "warranty_id" in validated and validated["warranty_id"]:
        _get_warranty(db, project_id, str(validated["warranty_id"]))

    old_status = row.status
    old_coverage = row.coverage_decision

    cost_fields = {
        "labour_cost",
        "material_cost",
        "subcontractor_cost",
        "other_cost",
        "total_internal_cost",
        "amount_charged_to_customer",
        "recoverable_amount",
        "cost_responsibility",
    }
    for k, v in validated.items():
        if k in cost_fields and not include_costs:
            continue
        if hasattr(row, k):
            setattr(row, k, v)

    if validated.get("coverage_decision") and validated["coverage_decision"] != "pending_assessment":
        if not row.decision_made_by_user_id:
            row.decision_made_by_user_id = user.id

    row.updated_at = datetime.now(timezone.utc)
    row.updated_by = user.id

    if old_status != row.status:
        log_warranty_activity(
            db,
            project_id=proj.id,
            warranty_id=row.warranty_id,
            claim_id=row.id,
            action="claim_status_changed",
            created_by=user.id,
            details={"old_status": old_status, "new_status": row.status},
        )
    if old_coverage != row.coverage_decision:
        log_warranty_activity(
            db,
            project_id=proj.id,
            warranty_id=row.warranty_id,
            claim_id=row.id,
            action="coverage_decision_changed",
            created_by=user.id,
            details={"old_decision": old_coverage, "new_decision": row.coverage_decision},
        )
    if any(k in validated for k in cost_fields):
        log_warranty_activity(
            db,
            project_id=proj.id,
            warranty_id=row.warranty_id,
            claim_id=row.id,
            action="costs_updated",
            created_by=user.id,
        )

    if row.status == "resolved":
        log_warranty_activity(
            db,
            project_id=proj.id,
            warranty_id=row.warranty_id,
            claim_id=row.id,
            action="claim_resolved",
            created_by=user.id,
        )

    db.commit()
    return claim_to_dict(row, include_costs=include_costs)


@router.post("/{project_id}/warranty-claims/{claim_id}/cancel")
def cancel_warranty_claim(
    project_id: str,
    claim_id: str,
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _=Depends(require_permissions("business:projects:warranties:write")),
):
    proj = _get_project(db, project_id)
    _assert_project_line_write(user, proj)
    row = _get_claim(db, project_id, claim_id)
    reason = (payload.get("cancelled_reason") or payload.get("reason") or "").strip()
    if not reason:
        raise HTTPException(status_code=400, detail="Cancellation reason is required")
    row.cancelled_at = datetime.now(timezone.utc)
    row.cancelled_reason = reason
    row.cancelled_by = user.id
    row.status = "closed"
    row.updated_at = datetime.now(timezone.utc)
    row.updated_by = user.id
    log_warranty_activity(
        db,
        project_id=proj.id,
        warranty_id=row.warranty_id,
        claim_id=row.id,
        action="claim_closed",
        created_by=user.id,
        details={"reason": reason},
    )
    db.commit()
    return claim_to_dict(row, include_costs=_can_view_warranty_costs(user, proj))


@router.get("/{project_id}/warranty-activities")
def list_warranty_activities(
    project_id: str,
    limit: int = Query(100, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _=Depends(require_permissions("business:projects:warranties:read")),
):
    proj = _get_project(db, project_id)
    _assert_project_line_read(user, proj)
    _assert_awarded_project_for_warranties(proj)

    rows = (
        db.query(WarrantyActivityLog)
        .filter(WarrantyActivityLog.project_id == project_id)
        .order_by(WarrantyActivityLog.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return [
        {
            "id": str(r.id),
            "action": r.action,
            "details": r.details or {},
            "warranty_id": str(r.warranty_id) if r.warranty_id else None,
            "claim_id": str(r.claim_id) if r.claim_id else None,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "created_by": str(r.created_by) if r.created_by else None,
            "created_by_display": _user_display_name(db, r.created_by),
        }
        for r in rows
    ]
