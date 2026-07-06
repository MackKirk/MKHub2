"""HR Offboarding API."""
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..auth.security import _has_permission, get_current_user
from ..db import get_db
from ..models.models import User
from ..config import settings
from ..schemas.offboarding import (
    OffboardingCancel,
    OffboardingChecklistToggle,
    OffboardingDeactivateAccess,
    OffboardingDraftCreate,
    OffboardingStartCreate,
    OffboardingUpdate,
)
from ..services.offboarding_service import (
    activity_log_rows,
    asset_rows_for_case,
    cancel_case,
    case_to_detail,
    complete_case,
    deactivate_hub_access,
    delete_case,
    eligible_employees,
    list_cases,
    merged_checklist,
    operational_summary_for_user,
    save_draft,
    start_offboarding,
    toggle_checklist_item,
    update_case,
)

router = APIRouter(prefix="/offboarding", tags=["offboarding"])


def _can_read(user: User) -> bool:
    if any(r.name == "admin" for r in user.roles):
        return True
    return _has_permission(user, "hr:offboarding:read") or _has_permission(user, "users:read")


def _can_write(user: User) -> bool:
    if any(r.name == "admin" for r in user.roles):
        return True
    return _has_permission(user, "hr:offboarding:write") or _has_permission(user, "users:write")


def _require_read(user: User = Depends(get_current_user)) -> User:
    if not _can_read(user):
        raise HTTPException(status_code=403, detail="Forbidden")
    return user


def _require_write(user: User = Depends(get_current_user)) -> User:
    if not _can_write(user):
        raise HTTPException(status_code=403, detail="Forbidden")
    return user


def _require_admin(user: User = Depends(get_current_user)) -> User:
    if not any(r.name == "admin" for r in user.roles):
        raise HTTPException(status_code=403, detail="Forbidden")
    return user


@router.get("/meta")
def get_offboarding_meta(_user: User = Depends(_require_read)):
    return {"company_timezone": settings.tz_default}


@router.get("")
def get_offboarding_list(
    q: Optional[str] = None,
    status: Optional[str] = None,
    termination_type: Optional[str] = None,
    division: Optional[str] = None,
    termination_date_from: Optional[str] = None,
    termination_date_to: Optional[str] = None,
    hub_access: Optional[str] = None,
    assets_pending: Optional[bool] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(24, ge=1, le=100),
    sort: str = "created_at",
    sort_dir: str = "desc",
    db: Session = Depends(get_db),
    _user: User = Depends(_require_read),
):
    return list_cases(
        db,
        q=q,
        status=status,
        termination_type=termination_type,
        division=division,
        termination_date_from=termination_date_from,
        termination_date_to=termination_date_to,
        hub_access=hub_access,
        assets_pending=assets_pending,
        page=page,
        limit=limit,
        sort=sort,
        sort_dir=sort_dir,
    )


@router.get("/eligible-employees")
def get_eligible_employees(
    db: Session = Depends(get_db),
    _user: User = Depends(_require_read),
):
    return eligible_employees(db)


@router.post("/draft")
def create_draft(
    payload: OffboardingDraftCreate,
    db: Session = Depends(get_db),
    actor: User = Depends(_require_write),
):
    case = save_draft(db, actor, payload.dict())
    return case_to_detail(db, case, include_notes=True)


@router.post("")
def create_and_start(
    payload: OffboardingStartCreate,
    db: Session = Depends(get_db),
    actor: User = Depends(_require_write),
):
    case = start_offboarding(db, actor, payload.dict())
    return case_to_detail(db, case, include_notes=True)


@router.get("/{case_id}")
def get_case_detail(
    case_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(_require_read),
):
    from ..models.models import OffboardingCase

    case = db.query(OffboardingCase).filter(OffboardingCase.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Offboarding case not found")
    return case_to_detail(db, case, include_notes=_can_write(user))


@router.patch("/{case_id}")
def patch_case(
    case_id: UUID,
    payload: OffboardingUpdate,
    db: Session = Depends(get_db),
    actor: User = Depends(_require_write),
):
    case = update_case(db, actor, case_id, payload.dict(exclude_unset=True))
    return case_to_detail(db, case, include_notes=True)


@router.post("/{case_id}/start")
def promote_draft(
    case_id: UUID,
    payload: OffboardingStartCreate,
    db: Session = Depends(get_db),
    actor: User = Depends(_require_write),
):
    from ..models.models import OffboardingCase

    existing = db.query(OffboardingCase).filter(OffboardingCase.id == case_id).first()
    if not existing:
        raise HTTPException(status_code=404, detail="Offboarding case not found")
    data = payload.dict()
    data["user_id"] = str(existing.user_id)
    case = start_offboarding(db, actor, data, case_id=case_id)
    return case_to_detail(db, case, include_notes=True)


@router.post("/{case_id}/deactivate-access")
def post_deactivate_access(
    case_id: UUID,
    payload: OffboardingDeactivateAccess,
    db: Session = Depends(get_db),
    actor: User = Depends(_require_write),
):
    from ..models.models import OffboardingCase

    case = db.query(OffboardingCase).filter(OffboardingCase.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Offboarding case not found")
    if case.status not in ("in_progress",):
        raise HTTPException(status_code=400, detail="Cannot deactivate access for this case status")
    reason = (payload.reason or "").strip() or "Manual offboarding access revocation"
    deactivate_hub_access(db, case, actor.id, reason)
    db.commit()
    db.refresh(case)
    return case_to_detail(db, case, include_notes=True)


@router.post("/{case_id}/complete")
def post_complete(
    case_id: UUID,
    db: Session = Depends(get_db),
    actor: User = Depends(_require_write),
):
    case = complete_case(db, actor, case_id)
    return case_to_detail(db, case, include_notes=True)


@router.post("/{case_id}/cancel")
def post_cancel(
    case_id: UUID,
    payload: OffboardingCancel,
    db: Session = Depends(get_db),
    actor: User = Depends(_require_write),
):
    case = cancel_case(
        db,
        actor,
        case_id,
        clear_termination_date=payload.clear_termination_date,
        reactivate_hub_access=payload.reactivate_hub_access,
        reason=payload.reason,
    )
    return case_to_detail(db, case, include_notes=True)


@router.delete("/{case_id}")
def delete_offboarding_case(
    case_id: UUID,
    db: Session = Depends(get_db),
    _admin: User = Depends(_require_admin),
):
    delete_case(db, case_id)
    return {"ok": True}


@router.get("/{case_id}/assets")
def get_case_assets(
    case_id: UUID,
    db: Session = Depends(get_db),
    _user: User = Depends(_require_read),
):
    from ..models.models import OffboardingCase

    case = db.query(OffboardingCase).filter(OffboardingCase.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Offboarding case not found")
    return {"items": asset_rows_for_case(db, case_id)}


@router.get("/{case_id}/operational-summary")
def get_operational_summary(
    case_id: UUID,
    db: Session = Depends(get_db),
    _user: User = Depends(_require_read),
):
    from ..models.models import OffboardingCase

    case = db.query(OffboardingCase).filter(OffboardingCase.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Offboarding case not found")
    return operational_summary_for_user(db, case.user_id, case.id)


@router.get("/{case_id}/checklist")
def get_checklist(
    case_id: UUID,
    db: Session = Depends(get_db),
    _user: User = Depends(_require_read),
):
    from ..models.models import OffboardingCase

    case = db.query(OffboardingCase).filter(OffboardingCase.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Offboarding case not found")
    return {"items": merged_checklist(db, case)}


@router.patch("/{case_id}/checklist/{item_key}")
def patch_checklist_item(
    case_id: UUID,
    item_key: str,
    payload: OffboardingChecklistToggle,
    db: Session = Depends(get_db),
    actor: User = Depends(_require_write),
):
    toggle_checklist_item(db, actor, case_id, item_key, payload.completed)
    from ..models.models import OffboardingCase

    case = db.query(OffboardingCase).filter(OffboardingCase.id == case_id).first()
    return {"items": merged_checklist(db, case)}


@router.get("/{case_id}/activity-log")
def get_activity_log(
    case_id: UUID,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    _user: User = Depends(_require_read),
):
    from ..models.models import OffboardingCase

    case = db.query(OffboardingCase).filter(OffboardingCase.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Offboarding case not found")
    return activity_log_rows(db, case_id, page=page, limit=limit)
