from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, extract
from typing import List, Optional

from ..db import get_db
from ..models.models import Project, ClientFile, FileObject, ProjectUpdate, ProjectReport, ProjectTimeEntry, ProjectTimeEntryLog, User, EmployeeProfile, Client, ClientSite, ClientFolder
from ..auth.security import get_current_user, require_permissions, can_approve_timesheet


router = APIRouter(prefix="/projects", tags=["projects"])


@router.post("")
def create_project(payload: dict, db: Session = Depends(get_db)):
    # Minimal validation: require client_id
    if not payload.get("client_id"):
        raise HTTPException(status_code=400, detail="client_id is required")
    
    # Generate code if not provided
    if not payload.get("code"):
        # Generate a unique code based on client_id and project count
        client_id = payload.get("client_id")
        try:
            import uuid as _uuid
            u = _uuid.UUID(str(client_id))
            base = int.from_bytes(u.bytes[:2], byteorder='big') % 10000
        except Exception:
            base = 0
        
        # Count existing projects for this client
        project_count = db.query(Project).filter(Project.client_id == client_id).count()
        seq = project_count + 1
        
        # Generate code: base-seq (e.g., 1234-001)
        code = f"{base:04d}-{seq:03d}"
        
        # Ensure uniqueness by checking if code already exists
        counter = 1
        while db.query(Project).filter(Project.code == code).first():
            code = f"{base:04d}-{seq:03d}-{counter}"
            counter += 1
        
        payload["code"] = code
    
    proj = Project(**payload)
    db.add(proj)
    db.commit()
    # Auto-create a folder for this project under the site's folder if available, else under client root
    try:
        name = (proj.name or str(proj.id) or "project").strip()
        if name:
            parent_id = None
            if getattr(proj, 'site_id', None):
                # find site folder by site name/address
                site = db.query(ClientSite).filter(ClientSite.id == proj.site_id).first()
                if site:
                    sname = (getattr(site,'site_name', None) or getattr(site,'site_address_line1', None) or str(site.id)).strip()
                    parent = db.query(ClientFolder).filter(ClientFolder.client_id == proj.client_id, ClientFolder.name == sname, ClientFolder.parent_id == None).first()
                    if parent:
                        parent_id = parent.id
            exists = db.query(ClientFolder).filter(ClientFolder.client_id == proj.client_id, ClientFolder.name == name, ClientFolder.parent_id == parent_id).first()
            if not exists:
                f = ClientFolder(client_id=proj.client_id, name=name, parent_id=parent_id)
                db.add(f)
                db.commit()
    except Exception:
        db.rollback()
    return {"id": str(proj.id)}


@router.get("")
def list_projects(client: Optional[str] = None, site: Optional[str] = None, status: Optional[str] = None, q: Optional[str] = None, year: Optional[int] = None, db: Session = Depends(get_db)):
    query = db.query(Project)
    if client:
        query = query.filter(Project.client_id == client)
    if site:
        # site link via custom field if present later; for now stored in slug or notes? Keeping placeholder
        pass
    if status:
        query = query.filter(Project.status_id == status)
    if q:
        query = query.filter(Project.name.ilike(f"%{q}%"))
    if year:
        from sqlalchemy import extract
        query = query.filter(extract('year', Project.created_at) == int(year))
    return [
        {
            "id": str(p.id),
            "code": p.code,
            "name": p.name,
            "slug": p.slug,
            "client_id": str(p.client_id) if getattr(p, 'client_id', None) else None,
            "created_at": p.created_at.isoformat() if getattr(p, 'created_at', None) else None,
            "date_start": p.date_start.isoformat() if getattr(p, 'date_start', None) else None,
            "date_end": p.date_end.isoformat() if getattr(p, 'date_end', None) else None,
            "progress": getattr(p, 'progress', None),
            "status_label": getattr(p, 'status_label', None),
            "division_ids": getattr(p, 'division_ids', None),
        }
        for p in query.order_by(Project.created_at.desc()).limit(100).all()
    ]


@router.get("/{project_id}")
def get_project(project_id: str, db: Session = Depends(get_db)):
    p = db.query(Project).filter(Project.id == project_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Not found")
    client = db.query(Client).filter(Client.id == p.client_id).first() if getattr(p,'client_id',None) else None
    site = db.query(ClientSite).filter(ClientSite.id == getattr(p,'site_id',None)).first() if getattr(p,'site_id',None) else None
    return {
        "id": str(p.id),
        "code": p.code,
        "name": p.name,
        "slug": p.slug,
        "client_id": str(p.client_id) if p.client_id else None,
        "client_display_name": getattr(client,'display_name', None) or getattr(client,'name', None),
        "address_city": getattr(p, 'address_city', None),
        "address_province": getattr(p, 'address_province', None),
        "address_country": getattr(p, 'address_country', None),
        "description": getattr(p, 'description', None),
        "status_id": getattr(p, 'status_id', None),
        "division_id": getattr(p, 'division_id', None),
        "status_label": getattr(p, 'status_label', None),
        "division_ids": getattr(p, 'division_ids', None),
        "site_id": str(getattr(p,'site_id', None)) if getattr(p,'site_id', None) else None,
        "site_name": getattr(site, 'site_name', None),
        "site_address_line1": getattr(site, 'site_address_line1', None),
        "site_city": getattr(site, 'site_city', None),
        "site_province": getattr(site, 'site_province', None),
        "site_country": getattr(site, 'site_country', None),
        "estimator_id": getattr(p, 'estimator_id', None),
        "onsite_lead_id": getattr(p, 'onsite_lead_id', None),
        "date_start": p.date_start.isoformat() if getattr(p, 'date_start', None) else None,
        "date_eta": getattr(p, 'date_eta', None).isoformat() if getattr(p, 'date_eta', None) else None,
        "date_end": p.date_end.isoformat() if getattr(p, 'date_end', None) else None,
        "progress": getattr(p, 'progress', None),
        "cost_estimated": getattr(p, 'cost_estimated', None),
        "cost_actual": getattr(p, 'cost_actual', None),
        "service_value": getattr(p, 'service_value', None),
        "created_at": p.created_at.isoformat() if getattr(p, 'created_at', None) else None,
    }


@router.patch("/{project_id}")
def update_project(project_id: str, payload: dict, db: Session = Depends(get_db)):
    p = db.query(Project).filter(Project.id == project_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Not found")
    for k, v in payload.items():
        setattr(p, k, v)
    db.commit()
    return {"status": "ok"}


@router.delete("/{project_id}")
def delete_project(project_id: str, db: Session = Depends(get_db)):
    p = db.query(Project).filter(Project.id == project_id).first()
    if not p:
        return {"status": "ok"}
    db.delete(p)
    db.commit()
    return {"status": "ok"}


# ---- Files scoped to Project ----
@router.get("/{project_id}/files")
def list_project_files(project_id: str, db: Session = Depends(get_db)):
    proj = db.query(Project).filter(Project.id == project_id).first()
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")
    cfiles = db.query(ClientFile).filter(ClientFile.client_id == proj.client_id).order_by(ClientFile.uploaded_at.desc()).all()
    out = []
    for cf in cfiles:
        fo = db.query(FileObject).filter(FileObject.id == cf.file_object_id).first()
        if not fo:
            continue
        if str(getattr(fo, 'project_id', '') or '') != str(project_id):
            continue
        ct = getattr(fo, 'content_type', None)
        name = cf.original_name or cf.key or ''
        ext = (name.rsplit('.', 1)[-1] if '.' in name else '').lower()
        is_img_ext = ext in { 'png','jpg','jpeg','webp','gif','bmp','heic','heif' }
        is_image = (ct or '').startswith('image/') or is_img_ext
        out.append({
            "id": str(cf.id),
            "file_object_id": str(cf.file_object_id),
            "category": cf.category,
            "key": cf.key,
            "original_name": cf.original_name,
            "uploaded_at": cf.uploaded_at.isoformat() if cf.uploaded_at else None,
            "content_type": ct,
            "is_image": is_image,
        })
    return out


@router.post("/{project_id}/files")
def attach_project_file(project_id: str, file_object_id: str, category: Optional[str] = None, original_name: Optional[str] = None, db: Session = Depends(get_db)):
    proj = db.query(Project).filter(Project.id == project_id).first()
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")
    fo = db.query(FileObject).filter(FileObject.id == file_object_id).first()
    if not fo:
        raise HTTPException(status_code=404, detail="File not found")
    # Stamp project_id on FileObject to enable filtering
    fo.project_id = proj.id
    row = ClientFile(client_id=proj.client_id, site_id=None, file_object_id=fo.id, category=category, key=fo.key, original_name=original_name)
    db.add(row)
    db.commit()
    return {"id": str(row.id)}


# ---- Updates ----
@router.get("/{project_id}/updates")
def list_project_updates(project_id: str, db: Session = Depends(get_db)):
    rows = db.query(ProjectUpdate).filter(ProjectUpdate.project_id == project_id).order_by(ProjectUpdate.timestamp.desc()).all()
    return [
        {
            "id": str(u.id),
            "timestamp": u.timestamp.isoformat() if u.timestamp else None,
            "text": u.text,
            "images": u.images or {},
        }
        for u in rows
    ]


@router.post("/{project_id}/updates")
def create_project_update(project_id: str, payload: dict, db: Session = Depends(get_db)):
    text = payload.get("text")
    images = payload.get("images")
    category = payload.get("category")
    meta = images if isinstance(images, dict) else {}
    if category:
        meta = {**meta, "category": category}
    row = ProjectUpdate(project_id=project_id, text=text, images=meta)
    db.add(row)
    db.commit()
    db.refresh(row)
    return {"id": str(row.id)}


@router.delete("/{project_id}/updates/{update_id}")
def delete_project_update(project_id: str, update_id: str, db: Session = Depends(get_db)):
    row = db.query(ProjectUpdate).filter(ProjectUpdate.id == update_id, ProjectUpdate.project_id == project_id).first()
    if not row:
        return {"status": "ok"}
    db.delete(row)
    db.commit()
    return {"status": "ok"}


# ---- Reports ----
@router.get("/{project_id}/reports")
def list_project_reports(project_id: str, db: Session = Depends(get_db)):
    rows = db.query(ProjectReport).filter(ProjectReport.project_id == project_id).order_by(ProjectReport.timestamp.desc() if hasattr(ProjectReport, 'timestamp') else ProjectReport.id.desc()).all()
    out = []
    for r in rows:
        out.append({
            "id": str(r.id),
            "category_id": getattr(r, 'category_id', None),
            "division_id": getattr(r, 'division_id', None),
            "description": getattr(r, 'description', None),
            "images": getattr(r, 'images', None),
            "status": getattr(r, 'status', None),
            "created_at": getattr(r, 'created_at', None).isoformat() if getattr(r, 'created_at', None) else None,
            "created_by": str(getattr(r, 'created_by', None)) if getattr(r, 'created_by', None) else None,
        })
    return out


@router.post("/{project_id}/reports")
def create_project_report(project_id: str, payload: dict, db: Session = Depends(get_db), user=Depends(get_current_user)):
    row = ProjectReport(
        project_id=project_id,
        category_id=payload.get("category_id"),
        division_id=payload.get("division_id"),
        description=payload.get("description"),
        images=payload.get("images"),
        status=payload.get("status"),
        created_by=user.id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return {"id": str(row.id)}


@router.delete("/{project_id}/reports/{report_id}")
def delete_project_report(project_id: str, report_id: str, db: Session = Depends(get_db)):
    row = db.query(ProjectReport).filter(ProjectReport.id == report_id, ProjectReport.project_id == project_id).first()
    if not row:
        return {"status": "ok"}
    db.delete(row)
    db.commit()
    return {"status": "ok"}


# ---- Timesheets ----
@router.get("/{project_id}/timesheet")
def list_timesheet(project_id: str, month: Optional[str] = None, user_id: Optional[str] = None, db: Session = Depends(get_db), _=Depends(require_permissions("timesheet:read"))):
    # join with users and employee_profiles for display
    q = db.query(ProjectTimeEntry, User, EmployeeProfile).join(User, User.id == ProjectTimeEntry.user_id).outerjoin(EmployeeProfile, EmployeeProfile.user_id == User.id).filter(ProjectTimeEntry.project_id == project_id)
    if month:
        try:
            from datetime import datetime
            dt = datetime.strptime(month+"-01", "%Y-%m-%d").date()
            y = dt.year; m = dt.month
            from sqlalchemy import extract
            q = q.filter(extract('year', ProjectTimeEntry.work_date) == y, extract('month', ProjectTimeEntry.work_date) == m)
        except Exception:
            pass
    if user_id:
        q = q.filter(ProjectTimeEntry.user_id == user_id)
    rows = q.order_by(ProjectTimeEntry.work_date.asc(), ProjectTimeEntry.start_time.asc()).all()
    out = []
    for r,u,ep in rows:
        out.append({
            "id": str(r.id),
            "project_id": str(r.project_id),
            "user_id": str(r.user_id),
            "user_name": (getattr(ep,'preferred_name',None) or ((' '.join([getattr(ep,'first_name',None) or '', getattr(ep,'last_name',None) or '']).strip()) if ep else '') or u.username),
            "user_avatar_file_id": str(getattr(ep,'profile_photo_file_id')) if (ep and getattr(ep,'profile_photo_file_id', None)) else None,
            "work_date": r.work_date.isoformat(),
            "start_time": getattr(r,'start_time', None).isoformat() if getattr(r,'start_time', None) else None,
            "end_time": getattr(r,'end_time', None).isoformat() if getattr(r,'end_time', None) else None,
            "minutes": r.minutes,
            "notes": r.notes,
            "created_at": r.created_at.isoformat() if getattr(r,'created_at', None) else None,
            "is_approved": bool(getattr(r,'is_approved', False)),
            "approved_at": getattr(r,'approved_at', None).isoformat() if getattr(r,'approved_at', None) else None,
            "approved_by": str(getattr(r,'approved_by', None)) if getattr(r,'approved_by', None) else None,
        })
    return out


@router.post("/{project_id}/timesheet")
def create_time_entry(project_id: str, payload: dict, db: Session = Depends(get_db), user=Depends(get_current_user), _=Depends(require_permissions("timesheet:write"))):
    from datetime import datetime as _dt
    work_date = payload.get("work_date")
    minutes = int(payload.get("minutes") or 0)
    notes = payload.get("notes")
    start_time = payload.get("start_time")
    end_time = payload.get("end_time")
    target_user_id = payload.get("user_id") or str(user.id)
    if not work_date:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="work_date required")
    try:
        d = _dt.strptime(work_date, "%Y-%m-%d").date()
    except Exception:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="invalid date")
    from datetime import time as _time
    st = None; et = None
    try:
        if start_time: st = _time.fromisoformat(start_time)
    except Exception:
        st = None
    try:
        if end_time: et = _time.fromisoformat(end_time)
    except Exception:
        et = None
    # allow admins to create entries on behalf of others (timesheet:write already enforced)
    try:
        from uuid import UUID as _UUID
        target_uuid = _UUID(str(target_user_id))
    except Exception:
        target_uuid = user.id
    row = ProjectTimeEntry(project_id=project_id, user_id=target_uuid, work_date=d, start_time=st, end_time=et, minutes=minutes, notes=notes, created_by=user.id)
    db.add(row)
    db.commit()
    db.refresh(row)
    # log
    log = ProjectTimeEntryLog(entry_id=row.id, project_id=row.project_id, user_id=user.id, action="create", changes={"minutes": row.minutes, "work_date": row.work_date.isoformat(), "notes": row.notes or None, "start_time": start_time, "end_time": end_time})
    db.add(log)
    db.commit()
    return {"id": str(row.id)}


@router.patch("/{project_id}/timesheet/{entry_id}")
def update_time_entry(project_id: str, entry_id: str, payload: dict, db: Session = Depends(get_db), user=Depends(get_current_user), _=Depends(require_permissions("timesheet:write"))):
    row = db.query(ProjectTimeEntry).filter(ProjectTimeEntry.id == entry_id, ProjectTimeEntry.project_id == project_id).first()
    if not row:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Not found")
    before = {"work_date": row.work_date.isoformat(), "minutes": row.minutes, "notes": row.notes, "start_time": getattr(row,'start_time', None).isoformat() if getattr(row,'start_time', None) else None, "end_time": getattr(row,'end_time', None).isoformat() if getattr(row,'end_time', None) else None, "is_approved": bool(getattr(row,'is_approved', False))}
    work_date = payload.get("work_date")
    minutes = payload.get("minutes")
    notes = payload.get("notes")
    start_time = payload.get("start_time")
    end_time = payload.get("end_time")
    if work_date is not None:
        try:
            from datetime import datetime as _dt
            row.work_date = _dt.strptime(str(work_date), "%Y-%m-%d").date()
        except Exception:
            pass
    if minutes is not None:
        try:
            row.minutes = int(minutes)
        except Exception:
            pass
    if notes is not None:
        row.notes = notes
    if start_time is not None:
        try:
            from datetime import time as _time
            row.start_time = _time.fromisoformat(str(start_time)) if start_time else None
        except Exception:
            pass
    if end_time is not None:
        try:
            from datetime import time as _time
            row.end_time = _time.fromisoformat(str(end_time)) if end_time else None
        except Exception:
            pass
    db.commit()
    after = {"work_date": row.work_date.isoformat(), "minutes": row.minutes, "notes": row.notes, "start_time": getattr(row,'start_time', None).isoformat() if getattr(row,'start_time', None) else None, "end_time": getattr(row,'end_time', None).isoformat() if getattr(row,'end_time', None) else None, "is_approved": bool(getattr(row,'is_approved', False))}
    db.add(ProjectTimeEntryLog(entry_id=row.id, project_id=row.project_id, user_id=user.id, action="update", changes={"before": before, "after": after}))
    db.commit()
    return {"status":"ok"}


@router.delete("/{project_id}/timesheet/{entry_id}")
def delete_time_entry(project_id: str, entry_id: str, db: Session = Depends(get_db), user=Depends(get_current_user), _=Depends(require_permissions("timesheet:write"))):
    row = db.query(ProjectTimeEntry).filter(ProjectTimeEntry.id == entry_id, ProjectTimeEntry.project_id == project_id).first()
    if not row:
        return {"status":"ok"}
    db.add(ProjectTimeEntryLog(entry_id=row.id, project_id=row.project_id, user_id=user.id, action="delete", changes=None))
    db.delete(row)
    db.commit()
    return {"status":"ok"}


@router.get("/{project_id}/timesheet/logs")
def list_time_logs(project_id: str, month: Optional[str] = None, user_id: Optional[str] = None, limit: int = 50, offset: int = 0, db: Session = Depends(get_db), _=Depends(require_permissions("timesheet:read"))):
    q = db.query(ProjectTimeEntryLog, User, EmployeeProfile).outerjoin(User, User.id == ProjectTimeEntryLog.user_id).outerjoin(EmployeeProfile, EmployeeProfile.user_id == User.id).filter(ProjectTimeEntryLog.project_id == project_id)
    if month:
        try:
            from datetime import datetime
            dt = datetime.strptime(month+"-01", "%Y-%m-%d").date()
            y = dt.year; m = dt.month
            from sqlalchemy import extract
            q = q.filter(extract('year', ProjectTimeEntryLog.timestamp) == y, extract('month', ProjectTimeEntryLog.timestamp) == m)
        except Exception:
            pass
    if user_id:
        q = q.filter(ProjectTimeEntryLog.user_id == user_id)
    try:
        limit = max(1, min(200, int(limit)))
    except Exception:
        limit = 50
    try:
        offset = max(0, int(offset))
    except Exception:
        offset = 0
    rows = q.order_by(ProjectTimeEntryLog.timestamp.desc()).offset(offset).limit(limit).all()
    out = []
    for r,u,ep in rows:
        out.append({
            "id": str(r.id),
            "entry_id": str(r.entry_id),
            "action": r.action,
            "timestamp": r.timestamp.isoformat() if r.timestamp else None,
            "user_id": str(getattr(r,'user_id', '') or '') or None,
            "user_name": getattr(u,'username', None),
            "user_avatar_file_id": str(getattr(ep,'profile_photo_file_id')) if (ep and getattr(ep,'profile_photo_file_id', None)) else None,
            "changes": r.changes or None,
        })
    return out


# ---- Timesheet summary (across projects) ----
@router.get("/timesheet/summary")
def timesheet_summary(month: Optional[str] = None, user_id: Optional[str] = None, db: Session = Depends(get_db), _=Depends(require_permissions("timesheet:read"))):
    q = db.query(ProjectTimeEntry.user_id, func.sum(ProjectTimeEntry.minutes).label("minutes"))
    if month:
        try:
            from datetime import datetime
            dt = datetime.strptime(month+"-01", "%Y-%m-%d").date()
            y = dt.year; m = dt.month
            q = q.filter(extract('year', ProjectTimeEntry.work_date) == y, extract('month', ProjectTimeEntry.work_date) == m)
        except Exception:
            pass
    if user_id:
        q = q.filter(ProjectTimeEntry.user_id == user_id)
    rows = q.group_by(ProjectTimeEntry.user_id).all()
    out = []
    for uid, minutes in rows:
        out.append({
            "user_id": str(uid),
            "minutes": int(minutes or 0),
        })
    return out


@router.patch("/{project_id}/timesheet/{entry_id}/approve")
def approve_time_entry(project_id: str, entry_id: str, approved: bool = True, db: Session = Depends(get_db), user=Depends(get_current_user)):
    # Gate: must have timesheet:approve or be in supervisor chain of the entry's user
    row = db.query(ProjectTimeEntry).filter(ProjectTimeEntry.id == entry_id, ProjectTimeEntry.project_id == project_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Not found")
    if not can_approve_timesheet(user, str(row.user_id), db):
        raise HTTPException(status_code=403, detail="Forbidden")
    from datetime import datetime, timezone
    row.is_approved = bool(approved)
    if row.is_approved:
        row.approved_at = datetime.now(timezone.utc)
        row.approved_by = user.id
        action = "approve"
    else:
        row.approved_at = None
        row.approved_by = None
        action = "unapprove"
    db.commit()
    db.add(ProjectTimeEntryLog(entry_id=row.id, project_id=row.project_id, user_id=user.id, action=action, changes=None))
    db.commit()
    return {"status": "ok", "is_approved": row.is_approved}


# ---- Timesheet: list across all projects for a user ----
@router.get("/timesheet/user")
def timesheet_by_user(month: Optional[str] = None, user_id: Optional[str] = None, db: Session = Depends(get_db), _=Depends(require_permissions("timesheet:read"))):
    q = db.query(ProjectTimeEntry, Project).join(Project, Project.id == ProjectTimeEntry.project_id)
    if month:
        try:
            from datetime import datetime
            dt = datetime.strptime(month+"-01", "%Y-%m-%d").date()
            y = dt.year; m = dt.month
            q = q.filter(extract('year', ProjectTimeEntry.work_date) == y, extract('month', ProjectTimeEntry.work_date) == m)
        except Exception:
            pass
    if user_id:
        q = q.filter(ProjectTimeEntry.user_id == user_id)
    rows = q.order_by(ProjectTimeEntry.work_date.asc(), ProjectTimeEntry.start_time.asc()).all()
    out = []
    for r,p in rows:
        out.append({
            "id": str(r.id),
            "project_id": str(r.project_id),
            "project_name": getattr(p,'name', None),
            "project_code": getattr(p,'code', None),
            "user_id": str(r.user_id),
            "work_date": r.work_date.isoformat(),
            "start_time": getattr(r,'start_time', None).isoformat() if getattr(r,'start_time', None) else None,
            "end_time": getattr(r,'end_time', None).isoformat() if getattr(r,'end_time', None) else None,
            "minutes": r.minutes,
            "notes": r.notes,
            "created_at": r.created_at.isoformat() if getattr(r,'created_at', None) else None,
            "is_approved": bool(getattr(r,'is_approved', False)),
        })
    return out

