from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..auth.security import require_permissions
from ..db import get_db
from ..models.models import User
from ..services.vericlock_import import (
    jobs_preview,
    people_preview,
    preview_or_import,
    upsert_job_maps,
    upsert_people_maps,
)

router = APIRouter(prefix="/integrations/vericlock", tags=["vericlock-import"])

_READ = require_permissions("hr:attendance:read", "hr:attendance:write")
_WRITE = require_permissions("hr:attendance:write")


@router.post("/preview")
def preview_vericlock_csv(
    payload: dict,
    db: Session = Depends(get_db),
    user: User = Depends(_READ),
):
    csv_text = payload.get("csv_text")
    if not isinstance(csv_text, str) or not csv_text.strip():
        raise HTTPException(status_code=400, detail="csv_text is required")
    hours_only_date = (payload.get("hours_only_date") or "").strip() or None
    allow_unmatched = bool(payload.get("allow_unmatched_jobs"))
    overwrite_existing = bool(payload.get("overwrite_existing"))
    people = people_preview(db, csv_text)
    jobs = jobs_preview(db, csv_text)
    plan = preview_or_import(
        db,
        csv_text,
        commit=False,
        user_id=user.id,
        hours_only_date=hours_only_date,
        allow_unmatched_jobs=allow_unmatched,
        overwrite_existing=overwrite_existing,
    )
    return {**people, **jobs, "plan": plan}


@router.put("/people-map")
def save_vericlock_people_map(
    payload: dict,
    db: Session = Depends(get_db),
    user: User = Depends(_WRITE),
):
    items = payload.get("maps")
    if not isinstance(items, list):
        raise HTTPException(status_code=400, detail="maps must be a list")
    saved = upsert_people_maps(db, items, user.id)
    return {"saved": saved}


@router.put("/job-map")
def save_vericlock_job_map(
    payload: dict,
    db: Session = Depends(get_db),
    user: User = Depends(_WRITE),
):
    items = payload.get("maps")
    if not isinstance(items, list):
        raise HTTPException(status_code=400, detail="maps must be a list")
    saved = upsert_job_maps(db, items, user.id)
    return {"saved": saved}


@router.post("/import")
def import_vericlock_csv(
    payload: dict,
    db: Session = Depends(get_db),
    user: User = Depends(_WRITE),
):
    csv_text = payload.get("csv_text")
    if not isinstance(csv_text, str) or not csv_text.strip():
        raise HTTPException(status_code=400, detail="csv_text is required")
    items = payload.get("maps")
    if isinstance(items, list) and items:
        upsert_people_maps(db, items, user.id)
    job_items = payload.get("job_maps")
    if isinstance(job_items, list) and job_items:
        upsert_job_maps(db, job_items, user.id)
    hours_only_date = (payload.get("hours_only_date") or "").strip() or None
    allow_unmatched = bool(payload.get("allow_unmatched_jobs"))
    overwrite_existing = bool(payload.get("overwrite_existing"))
    people = people_preview(db, csv_text)
    needs = people["counts"]["needs_match"]
    if needs:
        raise HTTPException(
            status_code=400,
            detail=f"{needs} VeriClock employee(s) still need a Hub match or Skip",
        )
    jobs = jobs_preview(db, csv_text)
    job_needs = jobs["job_counts"]["needs_match"]
    if job_needs and not allow_unmatched:
        raise HTTPException(
            status_code=400,
            detail=f"{job_needs} VeriClock job(s) still need a Hub match or Skip",
        )
    return preview_or_import(
        db,
        csv_text,
        commit=True,
        user_id=user.id,
        hours_only_date=hours_only_date,
        allow_unmatched_jobs=allow_unmatched,
        overwrite_existing=overwrite_existing,
    )
