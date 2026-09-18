"""Helpers for invite hire basics (Phase 1): validation and profile copy."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, List, Optional, Tuple

from ..schemas.auth import InviteRequest


def _opt_str(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    s = str(value).strip()
    return s or None


def resolve_invite_org_and_title(req: InviteRequest) -> Tuple[List[str], List[str], str]:
    """
    Resolve required org fields and job title for an invite.

    Returns (division_ids, project_division_ids, job_title).
    Raises ValueError with a human-readable message when validation fails.
    """
    division_ids_list: Optional[List[str]] = None
    if req.division_ids and len(req.division_ids) > 0:
        division_ids_list = [str(x) for x in req.division_ids if str(x).strip()]
    elif req.division_id and str(req.division_id).strip():
        division_ids_list = [str(req.division_id).strip()]

    project_division_ids = [
        str(x).strip() for x in (req.project_division_ids or []) if str(x).strip()
    ]

    job_title = _opt_str(req.job_title) or ""

    errors: List[str] = []
    if not job_title:
        errors.append("job_title is required")
    if not division_ids_list:
        errors.append("At least one department (division_ids) is required")
    if not project_division_ids:
        errors.append("At least one project division (project_division_ids) is required")
    if errors:
        raise ValueError("; ".join(errors))

    return division_ids_list, project_division_ids, job_title


def invite_display_name(req: InviteRequest) -> str:
    first = _opt_str(req.first_name) or ""
    last = _opt_str(req.last_name) or ""
    full = f"{first} {last}".strip()
    if full:
        return full
    email = (req.email_personal or "").strip()
    return email or "new hire"


def parse_invite_date(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    raw = str(value).strip()
    if not raw:
        return None
    for fmt in ("%Y-%m-%d", "%Y%m%d", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M:%S%z"):
        try:
            dt = datetime.strptime(raw, fmt)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt
        except Exception:
            continue
    return None


def apply_invite_fields_to_profile(
    ep: Any,
    inv: Any,
    *,
    payload_first_name: Optional[str] = None,
    payload_last_name: Optional[str] = None,
) -> None:
    """Copy hire fields from Invite onto EmployeeProfile (in-place)."""
    first = _opt_str(payload_first_name) or _opt_str(getattr(inv, "first_name", None))
    last = _opt_str(payload_last_name) or _opt_str(getattr(inv, "last_name", None))
    if first:
        ep.first_name = first
    if last:
        ep.last_name = last

    phone = _opt_str(getattr(inv, "phone", None))
    if phone:
        ep.phone = phone

    job_title = _opt_str(getattr(inv, "job_title", None))
    if job_title:
        ep.job_title = job_title

    hire_raw = getattr(inv, "hire_date", None)
    hire_dt = parse_invite_date(hire_raw if isinstance(hire_raw, str) else None)
    if hire_dt is not None:
        ep.hire_date = hire_dt

    for attr in ("pay_rate", "pay_type", "employment_type", "work_email", "work_phone"):
        val = _opt_str(getattr(inv, attr, None))
        if val:
            setattr(ep, attr, val)

    mgr = _opt_str(getattr(inv, "manager_user_id", None))
    if mgr:
        try:
            ep.manager_user_id = uuid.UUID(mgr)
        except Exception:
            pass

    project_ids = getattr(inv, "project_division_ids", None)
    if isinstance(project_ids, list) and len(project_ids) > 0:
        ep.project_division_ids = [str(x) for x in project_ids if str(x).strip()]

    # Preserve null vs [] vs list for onboarding package semantics
    ep.onboarding_document_ids = getattr(inv, "document_ids", None)

    extra = getattr(inv, "additional_documents", None)
    if isinstance(extra, list):
        ep.invite_additional_documents = extra
    created_by = getattr(inv, "created_by", None)
    if created_by is not None:
        try:
            ep.invited_by_user_id = created_by if isinstance(created_by, uuid.UUID) else uuid.UUID(str(created_by))
        except Exception:
            pass
