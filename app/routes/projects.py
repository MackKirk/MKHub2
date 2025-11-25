from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, defer
from sqlalchemy.exc import ProgrammingError
from sqlalchemy import func, extract
from typing import List, Optional

from ..db import get_db
from ..models.models import Project, ClientFile, FileObject, ProjectUpdate, ProjectReport, ProjectEvent, ProjectTimeEntry, ProjectTimeEntryLog, User, EmployeeProfile, Client, ClientSite, ClientFolder, ClientContact, SettingList, SettingItem, Shift
from datetime import datetime, timezone
from ..auth.security import get_current_user, require_permissions, can_approve_timesheet


router = APIRouter(prefix="/projects", tags=["projects"])


@router.post("")
def create_project(payload: dict, db: Session = Depends(get_db)):
    # Minimal validation: require client_id
    if not payload.get("client_id"):
        raise HTTPException(status_code=400, detail="client_id is required")
    # Always auto-generate project code: MK-<seq>/<slug>-<year>
    # Sequence is a simple global sequence based on current count; ensure uniqueness
    from datetime import datetime as _dt
    raw_name = (payload.get("name") or "project").strip()
    slug = "-".join([s for s in "".join([c if c.isalnum() else " " for c in raw_name]).split() if s]).strip() or "project"
    year = _dt.utcnow().year
    seq = db.query(func.count(Project.id)).scalar() or 0
    seq += 1
    code = f"MK-{seq:06d}/{slug}-{year}"
    while db.query(Project).filter(Project.code == code).first():
        seq += 1
        code = f"MK-{seq:06d}/{slug}-{year}"
    payload["code"] = code
    
    # If site_id is provided, copy lat/lng from site to project for geofencing
    if payload.get("site_id"):
        site = db.query(ClientSite).filter(ClientSite.id == payload["site_id"]).first()
        if site:
            if getattr(site, 'site_lat', None) is not None:
                payload["lat"] = float(site.site_lat)
            if getattr(site, 'site_lng', None) is not None:
                payload["lng"] = float(site.site_lng)
            # Also copy address fields from site if not provided in payload
            if not payload.get("address") and site.site_address_line1:
                payload["address"] = site.site_address_line1
            if not payload.get("address_city") and site.site_city:
                payload["address_city"] = site.site_city
            if not payload.get("address_province") and site.site_province:
                payload["address_province"] = site.site_province
            if not payload.get("address_country") and site.site_country:
                payload["address_country"] = site.site_country
    
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
            # Check if folder already exists for this project
            exists = db.query(ClientFolder).filter(ClientFolder.project_id == proj.id).first()
            if not exists:
                # Also check by name to avoid duplicates
                exists = db.query(ClientFolder).filter(ClientFolder.client_id == proj.client_id, ClientFolder.name == name, ClientFolder.parent_id == parent_id).first()
            if not exists:
                f = ClientFolder(client_id=proj.client_id, name=name, parent_id=parent_id, project_id=proj.id)
                db.add(f)
                db.commit()
                db.refresh(f)
                # Create default subfolders for the project
                try:
                    # Import here to avoid circular dependency
                    from ..routes.clients import create_default_folders_for_parent
                    create_default_folders_for_parent(db, proj.client_id, f.id, proj.id)
                except Exception as e:
                    # If subfolder creation fails, don't fail project creation
                    import logging
                    logging.getLogger(__name__).warning(f"Failed to create default subfolders: {e}")
                    pass
    except Exception:
        db.rollback()
    return {"id": str(proj.id)}


@router.get("")
def list_projects(client: Optional[str] = None, site: Optional[str] = None, status: Optional[str] = None, q: Optional[str] = None, year: Optional[int] = None, is_bidding: Optional[bool] = None, db: Session = Depends(get_db)):
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
    if is_bidding is not None:
        query = query.filter(Project.is_bidding == is_bidding)
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
            "is_bidding": getattr(p, 'is_bidding', False),
        }
        for p in query.order_by(Project.created_at.desc()).limit(100).all()
    ]


@router.get("/{project_id}")
def get_project(project_id: str, db: Session = Depends(get_db)):
    p = db.query(Project).filter(Project.id == project_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Not found")
    client = None
    if getattr(p, 'client_id', None):
        try:
            client = db.query(Client).filter(Client.id == p.client_id).first()
        except ProgrammingError as e:
            error_msg = str(e.orig) if hasattr(e, 'orig') else str(e)
            if 'is_system' in error_msg and 'does not exist' in error_msg:
                db.rollback()
                client = db.query(Client).options(defer(Client.is_system)).filter(Client.id == p.client_id).first()
            else:
                raise
    site = db.query(ClientSite).filter(ClientSite.id == getattr(p,'site_id',None)).first() if getattr(p,'site_id',None) else None
    contact = db.query(ClientContact).filter(ClientContact.id == getattr(p,'contact_id',None)).first() if getattr(p,'contact_id',None) else None
    return {
        "id": str(p.id),
        "code": p.code,
        "name": p.name,
        "slug": p.slug,
        "client_id": str(p.client_id) if p.client_id else None,
        "client_display_name": getattr(client,'display_name', None) or getattr(client,'name', None),
        "address": getattr(p, 'address', None),
        "address_city": getattr(p, 'address_city', None),
        "address_province": getattr(p, 'address_province', None),
        "address_country": getattr(p, 'address_country', None),
        "address_postal_code": getattr(p, 'address_postal_code', None),
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
        "site_postal_code": getattr(site, 'site_postal_code', None),
        "estimator_id": getattr(p, 'estimator_id', None),
        "onsite_lead_id": str(getattr(p, 'onsite_lead_id', None)) if getattr(p, 'onsite_lead_id', None) else None,
        "division_onsite_leads": getattr(p, 'division_onsite_leads', None) or {},
        "contact_id": getattr(p, 'contact_id', None),
        "contact_name": getattr(contact, 'name', None) if contact else None,
        "contact_email": getattr(contact, 'email', None) if contact else None,
        "contact_phone": getattr(contact, 'phone', None) if contact else None,
        "date_start": p.date_start.isoformat() if getattr(p, 'date_start', None) else None,
        "date_eta": getattr(p, 'date_eta', None).isoformat() if getattr(p, 'date_eta', None) else None,
        "date_end": p.date_end.isoformat() if getattr(p, 'date_end', None) else None,
        "progress": getattr(p, 'progress', None),
        "cost_estimated": getattr(p, 'cost_estimated', None),
        "cost_actual": getattr(p, 'cost_actual', None),
        "service_value": getattr(p, 'service_value', None),
        "lat": float(p.lat) if getattr(p, 'lat', None) is not None else None,
        "lng": float(p.lng) if getattr(p, 'lng', None) is not None else None,
        "timezone": getattr(p, 'timezone', None),
        "is_bidding": getattr(p, 'is_bidding', False),
        "created_at": p.created_at.isoformat() if getattr(p, 'created_at', None) else None,
    }


@router.patch("/{project_id}")
def update_project(project_id: str, payload: dict, db: Session = Depends(get_db)):
    p = db.query(Project).filter(Project.id == project_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Not found")
    # Do not allow changing auto-generated code
    if "code" in payload:
        payload.pop("code", None)
    
    # Check if status_label is being updated
    old_status_label = getattr(p, 'status_label', None)
    new_status_label = payload.get("status_label")
    
    # If status is changing, check if we need to update dates
    if new_status_label and new_status_label != old_status_label:
        # Look up the status setting to check its meta
        status_list = db.query(SettingList).filter(SettingList.name == "project_statuses").first()
        if status_list:
            status_item = db.query(SettingItem).filter(
                SettingItem.list_id == status_list.id,
                SettingItem.label == new_status_label
            ).first()
            if status_item and status_item.meta:
                meta = status_item.meta if isinstance(status_item.meta, dict) else {}
                # If this status sets start date and project doesn't have one yet, set it
                if meta.get("sets_start_date") and not getattr(p, 'date_start', None):
                    payload["date_start"] = datetime.now(timezone.utc)
                # If this status sets end date and project doesn't have one yet, set it
                if meta.get("sets_end_date") and not getattr(p, 'date_end', None):
                    payload["date_end"] = datetime.now(timezone.utc)
    
    # Check if coordinates (lat/lng) are being updated
    old_lat = getattr(p, 'lat', None)
    old_lng = getattr(p, 'lng', None)
    new_lat = payload.get('lat')
    new_lng = payload.get('lng')
    
    # Check if coordinates actually changed
    coordinates_changed = False
    if new_lat is not None or new_lng is not None:
        # Convert to float for comparison if they exist
        if new_lat is not None:
            new_lat = float(new_lat)
        if new_lng is not None:
            new_lng = float(new_lng)
        if old_lat is not None:
            old_lat = float(old_lat)
        if old_lng is not None:
            old_lng = float(old_lng)
        
        # Check if coordinates changed (with small tolerance for floating point)
        if (new_lat is not None and old_lat is None) or (new_lat is None and old_lat is not None):
            coordinates_changed = True
        elif new_lat is not None and old_lat is not None:
            if abs(new_lat - old_lat) > 0.0001:  # ~11 meters tolerance
                coordinates_changed = True
        
        if (new_lng is not None and old_lng is None) or (new_lng is None and old_lng is not None):
            coordinates_changed = True
        elif new_lng is not None and old_lng is not None:
            if abs(new_lng - old_lng) > 0.0001:  # ~11 meters tolerance
                coordinates_changed = True
    
    # Check if project name is being updated (to sync folder name)
    old_name = getattr(p, 'name', None)
    new_name = payload.get('name')
    name_changed = new_name is not None and new_name != old_name
    
    # Update project
    for k, v in payload.items():
        setattr(p, k, v)
    db.commit()
    
    # If project name changed, update the associated folder name
    if name_changed and new_name:
        try:
            project_folder = db.query(ClientFolder).filter(ClientFolder.project_id == project_id).first()
            if project_folder:
                project_folder.name = new_name.strip()
                db.commit()
        except Exception:
            # If folder update fails, don't fail the project update
            pass
    
    # If coordinates changed, update shifts to use new coordinates
    if coordinates_changed:
        from ..config import settings
        
        # Get final coordinates (use new values if provided, otherwise keep old ones)
        final_lat = new_lat if new_lat is not None else old_lat
        final_lng = new_lng if new_lng is not None else old_lng
        
        # Only update if we have valid coordinates
        if final_lat is not None and final_lng is not None:
            # Get all shifts for this project
            shifts = db.query(Shift).filter(Shift.project_id == project_id).all()
            
            # Update shifts that don't have custom geofences (geofences is None or empty)
            # Clear their geofences so they use the project coordinates in real-time
            updated_count = 0
            for shift in shifts:
                # If shift has no geofences or empty geofences, clear them to use project coordinates
                if not shift.geofences or len(shift.geofences) == 0:
                    # Shift already uses project coordinates, no need to update
                    continue
                
                # Check if shift's geofences match the old project coordinates (within tolerance)
                # If they do, update them to use new coordinates (or clear them to use project in real-time)
                shift_uses_project_coords = False
                if shift.geofences and len(shift.geofences) > 0:
                    for geofence in shift.geofences:
                        if isinstance(geofence, dict):
                            geofence_lat = geofence.get('lat')
                            geofence_lng = geofence.get('lng')
                            if geofence_lat is not None and geofence_lng is not None:
                                # Check if geofence matches old project coordinates (within tolerance)
                                if old_lat is not None and old_lng is not None:
                                    lat_diff = abs(float(geofence_lat) - float(old_lat))
                                    lng_diff = abs(float(geofence_lng) - float(old_lng))
                                    if lat_diff < 0.0001 and lng_diff < 0.0001:
                                        shift_uses_project_coords = True
                                        break
                
                # If shift's geofences match old project coordinates, clear them to use new project coordinates
                if shift_uses_project_coords:
                    shift.geofences = None  # Clear geofences to use project coordinates in real-time
                    shift.updated_at = datetime.now(timezone.utc)
                    updated_count += 1
            
            if updated_count > 0:
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


@router.put("/{project_id}/files/{file_id}")
def update_project_file(project_id: str, file_id: str, payload: dict, db: Session = Depends(get_db)):
    """Update a project file (e.g., change category)"""
    proj = db.query(Project).filter(Project.id == project_id).first()
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")
    cf = db.query(ClientFile).filter(ClientFile.id == file_id, ClientFile.client_id == proj.client_id).first()
    if not cf:
        raise HTTPException(status_code=404, detail="File not found")
    # Verify file belongs to this project
    fo = db.query(FileObject).filter(FileObject.id == cf.file_object_id).first()
    if not fo or str(getattr(fo, 'project_id', '') or '') != str(project_id):
        raise HTTPException(status_code=404, detail="File not found in project")
    # Update category if provided
    if "category" in payload:
        cf.category = payload["category"]
    if "original_name" in payload:
        cf.original_name = payload["original_name"]
    db.commit()
    return {"id": str(cf.id)}


@router.delete("/{project_id}/files/{file_id}")
def delete_project_file(project_id: str, file_id: str, db: Session = Depends(get_db)):
    """Delete a project file"""
    proj = db.query(Project).filter(Project.id == project_id).first()
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")
    cf = db.query(ClientFile).filter(ClientFile.id == file_id, ClientFile.client_id == proj.client_id).first()
    if not cf:
        raise HTTPException(status_code=404, detail="File not found")
    # Verify file belongs to this project
    fo = db.query(FileObject).filter(FileObject.id == cf.file_object_id).first()
    if not fo or str(getattr(fo, 'project_id', '') or '') != str(project_id):
        raise HTTPException(status_code=404, detail="File not found in project")
    db.delete(cf)
    db.commit()
    return {"status": "ok"}


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
    rows = db.query(ProjectReport).filter(ProjectReport.project_id == project_id).order_by(ProjectReport.created_at.desc() if hasattr(ProjectReport, 'created_at') else ProjectReport.id.desc()).all()
    out = []
    for r in rows:
        out.append({
            "id": str(r.id),
            "title": getattr(r, 'title', None),
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
        title=payload.get("title"),
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


# ---- Events ----
@router.get("/{project_id}/events")
def list_project_events(project_id: str, db: Session = Depends(get_db)):
    rows = db.query(ProjectEvent).filter(ProjectEvent.project_id == project_id).order_by(ProjectEvent.start_datetime.asc()).all()
    return [
        {
            "id": str(e.id),
            "project_id": str(e.project_id),
            "name": e.name,
            "location": e.location,
            "start_datetime": e.start_datetime.isoformat() if e.start_datetime else None,
            "end_datetime": e.end_datetime.isoformat() if e.end_datetime else None,
            "notes": e.notes,
            "is_all_day": getattr(e, 'is_all_day', False),
            "timezone": getattr(e, 'timezone', None),
            "repeat_type": getattr(e, 'repeat_type', None) or "none",
            "repeat_config": getattr(e, 'repeat_config', None),
            "repeat_until": e.repeat_until.isoformat() if getattr(e, 'repeat_until', None) else None,
            "repeat_count": getattr(e, 'repeat_count', None),
            "exceptions": getattr(e, 'exceptions', None) if isinstance(getattr(e, 'exceptions', None), list) else [],
            "extra_dates": getattr(e, 'extra_dates', None) if isinstance(getattr(e, 'extra_dates', None), list) else [],
            "overrides": getattr(e, 'overrides', None) or {},
            "created_at": e.created_at.isoformat() if e.created_at else None,
            "created_by": str(e.created_by) if e.created_by else None,
        }
        for e in rows
    ]


@router.post("/{project_id}/events")
def create_project_event(project_id: str, payload: dict, db: Session = Depends(get_db), user=Depends(get_current_user)):
    # Validate project exists
    proj = db.query(Project).filter(Project.id == project_id).first()
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Validate required fields
    name = payload.get("name")
    if not name:
        raise HTTPException(status_code=400, detail="name is required")
    
    # Parse datetime strings
    start_datetime_str = payload.get("start_datetime")
    end_datetime_str = payload.get("end_datetime")
    
    if not start_datetime_str:
        raise HTTPException(status_code=400, detail="start_datetime is required")
    if not end_datetime_str:
        raise HTTPException(status_code=400, detail="end_datetime is required")
    
    try:
        # Parse ISO format datetime strings
        start_datetime = datetime.fromisoformat(start_datetime_str.replace('Z', '+00:00'))
        end_datetime = datetime.fromisoformat(end_datetime_str.replace('Z', '+00:00'))
        
        # Ensure timezone-aware
        if start_datetime.tzinfo is None:
            start_datetime = start_datetime.replace(tzinfo=timezone.utc)
        if end_datetime.tzinfo is None:
            end_datetime = end_datetime.replace(tzinfo=timezone.utc)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid datetime format: {str(e)}")
    
    # Validate end is after start
    if end_datetime <= start_datetime:
        raise HTTPException(status_code=400, detail="end_datetime must be after start_datetime")
    
    # Handle recurrence fields
    is_all_day = payload.get("is_all_day", False)
    timezone_str = payload.get("timezone", "America/Vancouver")
    repeat_type = payload.get("repeat_type", "none")
    repeat_config = payload.get("repeat_config")
    repeat_until = payload.get("repeat_until")
    repeat_count = payload.get("repeat_count")
    exceptions = payload.get("exceptions", [])
    extra_dates = payload.get("extra_dates", [])
    overrides = payload.get("overrides", {})
    
    # Parse repeat_until if provided
    repeat_until_dt = None
    if repeat_until:
        try:
            repeat_until_dt = datetime.fromisoformat(str(repeat_until).replace('Z', '+00:00'))
            if repeat_until_dt.tzinfo is None:
                repeat_until_dt = repeat_until_dt.replace(tzinfo=timezone.utc)
        except Exception:
            pass
    
    row = ProjectEvent(
        project_id=project_id,
        name=name,
        location=payload.get("location"),
        start_datetime=start_datetime,
        end_datetime=end_datetime,
        notes=payload.get("notes"),
        is_all_day=is_all_day,
        timezone=timezone_str,
        repeat_type=repeat_type if repeat_type != "none" else None,
        repeat_config=repeat_config,
        repeat_until=repeat_until_dt,
        repeat_count=repeat_count,
        exceptions=exceptions if exceptions else None,
        extra_dates=extra_dates if extra_dates else None,
        overrides=overrides if overrides else None,
        created_by=user.id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return {
        "id": str(row.id),
        "project_id": str(row.project_id),
        "name": row.name,
        "location": row.location,
        "start_datetime": row.start_datetime.isoformat() if row.start_datetime else None,
        "end_datetime": row.end_datetime.isoformat() if row.end_datetime else None,
        "notes": row.notes,
        "is_all_day": getattr(row, 'is_all_day', False),
        "timezone": getattr(row, 'timezone', None),
        "repeat_type": getattr(row, 'repeat_type', None) or "none",
        "repeat_config": getattr(row, 'repeat_config', None),
        "repeat_until": row.repeat_until.isoformat() if getattr(row, 'repeat_until', None) else None,
        "repeat_count": getattr(row, 'repeat_count', None),
        "exceptions": getattr(row, 'exceptions', None) if isinstance(getattr(row, 'exceptions', None), list) else [],
        "extra_dates": getattr(row, 'extra_dates', None) if isinstance(getattr(row, 'extra_dates', None), list) else [],
        "overrides": getattr(row, 'overrides', None) or {},
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "created_by": str(row.created_by) if row.created_by else None,
    }


@router.get("/{project_id}/events/{event_id}")
def get_project_event(project_id: str, event_id: str, db: Session = Depends(get_db)):
    row = db.query(ProjectEvent).filter(ProjectEvent.id == event_id, ProjectEvent.project_id == project_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Event not found")
    return {
        "id": str(row.id),
        "project_id": str(row.project_id),
        "name": row.name,
        "location": row.location,
        "start_datetime": row.start_datetime.isoformat() if row.start_datetime else None,
        "end_datetime": row.end_datetime.isoformat() if row.end_datetime else None,
        "notes": row.notes,
        "is_all_day": getattr(row, 'is_all_day', False),
        "timezone": getattr(row, 'timezone', None),
        "repeat_type": getattr(row, 'repeat_type', None) or "none",
        "repeat_config": getattr(row, 'repeat_config', None),
        "repeat_until": row.repeat_until.isoformat() if getattr(row, 'repeat_until', None) else None,
        "repeat_count": getattr(row, 'repeat_count', None),
        "exceptions": getattr(row, 'exceptions', None) if isinstance(getattr(row, 'exceptions', None), list) else [],
        "extra_dates": getattr(row, 'extra_dates', None) if isinstance(getattr(row, 'extra_dates', None), list) else [],
        "overrides": getattr(row, 'overrides', None) or {},
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "created_by": str(row.created_by) if row.created_by else None,
    }


@router.patch("/{project_id}/events/{event_id}")
def update_project_event(project_id: str, event_id: str, payload: dict, db: Session = Depends(get_db), user=Depends(get_current_user)):
    row = db.query(ProjectEvent).filter(ProjectEvent.id == event_id, ProjectEvent.project_id == project_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Event not found")
    
    # Update fields
    if "name" in payload:
        if not payload["name"]:
            raise HTTPException(status_code=400, detail="name cannot be empty")
        row.name = payload["name"]
    
    if "location" in payload:
        row.location = payload["location"]
    
    if "notes" in payload:
        row.notes = payload["notes"]
    
    # Update recurrence fields
    if "is_all_day" in payload:
        row.is_all_day = bool(payload["is_all_day"])
    
    if "timezone" in payload:
        row.timezone = payload["timezone"]
    
    if "repeat_type" in payload:
        row.repeat_type = payload["repeat_type"] if payload["repeat_type"] != "none" else None
    
    if "repeat_config" in payload:
        row.repeat_config = payload["repeat_config"]
    
    if "repeat_until" in payload:
        if payload["repeat_until"]:
            try:
                repeat_until_dt = datetime.fromisoformat(str(payload["repeat_until"]).replace('Z', '+00:00'))
                if repeat_until_dt.tzinfo is None:
                    repeat_until_dt = repeat_until_dt.replace(tzinfo=timezone.utc)
                row.repeat_until = repeat_until_dt
            except Exception:
                pass
        else:
            row.repeat_until = None
    
    if "repeat_count" in payload:
        row.repeat_count = payload["repeat_count"]
    
    if "exceptions" in payload:
        row.exceptions = payload["exceptions"] if payload["exceptions"] else None
    
    if "extra_dates" in payload:
        row.extra_dates = payload["extra_dates"] if payload["extra_dates"] else None
    
    if "overrides" in payload:
        row.overrides = payload["overrides"] if payload["overrides"] else None
    
    # Handle datetime updates
    start_datetime = row.start_datetime
    end_datetime = row.end_datetime
    
    if "start_datetime" in payload:
        try:
            start_datetime_str = payload["start_datetime"]
            start_datetime = datetime.fromisoformat(start_datetime_str.replace('Z', '+00:00'))
            if start_datetime.tzinfo is None:
                start_datetime = start_datetime.replace(tzinfo=timezone.utc)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid start_datetime format: {str(e)}")
    
    if "end_datetime" in payload:
        try:
            end_datetime_str = payload["end_datetime"]
            end_datetime = datetime.fromisoformat(end_datetime_str.replace('Z', '+00:00'))
            if end_datetime.tzinfo is None:
                end_datetime = end_datetime.replace(tzinfo=timezone.utc)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid end_datetime format: {str(e)}")
    
    # Validate end is after start
    if end_datetime <= start_datetime:
        raise HTTPException(status_code=400, detail="end_datetime must be after start_datetime")
    
    row.start_datetime = start_datetime
    row.end_datetime = end_datetime
    
    db.commit()
    db.refresh(row)
    return {
        "id": str(row.id),
        "project_id": str(row.project_id),
        "name": row.name,
        "location": row.location,
        "start_datetime": row.start_datetime.isoformat() if row.start_datetime else None,
        "end_datetime": row.end_datetime.isoformat() if row.end_datetime else None,
        "notes": row.notes,
        "is_all_day": getattr(row, 'is_all_day', False),
        "timezone": getattr(row, 'timezone', None),
        "repeat_type": getattr(row, 'repeat_type', None) or "none",
        "repeat_config": getattr(row, 'repeat_config', None),
        "repeat_until": row.repeat_until.isoformat() if getattr(row, 'repeat_until', None) else None,
        "repeat_count": getattr(row, 'repeat_count', None),
        "exceptions": getattr(row, 'exceptions', None) if isinstance(getattr(row, 'exceptions', None), list) else [],
        "extra_dates": getattr(row, 'extra_dates', None) if isinstance(getattr(row, 'extra_dates', None), list) else [],
        "overrides": getattr(row, 'overrides', None) or {},
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "created_by": str(row.created_by) if row.created_by else None,
    }


@router.delete("/{project_id}/events/{event_id}")
def delete_project_event(project_id: str, event_id: str, db: Session = Depends(get_db)):
    row = db.query(ProjectEvent).filter(ProjectEvent.id == event_id, ProjectEvent.project_id == project_id).first()
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
    
    # Store entry data before deletion for attendance lookup
    entry_user_id = row.user_id
    entry_work_date = row.work_date
    entry_start_time = row.start_time
    entry_end_time = row.end_time
    
    # Log deletion
    db.add(ProjectTimeEntryLog(entry_id=row.id, project_id=row.project_id, user_id=user.id, action="delete", changes=None))
    db.delete(row)
    db.commit()
    
    # Reset related attendance records if this entry was created from attendance
    # Find shifts for this project, user, and date
    from ..models.models import Shift, Attendance
    from ..services.audit import create_audit_log
    from ..services.permissions import is_admin, is_supervisor
    
    shifts = db.query(Shift).filter(
        Shift.project_id == project_id,
        Shift.worker_id == entry_user_id,
        Shift.date == entry_work_date,
        Shift.status == "scheduled"
    ).all()
    
    # Determine user role for audit log
    actor_role = "worker"
    if is_admin(user, db):
        actor_role = "admin"
    elif is_supervisor(user, db):
        actor_role = "supervisor"
    
    # For each shift, find and reset approved attendance records
    for shift in shifts:
        # Find all approved attendance records for this shift
        attendances = db.query(Attendance).filter(
            Attendance.shift_id == shift.id,
            Attendance.status == "approved"
        ).all()
        
        for attendance in attendances:
            # Reset attendance status to pending
            attendance.status = "pending"
            attendance.approved_at = None
            attendance.approved_by = None
            
            # Create audit log
            create_audit_log(
                db=db,
                entity_type="attendance",
                entity_id=str(attendance.id),
                action="RESET",
                actor_id=str(user.id),
                actor_role=actor_role,
                source="api",
                changes_json={"before": {"status": "approved"}, "after": {"status": "pending"}},
                context={
                    "project_id": project_id,
                    "worker_id": str(attendance.worker_id),
                    "shift_id": str(attendance.shift_id),
                    "reason": "Timesheet entry deleted",
                }
            )
    
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


@router.post("/{project_id}/convert-to-project")
def convert_to_project(project_id: str, db: Session = Depends(get_db)):
    """Convert a bidding to an active project"""
    p = db.query(Project).filter(Project.id == project_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Not found")
    if not getattr(p, 'is_bidding', False):
        raise HTTPException(status_code=400, detail="This is already a project, not a bidding")
    p.is_bidding = False
    db.commit()
    return {"status": "ok", "id": str(p.id)}

