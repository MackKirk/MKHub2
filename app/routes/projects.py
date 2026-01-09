from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, defer
from sqlalchemy.exc import ProgrammingError
from sqlalchemy import func, extract
from typing import List, Optional
import uuid

from ..db import get_db
from ..models.models import Project, ClientFile, FileObject, Proposal, ProjectUpdate, ProjectReport, ProjectEvent, ProjectTimeEntry, ProjectTimeEntryLog, User, EmployeeProfile, Client, ClientSite, ClientFolder, ClientContact, SettingList, SettingItem, Shift, AuditLog, Estimate, EstimateItem
from datetime import datetime, timezone, time, timedelta
from ..auth.security import get_current_user, require_permissions, can_approve_timesheet, has_project_files_category_permission
from sqlalchemy import or_, and_, cast, String, Date


router = APIRouter(prefix="/projects", tags=["projects"])


@router.post("")
def create_project(payload: dict, db: Session = Depends(get_db), user=Depends(get_current_user)):
    # Minimal validation: require client_id
    if not payload.get("client_id"):
        raise HTTPException(status_code=400, detail="client_id is required")
    # Always auto-generate project code: MK-<seq>/<client_code>-<year>
    # Format: MK-00001/00001-2025 (prefix seq 5 digits + client code 5 digits + year)
    from datetime import datetime as _dt
    
    # Get client to retrieve its code
    client_id = payload.get("client_id")
    if not client_id:
        raise HTTPException(status_code=400, detail="client_id is required")
    
    try:
        client_uuid = uuid.UUID(str(client_id))
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid client_id format")
    
    client = db.query(Client).filter(Client.id == client_uuid).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    if not client.code:
        raise HTTPException(status_code=400, detail="Client must have a code. Please update the client first.")
    
    client_code = client.code  # Should be 5-digit number (00001, 00002, etc.)
    
    # Debug: Ensure we're using the code, not generating from name
    # If client_code is not a 5-digit number, it means migration didn't work
    if not (client_code.isdigit() and len(client_code) == 5):
        # Log warning but still use the code (for backward compatibility during migration)
        import logging
        logging.warning(f"Client {client.id} has non-numeric code '{client_code}'. Migration may be incomplete.")
    year = _dt.utcnow().year
    
    # Get sequence number (5 digits: 00001, 00002, etc.)
    seq = db.query(func.count(Project.id)).scalar() or 0
    seq += 1
    code = f"MK-{seq:05d}/{client_code}-{year}"
    
    # Ensure uniqueness
    while db.query(Project).filter(Project.code == code).first():
        seq += 1
        code = f"MK-{seq:05d}/{client_code}-{year}"
    
    payload["code"] = code
    
    # If this is an opportunity (is_bidding=True), always set status to "Prospecting"
    if payload.get("is_bidding", False):
        status_list = db.query(SettingList).filter(SettingList.name == "project_statuses").first()
        if status_list:
            prospecting_status = db.query(SettingItem).filter(
                SettingItem.list_id == status_list.id,
                SettingItem.label == "Prospecting"
            ).first()
            if prospecting_status:
                payload["status_id"] = prospecting_status.id
                payload["status_label"] = "Prospecting"
                payload["status_changed_at"] = datetime.now(timezone.utc)
    
    # If status_label is provided in payload, also set status_changed_at
    if payload.get("status_label") and not payload.get("status_changed_at"):
        payload["status_changed_at"] = datetime.now(timezone.utc)
    
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
    
    # Create audit log for project creation
    try:
        from ..services.audit import create_audit_log
        create_audit_log(
            db=db,
            entity_type="project",
            entity_id=str(proj.id),
            action="CREATE",
            actor_id=str(user.id) if user else None,
            actor_role="user",
            source="api",
            changes_json={
                "name": proj.name,
                "code": proj.code,
                "client_id": str(proj.client_id) if proj.client_id else None,
                "is_bidding": getattr(proj, 'is_bidding', False),
                "status_label": getattr(proj, 'status_label', None),
            },
            context={
                "project_id": str(proj.id),
                "client_name": client.company_name if client else None,
            }
        )
    except Exception:
        pass  # Don't fail project creation if audit log fails
    
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
            "date_eta": getattr(p, 'date_eta', None).isoformat() if getattr(p, 'date_eta', None) else None,
            "date_end": p.date_end.isoformat() if getattr(p, 'date_end', None) else None,
            "progress": getattr(p, 'progress', None),
            "status_label": getattr(p, 'status_label', None),
            "status_changed_at": getattr(p, 'status_changed_at', None).isoformat() if getattr(p, 'status_changed_at', None) else None,
            "division_ids": getattr(p, 'division_ids', None),  # Legacy
            "project_division_ids": getattr(p, 'project_division_ids', None),
            "project_division_percentages": getattr(p, 'project_division_percentages', None),
            "is_bidding": getattr(p, 'is_bidding', False),
            "estimator_id": str(getattr(p, 'estimator_id', None)) if getattr(p, 'estimator_id', None) else None,
            "estimator_ids": [str(eid) for eid in (getattr(p, 'estimator_ids', None) or [])] if getattr(p, 'estimator_ids', None) else ([str(getattr(p, 'estimator_id', None))] if getattr(p, 'estimator_id', None) else []),
            "project_admin_id": str(getattr(p, 'project_admin_id', None)) if getattr(p, 'project_admin_id', None) else None,
        }
        for p in query.order_by(Project.created_at.desc()).limit(100).all()
    ]


@router.get("/{project_id}")
def get_project(project_id: str, db: Session = Depends(get_db)):
    # Handle special routes like "new" that shouldn't be treated as UUIDs
    if project_id == "new":
        raise HTTPException(status_code=404, detail="Not found")
    
    # Validate that project_id is a valid UUID format before querying
    try:
        uuid.UUID(str(project_id))
    except ValueError:
        raise HTTPException(status_code=404, detail="Invalid project ID format")
    
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
        "status_changed_at": getattr(p, 'status_changed_at', None).isoformat() if getattr(p, 'status_changed_at', None) else None,
        "division_ids": getattr(p, 'division_ids', None),  # Legacy
        "project_division_ids": getattr(p, 'project_division_ids', None),
        "project_division_percentages": getattr(p, 'project_division_percentages', None),
        "site_id": str(getattr(p,'site_id', None)) if getattr(p,'site_id', None) else None,
        "site_name": getattr(site, 'site_name', None),
        "site_address_line1": getattr(site, 'site_address_line1', None),
        "site_city": getattr(site, 'site_city', None),
        "site_province": getattr(site, 'site_province', None),
        "site_country": getattr(site, 'site_country', None),
        "site_postal_code": getattr(site, 'site_postal_code', None),
        "estimator_id": str(getattr(p, 'estimator_id', None)) if getattr(p, 'estimator_id', None) else None,
        "estimator_ids": [str(eid) for eid in (getattr(p, 'estimator_ids', None) or [])] if getattr(p, 'estimator_ids', None) else ([str(getattr(p, 'estimator_id', None))] if getattr(p, 'estimator_id', None) else []),
        "project_admin_id": str(getattr(p, 'project_admin_id', None)) if getattr(p, 'project_admin_id', None) else None,
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
        "image_file_object_id": str(getattr(p, 'image_file_object_id', None)) if getattr(p, 'image_file_object_id', None) else None,
        "image_manually_set": getattr(p, 'image_manually_set', False),
        "created_at": p.created_at.isoformat() if getattr(p, 'created_at', None) else None,
    }


@router.patch("/{project_id}")
def update_project(project_id: str, payload: dict, db: Session = Depends(get_db), user=Depends(get_current_user)):
    p = db.query(Project).filter(Project.id == project_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Not found")
    
    # Capture before state for audit log
    before_state = {
        "name": getattr(p, 'name', None),
        "status_label": getattr(p, 'status_label', None),
        "estimator_id": str(getattr(p, 'estimator_id', None)) if getattr(p, 'estimator_id', None) else None,
        "project_admin_id": str(getattr(p, 'project_admin_id', None)) if getattr(p, 'project_admin_id', None) else None,
        "onsite_lead_id": str(getattr(p, 'onsite_lead_id', None)) if getattr(p, 'onsite_lead_id', None) else None,
        "division_ids": getattr(p, 'division_ids', None),
        "project_division_ids": getattr(p, 'project_division_ids', None),
        "progress": getattr(p, 'progress', None),
        "date_start": str(getattr(p, 'date_start', None)) if getattr(p, 'date_start', None) else None,
        "date_end": str(getattr(p, 'date_end', None)) if getattr(p, 'date_end', None) else None,
        "address": getattr(p, 'address', None),
        "lat": str(getattr(p, 'lat', None)) if getattr(p, 'lat', None) else None,
        "lng": str(getattr(p, 'lng', None)) if getattr(p, 'lng', None) else None,
    }
    
    # Do not allow changing auto-generated code
    if "code" in payload:
        payload.pop("code", None)
    
    # Check if status_label is being updated
    old_status_label = getattr(p, 'status_label', None)
    new_status_label = payload.get("status_label")
    
    # If status is changing, update status_changed_at timestamp
    if new_status_label and new_status_label != old_status_label:
        payload["status_changed_at"] = datetime.now(timezone.utc)
    
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
    
    # Handle image_file_object_id update: if user is setting it manually, mark as manually set
    if 'image_file_object_id' in payload:
        # If user is explicitly setting the image, mark it as manually set
        # This prevents auto-updates from proposals
        if payload.get('image_file_object_id') is not None:
            payload['image_manually_set'] = True
        else:
            # If clearing the image, also clear the manually_set flag
            payload['image_manually_set'] = False
    
    # Validate project_division_percentages if provided
    if 'project_division_percentages' in payload:
        percentages = payload.get('project_division_percentages')
        if percentages is not None:
            if not isinstance(percentages, dict):
                raise HTTPException(status_code=400, detail="project_division_percentages must be a dictionary")
            # Calculate sum of percentages
            total = sum(float(v) for v in percentages.values() if v is not None)
            # Allow small tolerance for floating point (0.01%)
            if abs(total - 100.0) > 0.01:
                raise HTTPException(status_code=400, detail=f"Division percentages must total exactly 100%. Current total: {total:.2f}%")
    
    # Handle estimator_ids and backward compatibility with estimator_id
    if 'estimator_ids' in payload:
        estimator_ids = payload.get('estimator_ids')
        # If estimator_ids is provided and is a list with at least one element, 
        # also update estimator_id with the first element for backward compatibility
        if isinstance(estimator_ids, list) and len(estimator_ids) > 0:
            # Validate all IDs are valid UUIDs
            try:
                for eid in estimator_ids:
                    if eid:  # Skip None/empty values
                        uuid.UUID(str(eid))
                payload['estimator_id'] = estimator_ids[0]  # Set first as estimator_id for backward compatibility
            except (ValueError, AttributeError):
                raise HTTPException(status_code=400, detail="estimator_ids must contain valid UUIDs")
        elif estimator_ids is None or (isinstance(estimator_ids, list) and len(estimator_ids) == 0):
            # Clear both fields if empty
            payload['estimator_id'] = None
    elif 'estimator_id' in payload and not hasattr(p, 'estimator_ids') or getattr(p, 'estimator_ids', None) is None:
        # If only estimator_id is provided and estimator_ids doesn't exist, migrate it
        estimator_id = payload.get('estimator_id')
        if estimator_id:
            payload['estimator_ids'] = [estimator_id]
        else:
            payload['estimator_ids'] = []
    elif not hasattr(p, 'estimator_ids') or getattr(p, 'estimator_ids', None) is None:
        # If estimator_ids doesn't exist on project but estimator_id does, migrate it
        old_estimator_id = getattr(p, 'estimator_id', None)
        if old_estimator_id:
            payload['estimator_ids'] = [old_estimator_id]
    
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
    
    # Create audit log for project update
    try:
        from ..services.audit import create_audit_log, compute_diff
        after_state = {
            "name": getattr(p, 'name', None),
            "status_label": getattr(p, 'status_label', None),
            "estimator_id": str(getattr(p, 'estimator_id', None)) if getattr(p, 'estimator_id', None) else None,
            "project_admin_id": str(getattr(p, 'project_admin_id', None)) if getattr(p, 'project_admin_id', None) else None,
            "onsite_lead_id": str(getattr(p, 'onsite_lead_id', None)) if getattr(p, 'onsite_lead_id', None) else None,
            "division_ids": getattr(p, 'division_ids', None),
            "project_division_ids": getattr(p, 'project_division_ids', None),
            "progress": getattr(p, 'progress', None),
            "date_start": str(getattr(p, 'date_start', None)) if getattr(p, 'date_start', None) else None,
            "date_end": str(getattr(p, 'date_end', None)) if getattr(p, 'date_end', None) else None,
            "address": getattr(p, 'address', None),
            "lat": str(getattr(p, 'lat', None)) if getattr(p, 'lat', None) else None,
            "lng": str(getattr(p, 'lng', None)) if getattr(p, 'lng', None) else None,
        }
        changes = compute_diff(before_state, after_state)
        if changes:  # Only log if there were actual changes
            create_audit_log(
                db=db,
                entity_type="project",
                entity_id=str(p.id),
                action="UPDATE",
                actor_id=str(user.id) if user else None,
                actor_role="user",
                source="api",
                changes_json={"before": before_state, "after": after_state},
                context={
                    "project_id": str(p.id),
                    "changed_fields": list(changes.keys()),
                }
            )
    except Exception:
        pass  # Don't fail project update if audit log fails
    
    return {"status": "ok"}


@router.delete("/{project_id}")
def delete_project(project_id: str, db: Session = Depends(get_db), user=Depends(get_current_user)):
    p = db.query(Project).filter(Project.id == project_id).first()
    if not p:
        return {"status": "ok"}
    
    # Capture project info before deletion for audit log
    project_info = {
        "name": getattr(p, 'name', None),
        "code": getattr(p, 'code', None),
        "client_id": str(getattr(p, 'client_id', None)) if getattr(p, 'client_id', None) else None,
        "is_bidding": getattr(p, 'is_bidding', False),
        "status_label": getattr(p, 'status_label', None),
    }
    
    # Before deleting the project, remove references from estimate_items that were added via reports
    # Get all reports for this project
    project_reports = db.query(ProjectReport).filter(ProjectReport.project_id == project_id).all()
    report_ids = [r.id for r in project_reports]
    
    if report_ids:
        # Remove references from estimate_items that point to any of these reports
        db.query(EstimateItem).filter(EstimateItem.added_via_report_id.in_(report_ids)).update({
            EstimateItem.added_via_report_id: None,
            EstimateItem.added_via_report_date: None
        }, synchronize_session=False)
    
    db.delete(p)
    db.commit()
    
    # Create audit log for project deletion
    try:
        from ..services.audit import create_audit_log
        create_audit_log(
            db=db,
            entity_type="project",
            entity_id=project_id,
            action="DELETE",
            actor_id=str(user.id) if user else None,
            actor_role="user",
            source="api",
            changes_json={"deleted_project": project_info},
            context={
                "project_id": project_id,
                "project_name": project_info.get("name"),
                "was_bidding": project_info.get("is_bidding"),
            }
        )
    except Exception:
        pass  # Don't fail if audit log fails
    
    return {"status": "ok"}


# ---- Files scoped to Project ----
@router.get("/{project_id}/files")
def list_project_files(
    project_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _=Depends(require_permissions("business:projects:files:read", "business:projects:files:write")),
):
    proj = db.query(Project).filter(Project.id == project_id).first()
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")
    cfiles = db.query(ClientFile).filter(ClientFile.client_id == proj.client_id).order_by(ClientFile.uploaded_at.desc()).all()
    out = []
    for cf in cfiles:
        # Category-level permission filter (default allow-all if config not set)
        if not has_project_files_category_permission(user, getattr(cf, "category", None), action="read"):
            continue
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
def attach_project_file(
    project_id: str,
    file_object_id: str,
    category: Optional[str] = None,
    original_name: Optional[str] = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _=Depends(require_permissions("business:projects:files:write")),
):
    if not has_project_files_category_permission(user, category, action="write"):
        raise HTTPException(status_code=403, detail="Forbidden")
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
    
    # Create audit log for file upload
    try:
        from ..services.audit import create_audit_log
        create_audit_log(
            db=db,
            entity_type="project_file",
            entity_id=str(row.id),
            action="UPLOAD",
            actor_id=str(user.id) if user else None,
            actor_role="user",
            source="api",
            changes_json={
                "file_name": original_name or fo.key,
                "category": category,
                "content_type": getattr(fo, 'content_type', None),
            },
            context={
                "project_id": project_id,
                "file_object_id": str(fo.id),
            }
        )
    except Exception:
        pass
    
    return {"id": str(row.id)}


@router.put("/{project_id}/files/{file_id}")
def update_project_file(
    project_id: str,
    file_id: str,
    payload: dict,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _=Depends(require_permissions("business:projects:files:write")),
):
    """Update a project file (e.g., change category)"""
    proj = db.query(Project).filter(Project.id == project_id).first()
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")
    cf = db.query(ClientFile).filter(ClientFile.id == file_id, ClientFile.client_id == proj.client_id).first()
    if not cf:
        raise HTTPException(status_code=404, detail="File not found")
    # Must have write access to the current category
    if not has_project_files_category_permission(user, getattr(cf, "category", None), action="write"):
        raise HTTPException(status_code=403, detail="Forbidden")
    # Verify file belongs to this project
    fo = db.query(FileObject).filter(FileObject.id == cf.file_object_id).first()
    if not fo or str(getattr(fo, 'project_id', '') or '') != str(project_id):
        raise HTTPException(status_code=404, detail="File not found in project")
    
    # Capture before state for audit log
    before_state = {
        "category": getattr(cf, "category", None),
        "original_name": getattr(cf, "original_name", None),
    }
    
    # Update category if provided
    if "category" in payload:
        # Must have write access to the destination category as well
        if not has_project_files_category_permission(user, payload.get("category"), action="write"):
            raise HTTPException(status_code=403, detail="Forbidden")
        cf.category = payload["category"]
    if "original_name" in payload:
        cf.original_name = payload["original_name"]
    db.commit()
    
    # Create audit log for file update
    try:
        from ..services.audit import create_audit_log, compute_diff
        after_state = {
            "category": getattr(cf, "category", None),
            "original_name": getattr(cf, "original_name", None),
        }
        changes = compute_diff(before_state, after_state)
        if changes:
            create_audit_log(
                db=db,
                entity_type="project_file",
                entity_id=str(cf.id),
                action="UPDATE",
                actor_id=str(user.id) if user else None,
                actor_role="user",
                source="api",
                changes_json={"before": before_state, "after": after_state},
                context={
                    "project_id": project_id,
                    "file_name": getattr(cf, "original_name", None),
                }
            )
    except Exception:
        pass
    
    return {"id": str(cf.id)}


@router.delete("/{project_id}/files/{file_id}")
def delete_project_file(
    project_id: str,
    file_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _=Depends(require_permissions("business:projects:files:write")),
):
    """Delete a project file"""
    proj = db.query(Project).filter(Project.id == project_id).first()
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")
    cf = db.query(ClientFile).filter(ClientFile.id == file_id, ClientFile.client_id == proj.client_id).first()
    if not cf:
        raise HTTPException(status_code=404, detail="File not found")
    if not has_project_files_category_permission(user, getattr(cf, "category", None), action="write"):
        raise HTTPException(status_code=403, detail="Forbidden")
    # Verify file belongs to this project
    fo = db.query(FileObject).filter(FileObject.id == cf.file_object_id).first()
    if not fo or str(getattr(fo, 'project_id', '') or '') != str(project_id):
        raise HTTPException(status_code=404, detail="File not found in project")
    
    # Capture file info before deletion for audit log
    file_info = {
        "file_name": getattr(cf, "original_name", None) or getattr(cf, "key", None),
        "category": getattr(cf, "category", None),
        "content_type": getattr(fo, "content_type", None) if fo else None,
    }
    
    db.delete(cf)
    db.commit()
    
    # Create audit log for file deletion
    try:
        from ..services.audit import create_audit_log
        create_audit_log(
            db=db,
            entity_type="project_file",
            entity_id=file_id,
            action="DELETE",
            actor_id=str(user.id) if user else None,
            actor_role="user",
            source="api",
            changes_json={"deleted_file": file_info},
            context={
                "project_id": project_id,
                "file_name": file_info.get("file_name"),
            }
        )
    except Exception:
        pass
    
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
            "financial_value": getattr(r, 'financial_value', None),
            "financial_type": getattr(r, 'financial_type', None),
            "estimate_data": getattr(r, 'estimate_data', None),
            "approval_status": getattr(r, 'approval_status', None),
            "approved_by": str(getattr(r, 'approved_by', None)) if getattr(r, 'approved_by', None) else None,
            "approved_at": getattr(r, 'approved_at', None).isoformat() if getattr(r, 'approved_at', None) else None,
        })
    return out


@router.post("/{project_id}/reports")
def create_project_report(project_id: str, payload: dict, db: Session = Depends(get_db), user=Depends(get_current_user)):
    financial_type = payload.get("financial_type")
    approval_status = None
    if financial_type == "estimate-changes":
        approval_status = "pending"
    
    row = ProjectReport(
        project_id=project_id,
        title=payload.get("title"),
        category_id=payload.get("category_id"),
        division_id=payload.get("division_id"),
        description=payload.get("description"),
        images=payload.get("images"),
        status=payload.get("status"),
        created_by=user.id,
        financial_value=payload.get("financial_value"),
        financial_type=financial_type,
        estimate_data=payload.get("estimate_data"),
        approval_status=approval_status,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    
    # Create audit log for report creation
    try:
        from ..services.audit import create_audit_log
        create_audit_log(
            db=db,
            entity_type="report",
            entity_id=str(row.id),
            action="CREATE",
            actor_id=str(user.id) if user else None,
            actor_role="user",
            source="api",
            changes_json={
                "title": payload.get("title"),
                "category_id": payload.get("category_id"),
                "division_id": payload.get("division_id"),
                "financial_type": financial_type,
                "financial_value": payload.get("financial_value"),
                "approval_status": approval_status,
            },
            context={
                "project_id": project_id,
                "report_title": payload.get("title"),
            }
        )
    except Exception:
        pass
    
    return {"id": str(row.id)}


@router.delete("/{project_id}/reports/{report_id}")
def delete_project_report(project_id: str, report_id: str, db: Session = Depends(get_db), user=Depends(get_current_user)):
    row = db.query(ProjectReport).filter(ProjectReport.id == report_id, ProjectReport.project_id == project_id).first()
    if not row:
        return {"status": "ok"}
    
    # Capture report info before deletion for audit log
    report_info = {
        "title": getattr(row, 'title', None),
        "category_id": getattr(row, 'category_id', None),
        "division_id": getattr(row, 'division_id', None),
        "financial_type": getattr(row, 'financial_type', None),
        "financial_value": getattr(row, 'financial_value', None),
        "approval_status": getattr(row, 'approval_status', None),
        "created_by": str(getattr(row, 'created_by', None)) if getattr(row, 'created_by', None) else None,
    }

    # If this is an "Estimate Changes" report, deleting the report should also delete the estimate items
    # that were added via this report (instead of detaching them).
    if getattr(row, "financial_type", None) == "estimate-changes":
        import json

        items_to_delete = db.query(EstimateItem).filter(EstimateItem.added_via_report_id == row.id).all()
        deleted_item_ids = [it.id for it in items_to_delete]

        if items_to_delete:
            # Delete the items first
            for it in items_to_delete:
                db.delete(it)
            db.flush()

            # Clean up any saved item_extras for the deleted items and recompute estimate total_cost
            estimate = db.query(Estimate).filter(Estimate.project_id == project_id).first()
            if estimate:
                # Update notes: remove item_extras entries for deleted items
                if estimate.notes:
                    try:
                        ui_state = json.loads(estimate.notes) or {}
                    except Exception:
                        ui_state = {}
                    item_extras = ui_state.get("item_extras") or {}
                    if isinstance(item_extras, dict) and deleted_item_ids:
                        for iid in deleted_item_ids:
                            item_extras.pop(f"item_{iid}", None)
                        ui_state["item_extras"] = item_extras
                        estimate.notes = json.dumps(ui_state) if ui_state else None

                # Recompute total_cost (basic sum; detailed totals are computed in /estimate endpoints using extras)
                remaining = db.query(EstimateItem).filter(EstimateItem.estimate_id == estimate.id).all()
                estimate.total_cost = sum((it.quantity or 0.0) * (it.unit_price or 0.0) for it in remaining)

    else:
        # For non estimate-changes reports, detach any estimate items referencing this report
        # (keeps the items in the estimate, but removes the FK reference).
        db.query(EstimateItem).filter(EstimateItem.added_via_report_id == report_id).update({
            EstimateItem.added_via_report_id: None,
            EstimateItem.added_via_report_date: None
        })

    db.delete(row)
    db.commit()
    
    # Create audit log for report deletion
    try:
        from ..services.audit import create_audit_log
        create_audit_log(
            db=db,
            entity_type="report",
            entity_id=report_id,
            action="DELETE",
            actor_id=str(user.id) if user else None,
            actor_role="user",
            source="api",
            changes_json={"deleted_report": report_info},
            context={
                "project_id": project_id,
                "report_title": report_info.get("title"),
            }
        )
    except Exception:
        pass
    
    return {"status": "ok"}


@router.post("/{project_id}/reports/{report_id}/approve")
def approve_estimate_changes_report(project_id: str, report_id: str, db: Session = Depends(get_db), user=Depends(get_current_user)):
    """Approve an Estimate Changes report and add its items to the project's estimate"""
    from ..models.models import Material
    import json
    
    # Get the report
    report = db.query(ProjectReport).filter(
        ProjectReport.id == report_id,
        ProjectReport.project_id == project_id
    ).first()
    
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    
    # Validate it's an estimate-changes report
    if getattr(report, 'financial_type', None) != "estimate-changes":
        raise HTTPException(status_code=400, detail="This endpoint only applies to Estimate Changes reports")
    
    # Validate it's pending approval
    if getattr(report, 'approval_status', None) != "pending":
        raise HTTPException(status_code=400, detail="Report is not pending approval")
    
    # Get estimate_data
    estimate_data = getattr(report, 'estimate_data', None)
    if not estimate_data:
        raise HTTPException(status_code=400, detail="Report does not contain estimate data")
    
    # Get or create estimate for the project
    estimate = db.query(Estimate).filter(Estimate.project_id == project_id).first()
    if not estimate:
        # Create new estimate
        estimate = Estimate(
            project_id=project_id,
            markup=estimate_data.get('markup', 0.0),
            notes=None,
            created_by=user.id,
        )
        db.add(estimate)
        db.flush()
    
    # Parse existing UI state from estimate notes
    existing_ui_state = {}
    if estimate.notes:
        try:
            existing_ui_state = json.loads(estimate.notes)
        except:
            pass
    
    # Get items from estimate_data
    items = estimate_data.get('items', [])
    if not items:
        raise HTTPException(status_code=400, detail="Estimate data contains no items")
    
    # Get existing sections from the project's estimate to match section names.
    #
    # IMPORTANT: the EstimateBuilder uses unique section keys (e.g. "Product Section 173...") and
    # stores user-facing labels in `section_names` (e.g. "Product Section"). So matching only by raw
    # section key will create duplicates that *look* identical. We therefore match by display name.
    #
    # Also, sections can exist in UI state (`section_order`) even if there are no items yet,
    # so we must consider both `section_order` and existing items.
    def _norm_section_name(name: str) -> str:
        # normalize for comparison: trim and collapse whitespace, case-insensitive
        return " ".join(str(name).split()).strip().lower()

    section_order_existing = existing_ui_state.get('section_order') or []
    section_names_existing = existing_ui_state.get('section_names') or {}
    if not isinstance(section_names_existing, dict):
        section_names_existing = {}

    canonical_section_key_by_display_norm: dict[str, str] = {}
    canonical_section_key_by_key_norm: dict[str, str] = {}

    def _existing_display_for_key(section_key: str) -> str:
        return str(section_names_existing.get(section_key) or section_key)

    # Prefer the exact section key already present in section_order (source of truth for UI sections)
    for section_key in section_order_existing:
        if not section_key:
            continue
        section_key = str(section_key)
        nk = _norm_section_name(section_key)
        if nk:
            canonical_section_key_by_key_norm.setdefault(nk, section_key)
        nd = _norm_section_name(_existing_display_for_key(section_key))
        if nd:
            canonical_section_key_by_display_norm.setdefault(nd, section_key)

    # Also consider sections from existing items (in case notes is missing / older estimates)
    if estimate.id:
        existing_items = db.query(EstimateItem).filter(EstimateItem.estimate_id == estimate.id).all()
        for it in existing_items:
            if not it.section:
                continue
            section_key = str(it.section)
            nk = _norm_section_name(section_key)
            if nk:
                canonical_section_key_by_key_norm.setdefault(nk, section_key)
            # if the section isn't in section_order, treat its key as its display too
            nd = _norm_section_name(section_key)
            if nd:
                canonical_section_key_by_display_norm.setdefault(nd, section_key)
    
    # Add items to estimate
    total = estimate.total_cost or 0.0
    item_extras = existing_ui_state.get('item_extras', {})
    now = datetime.now(timezone.utc)
    
    # Create a mapping of report section keys to canonical existing section keys.
    # We match primarily by the display name (report sectionNames -> "Product Section"),
    # falling back to key matching.
    report_section_names = estimate_data.get('sectionNames') or estimate_data.get('section_names') or {}
    if not isinstance(report_section_names, dict):
        report_section_names = {}

    section_mapping: dict[str, str] = {}
    for report_section_key in {item.get('section', '') for item in items if item.get('section')}:
        if not report_section_key:
            continue
        rkey = str(report_section_key).strip()
        if not rkey:
            continue

        rdisp = str(report_section_names.get(rkey) or rkey)
        mapped = canonical_section_key_by_display_norm.get(_norm_section_name(rdisp))
        if not mapped:
            mapped = canonical_section_key_by_key_norm.get(_norm_section_name(rkey))
        section_mapping[rkey] = mapped or rkey
    
    for item_data in items:
        price = item_data.get('unit_price')
        if price is None and item_data.get('material_id'):
            material = db.query(Material).filter(Material.id == item_data['material_id']).first()
            price = (material.price or 0.0) if material else 0.0
        elif price is None:
            price = 0.0
        
        quantity = item_data.get('quantity', 0.0)
        line_total = quantity * price
        total += line_total
        
        # Map the section key to match an existing section if it exists (see mapping above).
        report_section = str(item_data.get('section') or '').strip()
        mapped_section = section_mapping.get(report_section, report_section) if report_section else item_data.get('section')
        
        estimate_item = EstimateItem(
            estimate_id=estimate.id,
            material_id=item_data.get('material_id'),
            quantity=quantity,
            unit_price=price,
            total_price=line_total,
            section=mapped_section,
            description=item_data.get('description'),
            item_type=item_data.get('item_type', 'product'),
            added_via_report_id=report.id,
            added_via_report_date=now,
        )
        db.add(estimate_item)
        db.flush()
        
        # Store item extras if they exist
        extras = {}
        if 'qty_required' in item_data:
            extras['qty_required'] = item_data['qty_required']
        if 'unit_required' in item_data:
            extras['unit_required'] = item_data['unit_required']
        if 'markup' in item_data:
            extras['markup'] = item_data['markup']
        if 'taxable' in item_data:
            extras['taxable'] = item_data['taxable']
        if 'labour_journey' in item_data:
            extras['labour_journey'] = item_data['labour_journey']
        if 'labour_men' in item_data:
            extras['labour_men'] = item_data['labour_men']
        if 'labour_journey_type' in item_data:
            extras['labour_journey_type'] = item_data['labour_journey_type']
        if 'unit' in item_data:
            extras['unit'] = item_data['unit']
        
        if extras:
            item_extras[f'item_{estimate_item.id}'] = extras
    
    # Update estimate total_cost
    estimate.total_cost = total
    
    # Update estimate notes with item_extras
    if item_extras:
        existing_ui_state['item_extras'] = item_extras
    estimate.notes = json.dumps(existing_ui_state) if existing_ui_state else None
    
    # Update report approval status
    report.approval_status = "approved"
    report.approved_by = user.id
    report.approved_at = now
    
    db.commit()
    db.refresh(estimate)
    
    # Create audit log for report approval
    try:
        from ..services.audit import create_audit_log
        create_audit_log(
            db=db,
            entity_type="report",
            entity_id=str(report.id),
            action="APPROVE",
            actor_id=str(user.id) if user else None,
            actor_role="user",
            source="api",
            changes_json={
                "approval_status": "approved",
                "items_added": len(items),
                "total_value": total,
            },
            context={
                "project_id": project_id,
                "report_title": getattr(report, 'title', None),
                "estimate_id": str(estimate.id),
            }
        )
    except Exception:
        pass
    
    return {"status": "ok", "estimate_id": estimate.id}


@router.get("/{project_id}/financial-totals")
def get_project_financial_totals(project_id: str, db: Session = Depends(get_db)):
    """Get total Additional Income and Additional Expense for a project"""
    reports = db.query(ProjectReport).filter(
        ProjectReport.project_id == project_id,
        ProjectReport.financial_type.in_(["additional-income", "additional-expense"])
    ).all()
    
    additional_income = 0.0
    additional_expense = 0.0
    
    for report in reports:
        financial_value = getattr(report, 'financial_value', None) or 0.0
        financial_type = getattr(report, 'financial_type', None)
        
        if financial_type == "additional-income":
            additional_income += financial_value
        elif financial_type == "additional-expense":
            additional_expense += financial_value
    
    return {
        "additional_income": additional_income,
        "additional_expense": additional_expense
    }


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
def list_timesheet(project_id: str, month: Optional[str] = None, user_id: Optional[str] = None, db: Session = Depends(get_db), _=Depends(require_permissions("business:projects:timesheet:read", "hr:timesheet:read", "timesheet:read"))):
    from ..routes.settings import calculate_break_minutes
    
    # Calculate date range for month filter
    date_start = None
    date_end = None
    if month:
        try:
            from datetime import datetime
            dt = datetime.strptime(month+"-01", "%Y-%m-%d").date()
            y = dt.year; m = dt.month
            from datetime import date as date_type
            from calendar import monthrange
            date_start = date_type(y, m, 1)
            date_end = date_type(y, m, monthrange(y, m)[1])
        except Exception:
            pass
    
    # First, get all attendances for this project through shifts
    # This ensures we use the same data source as the attendance table
    from ..models.models import Shift, Attendance
    from sqlalchemy import and_, or_, func
    
    # Get all shifts for this project
    shifts_query = db.query(Shift).filter(Shift.project_id == project_id)
    if date_start and date_end:
        shifts_query = shifts_query.filter(Shift.date >= date_start, Shift.date <= date_end)
    shifts = shifts_query.all()
    shift_ids = [s.id for s in shifts]
    
    # Get all attendances for these shifts
    attendances = []
    if shift_ids:
        # Build date range for attendance query
        if date_start and date_end:
            date_start_dt = datetime.combine(date_start, time.min).replace(tzinfo=timezone.utc)
            date_end_dt = datetime.combine(date_end + timedelta(days=1), time.min).replace(tzinfo=timezone.utc)
            attendances_query = db.query(Attendance).filter(
                Attendance.shift_id.in_(shift_ids),
                or_(
                    and_(
                        Attendance.clock_in_time.isnot(None),
                        Attendance.clock_in_time >= date_start_dt,
                        Attendance.clock_in_time < date_end_dt
                    ),
                    and_(
                        Attendance.clock_in_time.is_(None),
                        Attendance.clock_out_time.isnot(None),
                        Attendance.clock_out_time >= date_start_dt,
                        Attendance.clock_out_time < date_end_dt
                    )
                )
            )
        else:
            attendances_query = db.query(Attendance).filter(Attendance.shift_id.in_(shift_ids))
        
        if user_id:
            attendances_query = attendances_query.filter(Attendance.worker_id == user_id)
        
        attendances = attendances_query.order_by(
            func.coalesce(Attendance.clock_in_time, Attendance.clock_out_time).asc()
        ).all()
    
    # Get user and profile info for attendances
    worker_ids = list(set([str(a.worker_id) for a in attendances]))
    users_dict = {}
    profiles_dict = {}
    if worker_ids:
        try:
            worker_ids_uuid = [uuid.UUID(wid) for wid in worker_ids]
            users = db.query(User).filter(User.id.in_(worker_ids_uuid)).all()
            users_dict = {str(u.id): u for u in users}
            profiles = db.query(EmployeeProfile).filter(EmployeeProfile.user_id.in_(worker_ids_uuid)).all()
            profiles_dict = {str(p.user_id): p for p in profiles}
        except Exception:
            pass
    
    # Build shifts dict for quick lookup
    shifts_dict = {str(s.id): s for s in shifts}
    
    # Convert attendances to timesheet format (same as attendance table)
    out = []
    for att in attendances:
        worker = users_dict.get(str(att.worker_id))
        profile = profiles_dict.get(str(att.worker_id))
        
        # Get worker name
        worker_name = worker.username if worker else "Unknown"
        if profile:
            name = (profile.preferred_name or '').strip()
            if not name:
                first = (profile.first_name or '').strip()
                last = (profile.last_name or '').strip()
                name = ' '.join([x for x in [first, last] if x])
            if name:
                worker_name = name
        
        # Get work_date from clock_in_time or clock_out_time
        work_date = None
        if att.clock_in_time:
            work_date = att.clock_in_time.date()
        elif att.clock_out_time:
            work_date = att.clock_out_time.date()
        
        if not work_date:
            continue
        
        # Calculate hours_worked (same as attendance table)
        hours_worked = None
        if att.clock_in_time and att.clock_out_time:
            diff = att.clock_out_time - att.clock_in_time
            hours_worked = diff.total_seconds() / 3600  # Convert to hours
        
        # Use break_minutes from database (already calculated and saved, including manual breaks)
        # Only calculate if not already set in database
        break_minutes = att.break_minutes
        if break_minutes is None and att.clock_in_time and att.clock_out_time:
            # Fallback: calculate if not set (for old records or edge cases)
            break_minutes = calculate_break_minutes(
                db, att.worker_id, att.clock_in_time, att.clock_out_time
            )
        
        # Calculate net hours (hours - break)
        net_hours = hours_worked
        if hours_worked is not None and break_minutes is not None and break_minutes > 0:
            net_hours = max(0, hours_worked - (break_minutes / 60))
        
        # Get shift for notes
        shift = shifts_dict.get(str(att.shift_id)) if att.shift_id else None
        shift_deleted = False
        shift_deleted_by = None
        shift_deleted_at = None
        
        # Check if shift was deleted (soft-delete uses status="deleted")
        if att.shift_id and (not shift or getattr(shift, "status", None) == "deleted"):
            shift_deleted = True
            # Get information about who deleted the shift from audit log
            delete_log = db.query(AuditLog).filter(
                AuditLog.entity_type == "shift",
                AuditLog.entity_id == att.shift_id,
                AuditLog.action == "DELETE"
            ).order_by(AuditLog.timestamp_utc.desc()).first()
            
            if delete_log:
                shift_deleted_at = delete_log.timestamp_utc.isoformat() if delete_log.timestamp_utc else None
                # Get actor name
                actor = db.query(User).filter(User.id == delete_log.actor_id).first()
                if actor:
                    shift_deleted_by = actor.username or actor.email or str(delete_log.actor_id)
                else:
                    shift_deleted_by = str(delete_log.actor_id)
        
        notes = f"Clock-in via attendance system"
        if shift and shift.job_name:
            notes = f"Clock-in via attendance system - {shift.job_name}"
        
        # Format times - convert from UTC to local timezone before extracting time
        from ..config import settings
        import pytz
        start_time_str = None
        end_time_str = None
        local_tz = pytz.timezone(settings.tz_default)
        if att.clock_in_time:
            # Convert UTC to local timezone
            local_time = att.clock_in_time.astimezone(local_tz)
            start_time_str = local_time.time().isoformat()
        if att.clock_out_time:
            # Convert UTC to local timezone
            local_time = att.clock_out_time.astimezone(local_tz)
            end_time_str = local_time.time().isoformat()
        
        entry_dict = {
            "id": f"attendance_{att.id}",  # Prefix to distinguish from ProjectTimeEntry
            "project_id": str(project_id),
            "user_id": str(att.worker_id),
            "user_name": worker_name,
            "user_avatar_file_id": str(profile.profile_photo_file_id) if (profile and profile.profile_photo_file_id) else None,
            "work_date": work_date.isoformat(),
            "start_time": start_time_str,
            "end_time": end_time_str,
            "minutes": int(net_hours * 60) if net_hours is not None else 0,  # Net minutes (after break)
            "break_minutes": break_minutes if break_minutes is not None else 0,
            "notes": notes,
            "created_at": att.created_at.isoformat() if att.created_at else None,
            "is_approved": att.status == "approved",
            "approved_at": att.approved_at.isoformat() if att.approved_at else None,
            "approved_by": str(att.approved_by) if att.approved_by else None,
            "is_from_attendance": True,  # Flag to indicate this comes from attendance
            "attendance_id": str(att.id),  # Store attendance ID for reference
        }
        
        # Add shift deleted information if applicable
        if shift_deleted:
            entry_dict["shift_deleted"] = True
            entry_dict["shift_deleted_by"] = shift_deleted_by
            entry_dict["shift_deleted_at"] = shift_deleted_at
        
        out.append(entry_dict)
    
    # Also include regular ProjectTimeEntry records (manual entries without attendance)
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
    for r,u,ep in rows:
        # Check if this entry already has an attendance record (to avoid duplicates)
        # We'll skip manual entries that have corresponding attendance
        entry_date = r.work_date
        entry_user_id = str(r.user_id)
        has_attendance = any(
            str(a.worker_id) == entry_user_id and 
            ((a.clock_in_time and a.clock_in_time.date() == entry_date) or 
             (a.clock_out_time and a.clock_out_time.date() == entry_date))
            for a in attendances
        )
        
        # Only include manual entries that don't have attendance
        if not has_attendance:
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
                "break_minutes": 0,  # Manual entries don't have break
                "notes": r.notes,
                "created_at": r.created_at.isoformat() if getattr(r,'created_at', None) else None,
                "is_approved": bool(getattr(r,'is_approved', False)),
                "approved_at": getattr(r,'approved_at', None).isoformat() if getattr(r,'approved_at', None) else None,
                "approved_by": str(getattr(r,'approved_by', None)) if getattr(r,'approved_by', None) else None,
                "is_from_attendance": False,
            })
    
    # Sort by work_date and start_time (handle None values)
    out.sort(key=lambda x: (x.get("work_date") or "", x.get("start_time") or ""))
    
    return out


@router.post("/{project_id}/timesheet")
def create_time_entry(project_id: str, payload: dict, db: Session = Depends(get_db), user=Depends(get_current_user), _=Depends(require_permissions("business:projects:timesheet:write", "hr:timesheet:write", "timesheet:write"))):
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
    
    # Create audit log with rich context
    try:
        from ..services.audit import create_audit_log
        from ..services.permissions import is_admin, is_supervisor
        
        # Determine actor role
        actor_role = "worker"
        if is_admin(user, db):
            actor_role = "admin"
        elif is_supervisor(user, db):
            actor_role = "supervisor"
        
        # Get affected user name
        affected_user = db.query(User, EmployeeProfile).outerjoin(
            EmployeeProfile, EmployeeProfile.user_id == User.id
        ).filter(User.id == target_uuid).first()
        affected_user_name = None
        if affected_user:
            u, ep = affected_user
            if ep:
                affected_user_name = f"{ep.first_name or ''} {ep.last_name or ''}".strip() or u.username
            else:
                affected_user_name = u.username
        
        # Get project name
        proj = db.query(Project).filter(Project.id == project_id).first()
        project_name = proj.name if proj else None
        
        create_audit_log(
            db=db,
            entity_type="timesheet_entry",
            entity_id=str(row.id),
            action="CREATE",
            actor_id=str(user.id),
            actor_role=actor_role,
            source="api",
            changes_json={
                "minutes": row.minutes,
                "work_date": row.work_date.isoformat(),
                "notes": row.notes or None,
                "start_time": start_time,
                "end_time": end_time,
            },
            context={
                "project_id": str(project_id),
                "project_name": project_name,
                "affected_user_id": str(target_uuid),
                "affected_user_name": affected_user_name,
            }
        )
    except Exception:
        pass
    
    return {"id": str(row.id)}


@router.patch("/{project_id}/timesheet/{entry_id}")
def update_time_entry(project_id: str, entry_id: str, payload: dict, db: Session = Depends(get_db), user=Depends(get_current_user)):
    """
    Update a timesheet entry.
    - For manual ProjectTimeEntry: requires timesheet write permission.
    - For attendance-backed entries (id startswith "attendance_"): requires HR Attendance write permission.
    """
    from ..auth.security import _has_permission
    from ..services.permissions import is_admin
    from fastapi import HTTPException

    # Attendance-backed entry (prefixed with "attendance_")
    if entry_id.startswith("attendance_"):
        if not (is_admin(user, db) or _has_permission(user, "hr:attendance:write") or _has_permission(user, "hr:users:edit:timesheet") or _has_permission(user, "users:write")):
            raise HTTPException(status_code=403, detail="You do not have permission to edit attendance records")

        attendance_id_str = entry_id.replace("attendance_", "")
        try:
            attendance_uuid = uuid.UUID(attendance_id_str)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid attendance ID format")

        from ..models.models import Attendance, Shift, Project, ProjectTimeEntry
        attendance = db.query(Attendance).filter(Attendance.id == attendance_uuid).first()
        if not attendance:
            raise HTTPException(status_code=404, detail="Attendance not found")

        # Verify attendance belongs to this project through shift
        shift = None
        if attendance.shift_id:
            shift = db.query(Shift).filter(Shift.id == attendance.shift_id).first()
            if shift and str(shift.project_id) != project_id:
                raise HTTPException(status_code=403, detail="Attendance does not belong to this project")
        else:
            # Direct attendances (no shift) cannot be edited from a project-scoped timesheet
            raise HTTPException(status_code=403, detail="Attendance is not linked to a project shift")

        # Parse start/end times (local HH:MM:SS)
        start_time = payload.get("start_time")
        end_time = payload.get("end_time")
        if not start_time or not end_time:
            raise HTTPException(status_code=400, detail="start_time and end_time are required")
        try:
            from datetime import time as _time
            st = _time.fromisoformat(str(start_time))
            et = _time.fromisoformat(str(end_time))
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid time format")

        # Convert local times to UTC datetimes using the same timezone used by the timesheet UI
        base_dt = attendance.clock_in_time or attendance.clock_out_time
        if not base_dt:
            raise HTTPException(status_code=400, detail="Attendance has no time data to update")

        from ..config import settings
        import pytz
        from datetime import datetime, timedelta

        local_tz = pytz.timezone(settings.tz_default)
        local_date = base_dt.astimezone(local_tz).date()

        start_local = local_tz.localize(datetime.combine(local_date, st))
        end_local = local_tz.localize(datetime.combine(local_date, et))
        if end_local <= start_local:
            end_local = end_local + timedelta(days=1)

        start_utc = start_local.astimezone(pytz.UTC)
        end_utc = end_local.astimezone(pytz.UTC)

        # Conflict check (reuse existing helper)
        from ..routes.settings import check_attendance_conflict, calculate_break_minutes
        conflict_error = check_attendance_conflict(
            db, attendance.worker_id, start_utc, end_utc, exclude_attendance_id=attendance.id, timezone_str=settings.tz_default
        )
        if conflict_error:
            # Improve message to "update" context
            raise HTTPException(status_code=400, detail=str(conflict_error).replace("Cannot create attendance:", "Cannot update attendance:"))

        before = {
            "clock_in_time": attendance.clock_in_time.isoformat() if attendance.clock_in_time else None,
            "clock_out_time": attendance.clock_out_time.isoformat() if attendance.clock_out_time else None,
            "break_minutes": attendance.break_minutes,
        }

        attendance.clock_in_time = start_utc
        attendance.clock_out_time = end_utc
        # Use break_minutes from payload if provided, otherwise preserve existing manual break
        manual_break = None
        if "break_minutes" in payload and payload["break_minutes"] is not None:
            manual_break = int(payload["break_minutes"])
        elif attendance.break_minutes is not None:
            manual_break = attendance.break_minutes
        attendance.break_minutes = calculate_break_minutes(db, attendance.worker_id, attendance.clock_in_time, attendance.clock_out_time, manual_break_minutes=manual_break)

        # Keep ProjectTimeEntry (synced row) in sync when present
        te = db.query(ProjectTimeEntry).filter(ProjectTimeEntry.source_attendance_id == attendance.id).first()
        if not te:
            try:
                project_uuid = uuid.UUID(project_id)
                work_date = shift.date if shift else local_date
                te = db.query(ProjectTimeEntry).filter(
                    ProjectTimeEntry.project_id == project_uuid,
                    ProjectTimeEntry.user_id == attendance.worker_id,
                    ProjectTimeEntry.work_date == work_date,
                    ProjectTimeEntry.notes.ilike("%attendance system%")
                ).first()
            except Exception:
                te = None

        if te:
            total_minutes = int((end_utc - start_utc).total_seconds() / 60)
            break_min = attendance.break_minutes or 0
            te.start_time = st
            te.end_time = et
            te.minutes = max(0, total_minutes - break_min)
            try:
                if getattr(te, "source_attendance_id", None) is None:
                    te.source_attendance_id = attendance.id
            except Exception:
                pass

        db.commit()

        after = {
            "clock_in_time": attendance.clock_in_time.isoformat() if attendance.clock_in_time else None,
            "clock_out_time": attendance.clock_out_time.isoformat() if attendance.clock_out_time else None,
            "break_minutes": attendance.break_minutes,
        }

        # Create audit log with rich context
        try:
            from ..services.audit import create_audit_log
            from ..services.permissions import is_admin, is_supervisor
            
            # Determine actor role
            actor_role = "worker"
            if is_admin(user, db):
                actor_role = "admin"
            elif is_supervisor(user, db):
                actor_role = "supervisor"
            
            # Get affected user name
            affected_user = db.query(User, EmployeeProfile).outerjoin(
                EmployeeProfile, EmployeeProfile.user_id == User.id
            ).filter(User.id == attendance.worker_id).first()
            affected_user_name = None
            if affected_user:
                u, ep = affected_user
                if ep:
                    affected_user_name = f"{ep.first_name or ''} {ep.last_name or ''}".strip() or u.username
                else:
                    affected_user_name = u.username
            
            # Get project name
            proj = db.query(Project).filter(Project.id == project_id).first()
            project_name = proj.name if proj else None
            
            # Get work date
            work_date = local_date.isoformat() if local_date else None
            
            create_audit_log(
                db=db,
                entity_type="timesheet_entry",
                entity_id=str(attendance.id),
                action="UPDATE",
                actor_id=str(user.id),
                actor_role=actor_role,
                source="api",
                changes_json={
                    "before": before,
                    "after": after,
                    "source": "attendance",
                },
                context={
                    "project_id": str(project_id),
                    "project_name": project_name,
                    "affected_user_id": str(attendance.worker_id),
                    "affected_user_name": affected_user_name,
                    "attendance_id": str(attendance.id),
                    "work_date": work_date,
                }
            )
        except Exception:
            pass

        return {"status": "ok"}

    # Manual ProjectTimeEntry update
    if not (is_admin(user, db) or _has_permission(user, "business:projects:timesheet:write") or _has_permission(user, "hr:timesheet:write") or _has_permission(user, "timesheet:write")):
        raise HTTPException(status_code=403, detail="You do not have permission to edit time entries")

    row = db.query(ProjectTimeEntry).filter(ProjectTimeEntry.id == entry_id, ProjectTimeEntry.project_id == project_id).first()
    if not row:
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
    
    # Create audit log with rich context
    try:
        from ..services.audit import create_audit_log
        from ..services.permissions import is_admin, is_supervisor
        
        # Determine actor role
        actor_role = "worker"
        if is_admin(user, db):
            actor_role = "admin"
        elif is_supervisor(user, db):
            actor_role = "supervisor"
        
        # Get affected user name
        affected_user = db.query(User, EmployeeProfile).outerjoin(
            EmployeeProfile, EmployeeProfile.user_id == User.id
        ).filter(User.id == row.user_id).first()
        affected_user_name = None
        if affected_user:
            u, ep = affected_user
            if ep:
                affected_user_name = f"{ep.first_name or ''} {ep.last_name or ''}".strip() or u.username
            else:
                affected_user_name = u.username
        
        # Get project name
        proj = db.query(Project).filter(Project.id == row.project_id).first()
        project_name = proj.name if proj else None
        
        create_audit_log(
            db=db,
            entity_type="timesheet_entry",
            entity_id=str(row.id),
            action="UPDATE",
            actor_id=str(user.id),
            actor_role=actor_role,
            source="api",
            changes_json={
                "before": before,
                "after": after,
            },
            context={
                "project_id": str(row.project_id),
                "project_name": project_name,
                "affected_user_id": str(row.user_id),
                "affected_user_name": affected_user_name,
            }
        )
    except Exception:
        pass
    
    return {"status":"ok"}


@router.delete("/{project_id}/timesheet/{entry_id}")
def delete_time_entry(project_id: str, entry_id: str, db: Session = Depends(get_db), user=Depends(get_current_user)):
    """
    Delete a timesheet entry.
    - For manual ProjectTimeEntry: requires timesheet write permission.
    - For attendance-backed entries (id startswith "attendance_"): requires HR Attendance write permission.
    """
    from ..auth.security import _has_permission
    from ..services.permissions import is_admin
    # Attendance-backed entry (prefixed with "attendance_")
    if entry_id.startswith("attendance_"):
        if not (is_admin(user, db) or _has_permission(user, "hr:attendance:write") or _has_permission(user, "hr:users:edit:timesheet") or _has_permission(user, "users:write")):
            from fastapi import HTTPException
            raise HTTPException(status_code=403, detail="You do not have permission to delete attendance records")

        # Extract attendance ID
        attendance_id_str = entry_id.replace("attendance_", "")
        try:
            attendance_uuid = uuid.UUID(attendance_id_str)
        except ValueError:
            from fastapi import HTTPException
            raise HTTPException(status_code=400, detail="Invalid attendance ID format")
        
        # Get attendance record
        from ..models.models import Attendance
        attendance = db.query(Attendance).filter(Attendance.id == attendance_uuid).first()
        if not attendance:
            from fastapi import HTTPException
            raise HTTPException(status_code=404, detail="Attendance not found")
        
        # Verify attendance belongs to this project through shift
        if attendance.shift_id:
            from ..models.models import Shift
            shift = db.query(Shift).filter(Shift.id == attendance.shift_id).first()
            if shift and str(shift.project_id) != project_id:
                from fastapi import HTTPException
                raise HTTPException(status_code=403, detail="Attendance does not belong to this project")
        
        # Get work_date for log
        work_date = None
        if attendance.clock_in_time:
            work_date = attendance.clock_in_time.date()
        elif attendance.clock_out_time:
            work_date = attendance.clock_out_time.date()
        
        # Calculate hours and break for log
        hours_worked = None
        break_minutes = None
        if attendance.clock_in_time and attendance.clock_out_time:
            diff = attendance.clock_out_time - attendance.clock_in_time
            hours_worked = diff.total_seconds() / 3600
            from ..routes.settings import calculate_break_minutes
            break_minutes = calculate_break_minutes(
                db, attendance.worker_id, attendance.clock_in_time, attendance.clock_out_time
            )
        
        # Format times for log
        start_time_str = None
        end_time_str = None
        if attendance.clock_in_time:
            start_time_str = attendance.clock_in_time.time().isoformat()
        if attendance.clock_out_time:
            end_time_str = attendance.clock_out_time.time().isoformat()
        
        # Create audit log with rich context before deleting
        try:
            from ..services.audit import create_audit_log
            from ..services.permissions import is_admin, is_supervisor
            
            # Determine actor role
            actor_role = "worker"
            if is_admin(user, db):
                actor_role = "admin"
            elif is_supervisor(user, db):
                actor_role = "supervisor"
            
            # Get affected user name
            affected_user = db.query(User, EmployeeProfile).outerjoin(
                EmployeeProfile, EmployeeProfile.user_id == User.id
            ).filter(User.id == attendance.worker_id).first()
            affected_user_name = None
            if affected_user:
                u, ep = affected_user
                if ep:
                    affected_user_name = f"{ep.first_name or ''} {ep.last_name or ''}".strip() or u.username
                else:
                    affected_user_name = u.username
            
            # Get project name
            proj = db.query(Project).filter(Project.id == project_id).first()
            project_name = proj.name if proj else None
            
            create_audit_log(
                db=db,
                entity_type="timesheet_entry",
                entity_id=str(attendance_uuid),
                action="DELETE",
                actor_id=str(user.id),
                actor_role=actor_role,
                source="api",
                changes_json={
                    "work_date": work_date.isoformat() if work_date else None,
                    "start_time": start_time_str,
                    "end_time": end_time_str,
                    "hours_worked": hours_worked,
                    "break_minutes": break_minutes,
                    "source": "attendance",
                },
                context={
                    "project_id": str(project_id),
                    "project_name": project_name,
                    "affected_user_id": str(attendance.worker_id),
                    "affected_user_name": affected_user_name,
                    "attendance_id": str(attendance_uuid),
                }
            )
        except Exception:
            pass
        
        # If this attendance had a synced ProjectTimeEntry (created on approval), delete it too.
        # Prefer precise linkage by source_attendance_id; fallback to legacy note pattern.
        try:
            from ..models.models import ProjectTimeEntry
            from sqlalchemy import or_, and_
            q = db.query(ProjectTimeEntry).filter(
                ProjectTimeEntry.project_id == uuid.UUID(project_id) if isinstance(project_id, str) else project_id,
                ProjectTimeEntry.user_id == attendance.worker_id,
            )
            if work_date:
                q = q.filter(ProjectTimeEntry.work_date == work_date)
            q = q.filter(
                or_(
                    ProjectTimeEntry.source_attendance_id == attendance.id,
                    and_(
                        ProjectTimeEntry.source_attendance_id.is_(None),
                        ProjectTimeEntry.notes.ilike("%attendance system%"),
                    ),
                )
            )
            for te in q.all():
                db.delete(te)
        except Exception:
            # Non-critical: do not block attendance deletion if cleanup fails
            pass
        
        # Delete the attendance record
        db.delete(attendance)
        db.commit()

        # For attendance deletes, we are done (do not run the ProjectTimeEntry reset logic below)
        return {"status": "ok"}

    # Manual ProjectTimeEntry delete
    if not (is_admin(user, db) or _has_permission(user, "business:projects:timesheet:write") or _has_permission(user, "hr:timesheet:write") or _has_permission(user, "timesheet:write")):
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="You do not have permission to delete time entries")

    else:
        # Regular ProjectTimeEntry
        row = db.query(ProjectTimeEntry).filter(ProjectTimeEntry.id == entry_id, ProjectTimeEntry.project_id == project_id).first()
        if not row:
            return {"status":"ok"}
        
        # Store entry data before deletion for attendance lookup
        entry_user_id = row.user_id
        entry_work_date = row.work_date
        entry_start_time = row.start_time
        entry_end_time = row.end_time
        entry_minutes = row.minutes
        entry_notes = row.notes
        entry_project_id = row.project_id
        entry_id = row.id
        
        # Create audit log with rich context before deleting
        try:
            from ..services.audit import create_audit_log
            from ..services.permissions import is_supervisor
            
            # Determine actor role
            actor_role = "worker"
            if is_admin(user, db):
                actor_role = "admin"
            elif is_supervisor(user, db):
                actor_role = "supervisor"
            
            # Get affected user name
            affected_user = db.query(User, EmployeeProfile).outerjoin(
                EmployeeProfile, EmployeeProfile.user_id == User.id
            ).filter(User.id == entry_user_id).first()
            affected_user_name = None
            if affected_user:
                u, ep = affected_user
                if ep:
                    affected_user_name = f"{ep.first_name or ''} {ep.last_name or ''}".strip() or u.username
                else:
                    affected_user_name = u.username
            
            # Get project name
            proj = db.query(Project).filter(Project.id == entry_project_id).first()
            project_name = proj.name if proj else None
            
            create_audit_log(
                db=db,
                entity_type="timesheet_entry",
                entity_id=str(entry_id),
                action="DELETE",
                actor_id=str(user.id),
                actor_role=actor_role,
                source="api",
                changes_json={
                    "work_date": entry_work_date.isoformat() if entry_work_date else None,
                    "start_time": entry_start_time.isoformat() if entry_start_time else None,
                    "end_time": entry_end_time.isoformat() if entry_end_time else None,
                    "minutes": entry_minutes,
                    "notes": entry_notes,
                },
                context={
                    "project_id": str(entry_project_id),
                    "project_name": project_name,
                    "affected_user_id": str(entry_user_id),
                    "affected_user_name": affected_user_name,
                }
            )
        except Exception:
            pass
        
        db.delete(row)
        db.commit()
    
    # Reset related attendance records if this entry was created from attendance
    # Find shifts for this project, user, and date
    from ..models.models import Shift, Attendance
    from ..services.audit import create_audit_log
    from ..services.permissions import is_supervisor
    
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
def list_time_logs(project_id: str, month: Optional[str] = None, user_id: Optional[str] = None, limit: int = 50, offset: int = 0, db: Session = Depends(get_db), _=Depends(require_permissions("business:projects:timesheet:read", "hr:timesheet:read", "timesheet:read"))):
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
def timesheet_summary(month: Optional[str] = None, user_id: Optional[str] = None, db: Session = Depends(get_db), _=Depends(require_permissions("hr:timesheet:read", "timesheet:read"))):
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
    
    before_approved = row.is_approved
    row.is_approved = bool(approved)
    if row.is_approved:
        row.approved_at = datetime.now(timezone.utc)
        row.approved_by = user.id
        action = "APPROVE"
    else:
        row.approved_at = None
        row.approved_by = None
        action = "UNAPPROVE"
    db.commit()
    
    # Create audit log with rich context
    try:
        from ..services.audit import create_audit_log
        from ..services.permissions import is_admin, is_supervisor
        
        # Determine actor role
        actor_role = "worker"
        if is_admin(user, db):
            actor_role = "admin"
        elif is_supervisor(user, db):
            actor_role = "supervisor"
        
        # Get affected user name
        affected_user = db.query(User, EmployeeProfile).outerjoin(
            EmployeeProfile, EmployeeProfile.user_id == User.id
        ).filter(User.id == row.user_id).first()
        affected_user_name = None
        if affected_user:
            u, ep = affected_user
            if ep:
                affected_user_name = f"{ep.first_name or ''} {ep.last_name or ''}".strip() or u.username
            else:
                affected_user_name = u.username
        
        # Get project name
        proj = db.query(Project).filter(Project.id == row.project_id).first()
        project_name = proj.name if proj else None
        
        create_audit_log(
            db=db,
            entity_type="timesheet_entry",
            entity_id=str(row.id),
            action=action,
            actor_id=str(user.id),
            actor_role=actor_role,
            source="api",
            changes_json={
                "before": {"is_approved": before_approved},
                "after": {"is_approved": row.is_approved},
                "work_date": row.work_date.isoformat() if row.work_date else None,
                "minutes": row.minutes,
            },
            context={
                "project_id": str(row.project_id),
                "project_name": project_name,
                "affected_user_id": str(row.user_id),
                "affected_user_name": affected_user_name,
            }
        )
    except Exception:
        pass
    
    return {"status": "ok", "is_approved": row.is_approved}


# ---- Timesheet: list across all projects for a user ----
@router.get("/timesheet/user")
def timesheet_by_user(month: Optional[str] = None, user_id: Optional[str] = None, db: Session = Depends(get_db), _=Depends(require_permissions("hr:timesheet:read", "timesheet:read"))):
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


# ---- Project Audit Logs ----
@router.get("/{project_id}/audit-logs")
def get_project_audit_logs(
    project_id: str,
    section: Optional[str] = None,
    month: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
    _=Depends(require_permissions("business:projects:read"))
):
    """
    Get audit logs for a specific project/opportunity.
    
    Args:
        project_id: Project/Opportunity ID
        section: Filter by section (reports|files|proposal|estimate|orders|workload|timesheet|general)
        month: Filter by month (YYYY-MM format)
        limit: Maximum number of results (default 50, max 200)
        offset: Offset for pagination
    
    Returns:
        List of audit log entries with user information
    """
    from ..services.audit import get_project_audit_logs as fetch_logs
    
    # Validate project exists
    p = db.query(Project).filter(Project.id == project_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Validate and clamp limit
    try:
        limit = max(1, min(200, int(limit)))
    except (ValueError, TypeError):
        limit = 50
    
    try:
        offset = max(0, int(offset))
    except (ValueError, TypeError):
        offset = 0
    
    return fetch_logs(db, project_id, section, month, limit, offset)


@router.post("/{project_id}/convert-to-project")
def convert_to_project(project_id: str, db: Session = Depends(get_db)):
    """Convert a bidding to an active project"""
    p = db.query(Project).filter(Project.id == project_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Not found")
    if not getattr(p, 'is_bidding', False):
        raise HTTPException(status_code=400, detail="This is already a project, not a bidding")
    
    # Set status to "In Progress" when converting to project
    status_list = db.query(SettingList).filter(SettingList.name == "project_statuses").first()
    if status_list:
        in_progress_status = db.query(SettingItem).filter(
            SettingItem.list_id == status_list.id,
            SettingItem.label == "In Progress"
        ).first()
        if in_progress_status:
            p.status_id = in_progress_status.id
            p.status_label = "In Progress"
    
    p.is_bidding = False
    db.commit()
    return {"status": "ok", "id": str(p.id)}


# =====================
# Business Dashboard
# =====================

def calculate_estimate_values(estimate, db: Session) -> tuple[Optional[float], Optional[float]]:
    """
    Calculate Final Total (With GST) and Profit from an estimate.
    Returns: (final_total_with_gst, profit) or (None, None) if calculation fails.
    """
    if not estimate or not estimate.notes:
        return (None, None)
    
    try:
        import json
        ui_state = json.loads(estimate.notes)
        pst_rate = ui_state.get('pst_rate', 7.0)
        gst_rate = ui_state.get('gst_rate', 5.0)
        profit_rate = ui_state.get('profit_rate', 20.0)
        markup = estimate.markup or 0.0
        
        items = db.query(EstimateItem).filter(EstimateItem.estimate_id == estimate.id).all()
        item_extras_map = ui_state.get('item_extras', {})
        
        # Calculate total with markup applied per item (matching EstimateBuilder logic)
        # Each item can have its own markup, or use the global markup
        total = 0.0
        taxable_total = 0.0
        for item in items:
            # Get item-specific markup or use global markup
            item_extras = item_extras_map.get(f'item_{item.id}', {})
            item_markup = item_extras.get('markup')
            if item_markup is None:
                item_markup = markup
            
            # Calculate item base total based on item type
            if item.item_type == 'labour' and item_extras.get('labour_journey_type'):
                if item_extras.get('labour_journey_type') == 'contract':
                    item_base_total = (item_extras.get('labour_journey', 0) or 0) * (item.unit_price or 0.0)
                else:
                    item_base_total = (item_extras.get('labour_journey', 0) or 0) * (item_extras.get('labour_men', 0) or 0) * (item.unit_price or 0.0)
            else:
                item_base_total = (item.quantity or 0.0) * (item.unit_price or 0.0)
            
            # Apply markup to item (matching EstimateBuilder: itemTotal * (1 + markup/100))
            item_total = item_base_total * (1 + (item_markup / 100))
            
            total += item_total
            # PST only applies to taxable items - and it's calculated on the total WITH markup
            # (matching EstimateBuilder: taxableTotal includes markup)
            if item_extras.get('taxable', True) is not False:
                taxable_total += item_total  # PST is calculated on total WITH markup
        
        # Calculate PST, subtotal, profit, final_total, GST, grand_total
        # Following EstimateBuilder logic exactly
        pst = taxable_total * (pst_rate / 100)
        subtotal = total + pst  # total already includes markup per item
        profit_value = subtotal * (profit_rate / 100)
        final_total = subtotal + profit_value
        gst = final_total * (gst_rate / 100)
        final_total_with_gst = final_total + gst
        
        return (final_total_with_gst, profit_value)
    except Exception:
        return (None, None)


@router.get("/business/dashboard")
def business_dashboard(
    division_id: Optional[str] = None,
    subdivision_id: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    mode: Optional[str] = "quantity",
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """Get business dashboard statistics"""
    # Base queries
    opportunities_query = db.query(Project).filter(Project.is_bidding == True)
    projects_query = db.query(Project).filter(Project.is_bidding == False)
    
    # Apply date filtering
    effective_start_dt = func.coalesce(Project.date_start, Project.created_at)
    if date_from:
        try:
            start_d = datetime.strptime(date_from, "%Y-%m-%d").date()
            opportunities_query = opportunities_query.filter(cast(effective_start_dt, Date) >= start_d)
            projects_query = projects_query.filter(cast(effective_start_dt, Date) >= start_d)
        except Exception:
            pass
    
    if date_to:
        try:
            end_d = datetime.strptime(date_to, "%Y-%m-%d").date()
            opportunities_query = opportunities_query.filter(cast(effective_start_dt, Date) <= end_d)
            projects_query = projects_query.filter(cast(effective_start_dt, Date) <= end_d)
        except Exception:
            pass
    
    # Filter by project division/subdivision if provided
    if subdivision_id:
        # Filter by specific subdivision
        try:
            subdiv_uuid = uuid.UUID(subdivision_id)
            opportunities_query = opportunities_query.filter(
                or_(
                    cast(Project.project_division_ids, String).like(f'%{subdivision_id}%'),
                    # Legacy support
                    Project.division_id == subdiv_uuid,
                    cast(Project.division_ids, String).like(f'%{subdivision_id}%')
                )
            )
            projects_query = projects_query.filter(
                or_(
                    cast(Project.project_division_ids, String).like(f'%{subdivision_id}%'),
                    # Legacy support
                    Project.division_id == subdiv_uuid,
                    cast(Project.division_ids, String).like(f'%{subdivision_id}%')
                )
            )
        except ValueError:
            pass
    elif division_id:
        # Filter by main division (includes all its subdivisions)
        try:
            div_uuid = uuid.UUID(division_id)
            # Get all subdivision IDs for this division
            from ..models.models import SettingList, SettingItem
            divisions_list = db.query(SettingList).filter(SettingList.name == "project_divisions").first()
            
            all_conditions = []
            
            if divisions_list:
                # Get division and all its subdivisions
                division_items = db.query(SettingItem).filter(
                    SettingItem.list_id == divisions_list.id,
                    or_(
                        SettingItem.id == div_uuid,
                        SettingItem.parent_id == div_uuid
                    )
                ).all()
                division_ids_list = [str(item.id) for item in division_items]
                
                # Build filter condition for any of these IDs (main division + all subdivisions)
                for div_id_str in division_ids_list:
                    try:
                        div_id_uuid = uuid.UUID(div_id_str)
                        # Project matches if it has this division/subdivision ID in any format
                        all_conditions.append(
                            or_(
                                Project.division_id == div_id_uuid,
                                cast(Project.project_division_ids, String).like(f'%{div_id_str}%'),
                                cast(Project.division_ids, String).like(f'%{div_id_str}%')
                            )
                        )
                    except ValueError:
                        pass
            
            # Always include the main division_id even if not in division_ids_list
            all_conditions.append(
                or_(
                    Project.division_id == div_uuid,
                    cast(Project.division_ids, String).like(f'%{division_id}%')
                )
            )
            
            # Apply all conditions with OR (project matches if it has division or any subdivision)
            if all_conditions:
                opportunities_query = opportunities_query.filter(or_(*all_conditions))
                projects_query = projects_query.filter(or_(*all_conditions))
        except ValueError:
            pass
    
    # Get counts
    total_opportunities = opportunities_query.count()
    total_projects = projects_query.count()
    
    # Get opportunities by status
    opportunities_by_status = {}
    if mode == "value":
        # Calculate values from estimates
        for opp in opportunities_query.all():
            status = getattr(opp, 'status_label', None) or 'No Status'
            estimate = db.query(Estimate).filter(Estimate.project_id == opp.id).order_by(Estimate.created_at.desc()).first()
            final_total, profit = calculate_estimate_values(estimate, db)
            
            if status not in opportunities_by_status:
                opportunities_by_status[status] = {"final_total_with_gst": 0.0, "profit": 0.0}
            
            if final_total is not None:
                opportunities_by_status[status]["final_total_with_gst"] += final_total
            if profit is not None:
                opportunities_by_status[status]["profit"] += profit
    else:
        # Count by status (quantity mode)
        for opp in opportunities_query.all():
            status = getattr(opp, 'status_label', None) or 'No Status'
            opportunities_by_status[status] = opportunities_by_status.get(status, 0) + 1
    
    # Get projects by status
    projects_by_status = {}
    if mode == "value":
        # Calculate values from estimates
        for proj in projects_query.all():
            status = getattr(proj, 'status_label', None) or 'No Status'
            estimate = db.query(Estimate).filter(Estimate.project_id == proj.id).order_by(Estimate.created_at.desc()).first()
            final_total, profit = calculate_estimate_values(estimate, db)
            
            if status not in projects_by_status:
                projects_by_status[status] = {"final_total_with_gst": 0.0, "profit": 0.0}
            
            if final_total is not None:
                projects_by_status[status]["final_total_with_gst"] += final_total
            if profit is not None:
                projects_by_status[status]["profit"] += profit
    else:
        # Count by status (quantity mode)
        for proj in projects_query.all():
            status = getattr(proj, 'status_label', None) or 'No Status'
            projects_by_status[status] = projects_by_status.get(status, 0) + 1
    
    # Get total estimated value
    total_estimated_value = sum(
        (getattr(p, 'cost_estimated', 0) or 0) for p in opportunities_query.all()
    )
    
    # Get total actual value
    total_actual_value = sum(
        (getattr(p, 'cost_actual', 0) or 0) for p in projects_query.all()
    )
    
    return {
        "total_opportunities": total_opportunities,
        "total_projects": total_projects,
        "opportunities_by_status": opportunities_by_status,
        "projects_by_status": projects_by_status,
        "total_estimated_value": total_estimated_value,
        "total_actual_value": total_actual_value,
        "division_id": division_id,
    }


@router.get("/business/opportunities")
def business_opportunities(
    division_id: Optional[str] = None,
    division_id_not: Optional[str] = None,
    subdivision_id: Optional[str] = None,
    status: Optional[str] = None,
    status_not: Optional[str] = None,
    client_id: Optional[str] = None,
    client_id_not: Optional[str] = None,
    date_start: Optional[str] = None,
    date_end: Optional[str] = None,
    estimator_id: Optional[str] = None,
    estimator_id_not: Optional[str] = None,
    eta_start: Optional[str] = None,
    eta_end: Optional[str] = None,
    value_min: Optional[int] = None,
    value_max: Optional[int] = None,
    q: Optional[str] = None,
    limit: int = 100,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """Get opportunities filtered by project division/subdivision"""
    query = db.query(Project).filter(Project.is_bidding == True)
    
    # Filter by client
    if client_id:
        try:
            client_uuid = uuid.UUID(client_id)
            query = query.filter(Project.client_id == client_uuid)
        except ValueError:
            pass
    
    # Filter by client (exclusion)
    if client_id_not:
        try:
            client_uuid = uuid.UUID(client_id_not)
            query = query.filter(Project.client_id != client_uuid)
        except ValueError:
            pass
    
    # Filter by date range (Start Date shown on cards)
    # The UI displays: (project.date_start || project.created_at).slice(0,10)
    # So we filter by COALESCE(date_start, created_at) using DATE-only comparisons.
    effective_start_dt = func.coalesce(Project.date_start, Project.created_at)
    if date_start:
        try:
            from datetime import datetime
            start_d = datetime.strptime(date_start, "%Y-%m-%d").date()
            query = query.filter(cast(effective_start_dt, Date) >= start_d)
        except Exception:
            pass

    if date_end:
        try:
            from datetime import datetime
            end_d = datetime.strptime(date_end, "%Y-%m-%d").date()
            query = query.filter(cast(effective_start_dt, Date) <= end_d)
        except Exception:
            pass
    
    # Filter by project division/subdivision
    if subdivision_id:
        try:
            subdiv_uuid = uuid.UUID(subdivision_id)
            query = query.filter(
                or_(
                    cast(Project.project_division_ids, String).like(f'%{subdivision_id}%'),
                    # Legacy support
                    Project.division_id == subdiv_uuid,
                    cast(Project.division_ids, String).like(f'%{subdivision_id}%')
                )
            )
        except ValueError:
            pass
    elif division_id:
        # Filter by main division (includes all its subdivisions) - same logic as dashboard
        try:
            div_uuid = uuid.UUID(division_id)
            # Get all subdivision IDs for this division
            from ..models.models import SettingList, SettingItem
            divisions_list = db.query(SettingList).filter(SettingList.name == "project_divisions").first()
            
            all_conditions = []
            
            if divisions_list:
                # Get division and all its subdivisions
                division_items = db.query(SettingItem).filter(
                    SettingItem.list_id == divisions_list.id,
                    or_(
                        SettingItem.id == div_uuid,
                        SettingItem.parent_id == div_uuid
                    )
                ).all()
                division_ids_list = [str(item.id) for item in division_items]
                
                # Build filter condition for any of these IDs
                conditions = []
                for div_id_str in division_ids_list:
                    conditions.append(cast(Project.project_division_ids, String).like(f'%{div_id_str}%'))
                
                if conditions:
                    all_conditions.append(or_(*conditions))
            
            # Legacy support - combine with OR so it works with both old and new format
            all_conditions.append(
                or_(
                    Project.division_id == div_uuid,
                    cast(Project.division_ids, String).like(f'%{division_id}%')
                )
            )
            
            # Apply all conditions with OR (project matches if it has division in any format)
            if all_conditions:
                query = query.filter(or_(*all_conditions))
        except ValueError:
            pass
    
    # Filter by division (exclusion)
    if division_id_not and not subdivision_id:
        # For exclusion, we need to exclude projects that have this division or any of its subdivisions
        try:
            div_uuid = uuid.UUID(division_id_not)
            from ..models.models import SettingList, SettingItem
            divisions_list = db.query(SettingList).filter(SettingList.name == "project_divisions").first()
            
            excluded_division_ids = []
            
            if divisions_list:
                # Get division and all its subdivisions
                division_items = db.query(SettingItem).filter(
                    SettingItem.list_id == divisions_list.id,
                    or_(
                        SettingItem.id == div_uuid,
                        SettingItem.parent_id == div_uuid
                    )
                ).all()
                excluded_division_ids = [str(item.id) for item in division_items]
            
            # Always include the main division_id in the exclusion list
            if str(div_uuid) not in excluded_division_ids:
                excluded_division_ids.append(str(div_uuid))
            
            # Build exclusion: project is excluded if it has ANY of these divisions
            # We'll use NOT to exclude projects that match the inclusion pattern
            exclusion_or_conditions = []
            for div_id_str in excluded_division_ids:
                try:
                    div_id_uuid = uuid.UUID(div_id_str)
                    # Project HAS this division if any of these conditions are true:
                    has_division = or_(
                        Project.division_id == div_id_uuid,
                        cast(Project.project_division_ids, String).like(f'%{div_id_str}%'),
                        cast(Project.division_ids, String).like(f'%{div_id_str}%')
                    )
                    exclusion_or_conditions.append(has_division)
                except ValueError:
                    pass
            
            # Exclude projects that have ANY of the excluded divisions
            # Using De Morgan: NOT (A OR B) = (NOT A) AND (NOT B)
            # So we need: project does NOT have div1 AND does NOT have div2 AND ...
            exclusion_and_conditions = []
            for div_id_str in excluded_division_ids:
                try:
                    div_id_uuid = uuid.UUID(div_id_str)
                    # Project does NOT have this division if ALL of these are true:
                    not_has_division = and_(
                        or_(
                            Project.division_id != div_id_uuid,
                            Project.division_id.is_(None)
                        ),
                        or_(
                            cast(Project.project_division_ids, String).notlike(f'%{div_id_str}%'),
                            Project.project_division_ids.is_(None)
                        ),
                        or_(
                            cast(Project.division_ids, String).notlike(f'%{div_id_str}%'),
                            Project.division_ids.is_(None)
                        )
                    )
                    exclusion_and_conditions.append(not_has_division)
                except ValueError:
                    pass
            
            # Apply exclusion: project must NOT have ANY of the excluded divisions
            # Combine with AND: project must not have div1 AND not have div2 AND ...
            if exclusion_and_conditions:
                query = query.filter(and_(*exclusion_and_conditions))
        except ValueError:
            pass
    
    # Filter by status - support both UUID and string label
    if status:
        try:
            status_uuid = uuid.UUID(str(status))
            # Get the label from SettingItem to also match by status_label
            from ..models.models import SettingItem
            status_item = db.query(SettingItem).filter(SettingItem.id == status_uuid).first()
            status_label = status_item.label if status_item else None
            
            # Match by status_id OR (if status_id is null, match by status_label)
            if status_label:
                query = query.filter(or_(
                    Project.status_id == status_uuid,
                    (Project.status_id.is_(None)) & (Project.status_label == status_label)
                ))
            else:
                # If we can't find the SettingItem, just try status_id
                query = query.filter(Project.status_id == status_uuid)
        except (ValueError, AttributeError):
            # If status is not a valid UUID, try matching by status_label string
            query = query.filter(Project.status_label == status)
    
    # Filter by status (exclusion)
    if status_not:
        try:
            status_uuid = uuid.UUID(str(status_not))
            # Get the label from SettingItem to also match by status_label
            from ..models.models import SettingItem
            status_item = db.query(SettingItem).filter(SettingItem.id == status_uuid).first()
            status_label = status_item.label if status_item else None
            
            # Exclude: NOT ((status_id == status_uuid) OR (status_id is None AND status_label == status_label))
            # Using De Morgan: (status_id != status_uuid) AND (status_id is not None OR status_label != status_label)
            if status_label:
                # Case 1: status_id is not None -> exclude if status_id != status_uuid
                # Case 2: status_id is None -> exclude if status_label != status_label
                query = query.filter(
                    or_(
                        and_(
                            Project.status_id.isnot(None),
                            Project.status_id != status_uuid
                        ),
                        and_(
                            Project.status_id.is_(None),
                            Project.status_label != status_label
                        )
                    )
                )
            else:
                # If we can't find the SettingItem, just exclude by status_id
                query = query.filter(Project.status_id != status_uuid)
        except (ValueError, AttributeError):
            # If status is not a valid UUID, try excluding by status_label string
            query = query.filter(Project.status_label != status_not)
    
    # Filter by estimator
    if estimator_id:
        try:
            estimator_uuid = uuid.UUID(estimator_id)
            query = query.filter(Project.estimator_id == estimator_uuid)
        except ValueError:
            pass
    
    # Filter by estimator (exclusion)
    if estimator_id_not:
        try:
            estimator_uuid = uuid.UUID(estimator_id_not)
            query = query.filter(Project.estimator_id != estimator_uuid)
        except ValueError:
            pass
    
    # Filter by ETA date range
    if eta_start:
        try:
            from datetime import datetime
            eta_start_d = datetime.strptime(eta_start, "%Y-%m-%d").date()
            query = query.filter(cast(Project.date_eta, Date) >= eta_start_d)
        except Exception:
            pass
    
    if eta_end:
        try:
            from datetime import datetime
            eta_end_d = datetime.strptime(eta_end, "%Y-%m-%d").date()
            query = query.filter(cast(Project.date_eta, Date) <= eta_end_d)
        except Exception:
            pass
    
    # Filter by cost_estimated range
    if value_min is not None:
        query = query.filter(Project.cost_estimated >= value_min)
    
    if value_max is not None:
        query = query.filter(Project.cost_estimated <= value_max)
    
    # Search - include client name if client relation exists
    if q:
        from ..models.models import Client
        query = query.outerjoin(Client, Project.client_id == Client.id)
        query = query.filter(
            or_(
                Project.name.ilike(f"%{q}%"),
                Project.code.ilike(f"%{q}%"),
                Client.display_name.ilike(f"%{q}%"),
                Client.name.ilike(f"%{q}%")
            )
        )
    
    projects = query.order_by(Project.created_at.desc()).limit(limit).all()

    # Build cover_image_url for cards (same source priority as General Information)
    project_ids = [p.id for p in projects]
    client_ids = list(set([p.client_id for p in projects if getattr(p, 'client_id', None)]))

    legacy_categories = {
        "project-cover-derived",
        "project-cover",
        "cover",
        "hero-cover",
        "opportunity-cover-derived",
        "opportunity-cover",
    }

    cover_images: dict[str, ClientFile] = {}
    if project_ids and client_ids:
        cover_files = db.query(ClientFile).filter(ClientFile.client_id.in_(client_ids)).order_by(ClientFile.uploaded_at.desc()).all()
        file_object_ids = [cf.file_object_id for cf in cover_files]
        file_objects: dict[str, FileObject] = {}
        if file_object_ids:
            fos = db.query(FileObject).filter(FileObject.id.in_(file_object_ids)).all()
            for fo in fos:
                file_objects[str(fo.id)] = fo

        project_id_set = set([str(pid) for pid in project_ids])
        for cf in cover_files:
            fo = file_objects.get(str(cf.file_object_id))
            if not fo or not getattr(fo, "project_id", None):
                continue
            pid = str(fo.project_id)
            if pid not in project_id_set:
                continue
            ct = getattr(fo, "content_type", None) or ""
            if not ct.startswith("image/"):
                continue
            cat = (cf.category or "").lower().strip()
            # Only accept explicit legacy cover categories (do NOT fall back to any image)
            if cat not in legacy_categories:
                continue
            if pid not in cover_images:
                cover_images[pid] = cf
            elif cat == "project-cover-derived":
                # Strong preference
                cover_images[pid] = cf

    # Latest proposal cover per project (batch)
    proposal_cover_by_project: dict[str, str] = {}
    if project_ids:
        rows = db.query(Proposal).filter(Proposal.project_id.in_(project_ids)).order_by(Proposal.created_at.desc()).all()
        for r in rows:
            pid = str(getattr(r, "project_id", None) or "")
            if not pid or pid in proposal_cover_by_project:
                continue
            data = getattr(r, "data", None) or {}
            if isinstance(data, dict):
                foid = data.get("cover_file_object_id")
                if foid:
                    proposal_cover_by_project[pid] = str(foid)

    # Fetch estimator and onsite lead names in batch
    estimator_ids = list(set([getattr(p, 'estimator_id', None) for p in projects if getattr(p, 'estimator_id', None)]))
    onsite_lead_ids = list(set([getattr(p, 'onsite_lead_id', None) for p in projects if getattr(p, 'onsite_lead_id', None)]))
    all_user_ids = list(set(estimator_ids + onsite_lead_ids))
    
    users_map = {}
    if all_user_ids:
        users = db.query(User).filter(User.id.in_(all_user_ids)).all()
        for user in users:
            ep = db.query(EmployeeProfile).filter(EmployeeProfile.user_id == user.id).first()
            name = (getattr(ep, 'preferred_name', None) or '').strip() if ep else ''
            if not name:
                first = (getattr(ep, 'first_name', None) or '').strip() if ep else ''
                last = (getattr(ep, 'last_name', None) or '').strip() if ep else ''
                name = ' '.join([x for x in [first, last] if x])
            users_map[str(user.id)] = name or None
    
    # Fetch latest estimates and calculate Grand Total (Final Total with GST) for each project
    estimated_values_map = {}
    if project_ids:
        import json
        # Get latest estimate for each project
        estimates = db.query(Estimate).filter(Estimate.project_id.in_(project_ids)).order_by(Estimate.created_at.desc()).all()
        for est in estimates:
            pid_str = str(est.project_id)
            if pid_str not in estimated_values_map:
                # Calculate Grand Total (Final Total with GST) - matching estimate.py logic exactly
                if est.notes:
                    try:
                        ui_state = json.loads(est.notes)
                        pst_rate = ui_state.get('pst_rate', 7.0)
                        gst_rate = ui_state.get('gst_rate', 5.0)
                        profit_rate = ui_state.get('profit_rate', 20.0)
                        global_markup = ui_state.get('markup', est.markup or 0.0)
                        
                        items = db.query(EstimateItem).filter(EstimateItem.estimate_id == est.id).all()
                        item_extras_map = ui_state.get('item_extras', {})
                        
                        # Calculate totals considering item types and markups (matching estimate.py logic exactly)
                        total = 0.0
                        total_with_markup = 0.0
                        taxable_total_with_markup = 0.0
                        
                        for item in items:
                            item_key = f'item_{item.id}'
                            extras = item_extras_map.get(item_key, {})
                            item_type = item.item_type or 'product'
                            taxable = extras.get('taxable', True)  # Default to True if not specified
                            item_markup = extras.get('markup')  # Individual item markup (can be None)
                            
                            # Calculate item total without markup
                            if item_type == 'labour' and extras.get('labour_journey_type'):
                                if extras['labour_journey_type'] == 'contract':
                                    item_total = (extras.get('labour_journey', 0) or 0) * (item.unit_price or 0.0)
                                else:
                                    item_total = (extras.get('labour_journey', 0) or 0) * (extras.get('labour_men', 0) or 0) * (item.unit_price or 0.0)
                            else:
                                item_total = (item.quantity or 0.0) * (item.unit_price or 0.0)
                            
                            # Apply markup (individual or global)
                            markup_percent = item_markup if item_markup is not None else global_markup
                            item_total_with_markup = item_total * (1 + (markup_percent / 100))
                            
                            total += item_total
                            total_with_markup += item_total_with_markup
                            
                            # PST only applies to taxable items (with markup)
                            if taxable:
                                taxable_total_with_markup += item_total_with_markup
                        
                        # Calculate PST on taxable items with markup
                        pst = taxable_total_with_markup * (pst_rate / 100)
                        
                        # Subtotal = total with markup + PST
                        subtotal = total_with_markup + pst
                        
                        # Profit is calculated on subtotal
                        profit_value = subtotal * (profit_rate / 100)
                        
                        # Final total = subtotal + profit
                        final_total = subtotal + profit_value
                        
                        # GST is calculated on final total
                        gst = final_total * (gst_rate / 100)
                        
                        # Grand total = final total + GST
                        grand_total = final_total + gst
                        
                        estimated_values_map[pid_str] = grand_total
                    except Exception:
                        # If calculation fails, use total_cost as fallback
                        estimated_values_map[pid_str] = est.total_cost

    out = []
    for p in projects:
        pid = str(p.id)
        cover_url = None

        # 1) Manual new field
        if getattr(p, "image_manually_set", False) and getattr(p, "image_file_object_id", None):
            cover_url = f"/files/{str(p.image_file_object_id)}/thumbnail?w=400"
        # 2) Legacy manual cover from files
        if not cover_url and pid in cover_images:
            cf = cover_images[pid]
            ts = cf.uploaded_at.isoformat() if getattr(cf, "uploaded_at", None) else None
            tparam = f"&t={ts}" if ts else ""
            cover_url = f"/files/{str(cf.file_object_id)}/thumbnail?w=400{tparam}"
        # 3) Synced image field (proposal auto or other)
        if not cover_url and getattr(p, "image_file_object_id", None):
            cover_url = f"/files/{str(p.image_file_object_id)}/thumbnail?w=400"
        # 4) Latest proposal cover (if not synced yet)
        if not cover_url and pid in proposal_cover_by_project:
            cover_url = f"/files/{proposal_cover_by_project[pid]}/thumbnail?w=400"
        # 5) Default blueprint
        if not cover_url:
            cover_url = "/ui/assets/placeholders/project.png"

        opp_dict = {
            "id": str(p.id),
            "code": p.code,
            "name": p.name,
            "slug": p.slug,
            "client_id": str(p.client_id) if getattr(p, 'client_id', None) else None,
            "created_at": p.created_at.isoformat() if getattr(p, 'created_at', None) else None,
            "date_start": p.date_start.isoformat() if getattr(p, 'date_start', None) else None,
            "date_eta": getattr(p, 'date_eta', None).isoformat() if getattr(p, 'date_eta', None) else None,
            "date_end": p.date_end.isoformat() if getattr(p, 'date_end', None) else None,
            "progress": getattr(p, 'progress', None),
            "status_label": getattr(p, 'status_label', None),
            "division_ids": getattr(p, 'division_ids', None),  # Legacy
            "project_division_ids": getattr(p, 'project_division_ids', None),
            "cost_estimated": getattr(p, 'cost_estimated', None),
            "is_bidding": True,
            "cover_image_url": cover_url,
            "estimator_id": str(getattr(p, 'estimator_id', None)) if getattr(p, 'estimator_id', None) else None,
            "estimator_ids": [str(eid) for eid in (getattr(p, 'estimator_ids', None) or [])] if getattr(p, 'estimator_ids', None) else ([str(getattr(p, 'estimator_id', None))] if getattr(p, 'estimator_id', None) else []),
            "onsite_lead_id": getattr(p, 'onsite_lead_id', None),
        }
        
        # Add estimator name if found
        estimator_id_str = str(getattr(p, 'estimator_id', None)) if getattr(p, 'estimator_id', None) else None
        if estimator_id_str and estimator_id_str in users_map:
            opp_dict["estimator_name"] = users_map[estimator_id_str]
        
        # Add onsite lead name if found
        onsite_lead_id_str = str(getattr(p, 'onsite_lead_id', None)) if getattr(p, 'onsite_lead_id', None) else None
        if onsite_lead_id_str and onsite_lead_id_str in users_map:
            opp_dict["onsite_lead_name"] = users_map[onsite_lead_id_str]
        
        # Add estimated value from estimate (Final Total with GST) if available, otherwise use cost_estimated
        if pid in estimated_values_map:
            opp_dict["cost_estimated"] = estimated_values_map[pid]
        
        out.append(opp_dict)

    return out


@router.get("/business/projects")
def business_projects(
    division_id: Optional[str] = None,
    division_id_not: Optional[str] = None,
    subdivision_id: Optional[str] = None,
    status: Optional[str] = None,
    status_not: Optional[str] = None,
    q: Optional[str] = None,
    min_value: Optional[float] = None,
    client_id: Optional[str] = None,
    client_id_not: Optional[str] = None,
    date_start: Optional[str] = None,
    date_end: Optional[str] = None,
    estimator_id: Optional[str] = None,
    estimator_id_not: Optional[str] = None,
    eta_start: Optional[str] = None,
    eta_end: Optional[str] = None,
    value_min: Optional[int] = None,
    value_max: Optional[int] = None,
    limit: int = 100,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """Get projects filtered by project division/subdivision"""
    query = db.query(Project).filter(Project.is_bidding == False)
    
    # Filter by client
    if client_id:
        try:
            client_uuid = uuid.UUID(client_id)
            query = query.filter(Project.client_id == client_uuid)
        except ValueError:
            pass
    
    # Filter by client (exclusion)
    if client_id_not:
        try:
            client_uuid = uuid.UUID(client_id_not)
            query = query.filter(Project.client_id != client_uuid)
        except ValueError:
            pass
    
    # Filter by date range (Start Date shown on cards)
    # The UI displays: (project.date_start || project.created_at).slice(0,10)
    # So we filter by COALESCE(date_start, created_at) using DATE-only comparisons.
    effective_start_dt = func.coalesce(Project.date_start, Project.created_at)
    if date_start:
        try:
            from datetime import datetime
            start_d = datetime.strptime(date_start, "%Y-%m-%d").date()
            query = query.filter(cast(effective_start_dt, Date) >= start_d)
        except Exception:
            pass

    if date_end:
        try:
            from datetime import datetime
            end_d = datetime.strptime(date_end, "%Y-%m-%d").date()
            query = query.filter(cast(effective_start_dt, Date) <= end_d)
        except Exception:
            pass
    
    # Filter by project division/subdivision
    if subdivision_id:
        try:
            subdiv_uuid = uuid.UUID(subdivision_id)
            query = query.filter(
                or_(
                    cast(Project.project_division_ids, String).like(f'%{subdivision_id}%'),
                    # Legacy support
                    Project.division_id == subdiv_uuid,
                    cast(Project.division_ids, String).like(f'%{subdivision_id}%')
                )
            )
        except ValueError:
            pass
    elif division_id:
        # Filter by main division (includes all its subdivisions) - same logic as dashboard
        try:
            div_uuid = uuid.UUID(division_id)
            # Get all subdivision IDs for this division
            from ..models.models import SettingList, SettingItem
            divisions_list = db.query(SettingList).filter(SettingList.name == "project_divisions").first()
            
            all_conditions = []
            
            if divisions_list:
                # Get division and all its subdivisions
                division_items = db.query(SettingItem).filter(
                    SettingItem.list_id == divisions_list.id,
                    or_(
                        SettingItem.id == div_uuid,
                        SettingItem.parent_id == div_uuid
                    )
                ).all()
                division_ids_list = [str(item.id) for item in division_items]
                
                # Build filter condition for any of these IDs
                conditions = []
                for div_id_str in division_ids_list:
                    conditions.append(cast(Project.project_division_ids, String).like(f'%{div_id_str}%'))
                
                if conditions:
                    all_conditions.append(or_(*conditions))
            
            # Legacy support - combine with OR so it works with both old and new format
            all_conditions.append(
                or_(
                    Project.division_id == div_uuid,
                    cast(Project.division_ids, String).like(f'%{division_id}%')
                )
            )
            
            # Apply all conditions with OR (project matches if it has division in any format)
            if all_conditions:
                query = query.filter(or_(*all_conditions))
        except ValueError:
            pass
    
    # Filter by division (exclusion)
    if division_id_not:
        try:
            div_uuid = uuid.UUID(division_id_not)
            from ..models.models import SettingList, SettingItem
            divisions_list = db.query(SettingList).filter(SettingList.name == "project_divisions").first()
            
            exclusion_and_conditions = []
            
            if divisions_list:
                division_items = db.query(SettingItem).filter(
                    SettingItem.list_id == divisions_list.id,
                    or_(
                        SettingItem.id == div_uuid,
                        SettingItem.parent_id == div_uuid
                    )
                ).all()
                division_ids_to_exclude = [str(item.id) for item in division_items]
                
                for ex_div_id_str in division_ids_to_exclude:
                    try:
                        # NOT (has division in any format)
                        not_has_division = and_(
                            Project.division_id != uuid.UUID(ex_div_id_str),
                            or_(
                                cast(Project.project_division_ids, String).notlike(f'%{ex_div_id_str}%'),
                                Project.project_division_ids.is_(None)
                            ),
                            or_(
                                cast(Project.division_ids, String).notlike(f'%{ex_div_id_str}%'),
                                Project.division_ids.is_(None)
                            )
                        )
                        exclusion_and_conditions.append(not_has_division)
                    except ValueError:
                        pass
            
            if exclusion_and_conditions:
                query = query.filter(and_(*exclusion_and_conditions))
        except ValueError:
            pass
    
    # Filter by status
    if status:
        try:
            status_uuid = uuid.UUID(str(status))
            query = query.filter(Project.status_id == status_uuid)
        except ValueError:
            query = query.filter(Project.status_label == status)
    
    # Filter by status (exclusion)
    if status_not:
        try:
            status_uuid = uuid.UUID(str(status_not))
            from ..models.models import SettingItem
            status_item = db.query(SettingItem).filter(SettingItem.id == status_uuid).first()
            status_label = status_item.label if status_item else None
            
            if status_label:
                query = query.filter(
                    or_(
                        and_(
                            Project.status_id.isnot(None),
                            Project.status_id != status_uuid
                        ),
                        and_(
                            Project.status_id.is_(None),
                            Project.status_label != status_label
                        )
                    )
                )
            else:
                query = query.filter(Project.status_id != status_uuid)
        except (ValueError, AttributeError):
            query = query.filter(Project.status_label != status_not)
    
    # Filter by estimator
    if estimator_id:
        try:
            estimator_uuid = uuid.UUID(estimator_id)
            query = query.filter(Project.estimator_id == estimator_uuid)
        except ValueError:
            pass
    
    # Filter by estimator (exclusion)
    if estimator_id_not:
        try:
            estimator_uuid = uuid.UUID(estimator_id_not)
            query = query.filter(Project.estimator_id != estimator_uuid)
        except ValueError:
            pass
    
    # Filter by ETA date range
    if eta_start:
        try:
            from datetime import datetime
            eta_start_d = datetime.strptime(eta_start, "%Y-%m-%d").date()
            query = query.filter(cast(Project.date_eta, Date) >= eta_start_d)
        except Exception:
            pass
    
    if eta_end:
        try:
            from datetime import datetime
            eta_end_d = datetime.strptime(eta_end, "%Y-%m-%d").date()
            query = query.filter(cast(Project.date_eta, Date) <= eta_end_d)
        except Exception:
            pass
    
    # Filter by cost_estimated range (value_min/value_max)
    if value_min is not None:
        query = query.filter(Project.cost_estimated >= value_min)
    
    if value_max is not None:
        query = query.filter(Project.cost_estimated <= value_max)
    
    # Search (by name, code, or client name)
    if q:
        # First, find client IDs that match the search query
        # Note: Client is imported at the top, but there's a conditional import later that causes UnboundLocalError
        # So we use the global Client directly by ensuring it's not shadowed
        matching_client_ids = db.query(Client.id).filter(
            or_(
                Client.name.ilike(f"%{q}%"),
                Client.display_name.ilike(f"%{q}%")
            )
        )
        
        # Get list of matching client IDs
        matching_ids = [str(cid[0]) for cid in matching_client_ids.all()]
        
        # Then filter projects by name, code, or client_id in matching clients
        search_conditions = [
            Project.name.ilike(f"%{q}%"),
            Project.code.ilike(f"%{q}%")
        ]
        
        # Add client_id filter if we have matching clients
        if matching_ids:
            try:
                # Convert to UUIDs for comparison
                matching_uuids = [uuid.UUID(cid) for cid in matching_ids]
                search_conditions.append(Project.client_id.in_(matching_uuids))
            except ValueError:
                pass
        
        query = query.filter(or_(*search_conditions))
    
    # Get projects first (before value filtering if needed)
    projects = query.order_by(Project.created_at.desc()).limit(limit * 2 if min_value else limit).all()
    
    # Filter by minimum value (considering Grand Total from estimates)
    if min_value is not None:
        try:
            min_val = float(min_value)
            import json
            
            filtered_projects = []
            for p in projects:
                project_value = None
                
                # First, try to get Grand Total from estimate (using same logic as estimate.py)
                estimate = db.query(Estimate).filter(Estimate.project_id == p.id).order_by(Estimate.created_at.desc()).first()
                if estimate and estimate.notes:
                    try:
                        ui_state = json.loads(estimate.notes)
                        pst_rate = ui_state.get('pst_rate', 7.0)
                        gst_rate = ui_state.get('gst_rate', 5.0)
                        profit_rate = ui_state.get('profit_rate', 20.0)
                        markup = estimate.markup or 0.0
                        
                        items = db.query(EstimateItem).filter(EstimateItem.estimate_id == estimate.id).all()
                        item_extras_map = ui_state.get('item_extras', {})
                        
                        # Calculate total and taxable total (simplified version matching estimate.py)
                        total = 0.0
                        taxable_total = 0.0
                        for item in items:
                            # Calculate item total based on item type
                            if item.item_type == 'labour' and item_extras_map.get(f'item_{item.id}', {}).get('labour_journey_type'):
                                extras = item_extras_map.get(f'item_{item.id}', {})
                                if extras.get('labour_journey_type') == 'contract':
                                    item_total = (extras.get('labour_journey', 0) or 0) * (item.unit_price or 0.0)
                                else:
                                    item_total = (extras.get('labour_journey', 0) or 0) * (extras.get('labour_men', 0) or 0) * (item.unit_price or 0.0)
                            else:
                                item_total = (item.quantity or 0.0) * (item.unit_price or 0.0)
                            
                            total += item_total
                            # PST only applies to taxable items
                            if item_extras_map.get(f'item_{item.id}', {}).get('taxable', True) is not False:
                                taxable_total += item_total
                        
                        # Calculate PST, subtotal, markup, profit, total estimate, GST, grand total
                        pst = taxable_total * (pst_rate / 100)
                        subtotal = total + pst
                        markup_value = subtotal * (markup / 100)
                        profit_value = subtotal * (profit_rate / 100)
                        final_total = subtotal + markup_value + profit_value
                        gst = final_total * (gst_rate / 100)
                        project_value = final_total + gst
                    except Exception as e:
                        # If calculation fails, try estimate.total_cost
                        project_value = getattr(estimate, 'total_cost', None)
                
                # Fallback to service_value or cost_estimated
                if project_value is None:
                    project_value = getattr(p, 'service_value', None) or getattr(p, 'cost_estimated', None)
                
                # Include project if value >= min_value
                if project_value and project_value >= min_val:
                    filtered_projects.append(p)
                    if len(filtered_projects) >= limit:
                        break
            
            projects = filtered_projects
        except (ValueError, TypeError):
            pass
    
    # Get all project IDs and client IDs for efficient batch loading
    project_ids = [p.id for p in projects[:limit]]
    client_ids = list(set([p.client_id for p in projects[:limit] if getattr(p, 'client_id', None)]))
    
    # Fetch legacy cover images in one query (ONLY explicit cover categories; do NOT fall back to any image)
    cover_images = {}
    if project_ids and client_ids:
        from ..models.models import ClientFile, FileObject
        # Find all client files for these clients
        cover_files = db.query(ClientFile).filter(
            ClientFile.client_id.in_(client_ids)
        ).all()
        
        # Get file objects for these files to check project_id
        file_object_ids = [cf.file_object_id for cf in cover_files]
        file_objects = {}
        if file_object_ids:
            fos = db.query(FileObject).filter(FileObject.id.in_(file_object_ids)).all()
            for fo in fos:
                file_objects[str(fo.id)] = fo
        
        legacy_categories = {
            'project-cover-derived',
            'project-cover',
            'cover',
            'hero-cover',
            'opportunity-cover-derived',
            'opportunity-cover',
        }

        # Build map: project_id -> legacy cover file (by category only)
        for cf in cover_files:
            fo = file_objects.get(str(cf.file_object_id))
            if not fo or not getattr(fo, 'project_id', None):
                continue
            
            project_id_str = str(fo.project_id)
            if project_id_str not in [str(pid) for pid in project_ids]:
                continue
            
            category_lower = (cf.category or '').lower().strip()
            ct = getattr(fo, 'content_type', None) or ''
            if not ct.startswith('image/'):
                continue

            # Only accept explicit legacy cover categories.
            if category_lower not in legacy_categories:
                continue

            # Prefer project-cover-derived over others if multiple exist
            if project_id_str not in cover_images:
                cover_images[project_id_str] = (cf, fo)
            elif category_lower == 'project-cover-derived':
                cover_images[project_id_str] = (cf, fo)
    
    # Fetch client information in one query
    clients_map = {}
    if client_ids:
        # Client is already imported at the top of the file
        clients = db.query(Client).filter(Client.id.in_(client_ids)).all()
        for client in clients:
            clients_map[str(client.id)] = {
                "id": str(client.id),
                "name": client.name,
                "display_name": client.display_name,
            }
    
    # Fetch estimator and onsite lead names in batch
    estimator_ids = list(set([getattr(p, 'estimator_id', None) for p in projects[:limit] if getattr(p, 'estimator_id', None)]))
    onsite_lead_ids = list(set([getattr(p, 'onsite_lead_id', None) for p in projects[:limit] if getattr(p, 'onsite_lead_id', None)]))
    all_user_ids = list(set(estimator_ids + onsite_lead_ids))
    
    users_map = {}
    if all_user_ids:
        users = db.query(User).filter(User.id.in_(all_user_ids)).all()
        for user in users:
            ep = db.query(EmployeeProfile).filter(EmployeeProfile.user_id == user.id).first()
            name = (getattr(ep, 'preferred_name', None) or '').strip() if ep else ''
            if not name:
                first = (getattr(ep, 'first_name', None) or '').strip() if ep else ''
                last = (getattr(ep, 'last_name', None) or '').strip() if ep else ''
                name = ' '.join([x for x in [first, last] if x])
            users_map[str(user.id)] = name or None
    
    # Fetch latest estimates and calculate Grand Total (Final Total with GST) for each project
    estimates_map = {}
    estimated_values_map = {}
    if project_ids:
        import json
        # Get latest estimate for each project
        estimates = db.query(Estimate).filter(Estimate.project_id.in_(project_ids)).order_by(Estimate.created_at.desc()).all()
        for est in estimates:
            pid_str = str(est.project_id)
            if pid_str not in estimates_map:
                estimates_map[pid_str] = est
                # Calculate Grand Total (Final Total with GST) - matching estimate.py logic exactly
                if est.notes:
                    try:
                        ui_state = json.loads(est.notes)
                        pst_rate = ui_state.get('pst_rate', 7.0)
                        gst_rate = ui_state.get('gst_rate', 5.0)
                        profit_rate = ui_state.get('profit_rate', 20.0)
                        global_markup = ui_state.get('markup', est.markup or 0.0)
                        
                        items = db.query(EstimateItem).filter(EstimateItem.estimate_id == est.id).all()
                        item_extras_map = ui_state.get('item_extras', {})
                        
                        # Calculate totals considering item types and markups (matching estimate.py logic exactly)
                        total = 0.0
                        total_with_markup = 0.0
                        taxable_total_with_markup = 0.0
                        
                        for item in items:
                            item_key = f'item_{item.id}'
                            extras = item_extras_map.get(item_key, {})
                            item_type = item.item_type or 'product'
                            taxable = extras.get('taxable', True)  # Default to True if not specified
                            item_markup = extras.get('markup')  # Individual item markup (can be None)
                            
                            # Calculate item total without markup
                            if item_type == 'labour' and extras.get('labour_journey_type'):
                                if extras['labour_journey_type'] == 'contract':
                                    item_total = (extras.get('labour_journey', 0) or 0) * (item.unit_price or 0.0)
                                else:
                                    item_total = (extras.get('labour_journey', 0) or 0) * (extras.get('labour_men', 0) or 0) * (item.unit_price or 0.0)
                            else:
                                item_total = (item.quantity or 0.0) * (item.unit_price or 0.0)
                            
                            # Apply markup (individual or global)
                            markup_percent = item_markup if item_markup is not None else global_markup
                            item_total_with_markup = item_total * (1 + (markup_percent / 100))
                            
                            total += item_total
                            total_with_markup += item_total_with_markup
                            
                            # PST only applies to taxable items (with markup)
                            if taxable:
                                taxable_total_with_markup += item_total_with_markup
                        
                        # Calculate PST on taxable items with markup
                        pst = taxable_total_with_markup * (pst_rate / 100)
                        
                        # Subtotal = total with markup + PST
                        subtotal = total_with_markup + pst
                        
                        # Profit is calculated on subtotal
                        profit_value = subtotal * (profit_rate / 100)
                        
                        # Final total = subtotal + profit
                        final_total = subtotal + profit_value
                        
                        # GST is calculated on final total
                        gst = final_total * (gst_rate / 100)
                        
                        # Grand total = final total + GST
                        grand_total = final_total + gst
                        
                        estimated_values_map[pid_str] = grand_total
                    except Exception:
                        # If calculation fails, use total_cost as fallback
                        estimated_values_map[pid_str] = est.total_cost
    
    # Latest proposal cover per project (batch) - used if cover isn't already present
    proposal_cover_by_project: dict[str, str] = {}
    if project_ids:
        rows = db.query(Proposal).filter(Proposal.project_id.in_(project_ids)).order_by(Proposal.created_at.desc()).all()
        for r in rows:
            pid = str(getattr(r, "project_id", None) or "")
            if not pid or pid in proposal_cover_by_project:
                continue
            data = getattr(r, "data", None) or {}
            if isinstance(data, dict):
                foid = data.get("cover_file_object_id")
                if foid:
                    proposal_cover_by_project[pid] = str(foid)

    # Build response with cover images and client info
    result = []
    for p in projects[:limit]:
        # Include division percentages on list cards so they match General Information
        raw_percentages = getattr(p, "project_division_percentages", None)
        percentages_payload = None
        if raw_percentages and isinstance(raw_percentages, dict):
            try:
                percentages_payload = {str(k): v for k, v in raw_percentages.items()}
            except Exception:
                percentages_payload = raw_percentages

        project_dict = {
            "id": str(p.id),
            "code": p.code,
            "name": p.name,
            "slug": p.slug,
            "client_id": str(p.client_id) if getattr(p, 'client_id', None) else None,
            "created_at": p.created_at.isoformat() if getattr(p, 'created_at', None) else None,
            "date_start": p.date_start.isoformat() if getattr(p, 'date_start', None) else None,
            "date_eta": getattr(p, 'date_eta', None).isoformat() if getattr(p, 'date_eta', None) else None,
            "date_end": p.date_end.isoformat() if getattr(p, 'date_end', None) else None,
            "progress": getattr(p, 'progress', None),
            "status_label": getattr(p, 'status_label', None),
            "division_ids": getattr(p, 'division_ids', None),  # Legacy
            "project_division_ids": getattr(p, 'project_division_ids', None),
            "project_division_percentages": percentages_payload,
            "cost_actual": getattr(p, 'cost_actual', None),
            "service_value": getattr(p, 'service_value', None),
            "is_bidding": False,
            "cover_image_url": None,
            "client_name": None,
            "client_display_name": None,
            "estimator_id": str(getattr(p, 'estimator_id', None)) if getattr(p, 'estimator_id', None) else None,
            "estimator_ids": [str(eid) for eid in (getattr(p, 'estimator_ids', None) or [])] if getattr(p, 'estimator_ids', None) else ([str(getattr(p, 'estimator_id', None))] if getattr(p, 'estimator_id', None) else []),
            "project_admin_id": str(getattr(p, 'project_admin_id', None)) if getattr(p, 'project_admin_id', None) else None,
            "onsite_lead_id": getattr(p, 'onsite_lead_id', None),
        }
        
        # Add cover image URL - same priority as General Information
        project_id_str = str(p.id)
        # 1) Manual new field
        if getattr(p, "image_manually_set", False) and getattr(p, "image_file_object_id", None):
            project_dict["cover_image_url"] = f"/files/{str(p.image_file_object_id)}/thumbnail?w=400"
        # 2) Legacy manual cover from files
        if (not project_dict["cover_image_url"]) and project_id_str in cover_images:
            cover_file, _file_object = cover_images[project_id_str]
            timestamp = cover_file.uploaded_at.isoformat() if cover_file.uploaded_at else None
            timestamp_param = f"&t={timestamp}" if timestamp else ""
            project_dict["cover_image_url"] = f"/files/{cover_file.file_object_id}/thumbnail?w=400{timestamp_param}"
        # 3) Synced image field (proposal auto or other)
        if (not project_dict["cover_image_url"]) and getattr(p, "image_file_object_id", None):
            project_dict["cover_image_url"] = f"/files/{str(p.image_file_object_id)}/thumbnail?w=400"
        # 4) Latest proposal cover (if not synced yet)
        if (not project_dict["cover_image_url"]) and project_id_str in proposal_cover_by_project:
            project_dict["cover_image_url"] = f"/files/{proposal_cover_by_project[project_id_str]}/thumbnail?w=400"
        # 5) Default blueprint
        if not project_dict["cover_image_url"]:
            project_dict["cover_image_url"] = "/ui/assets/placeholders/project.png"
        
        # Add client information if found
        client_id_str = str(p.client_id) if getattr(p, 'client_id', None) else None
        if client_id_str and client_id_str in clients_map:
            client_info = clients_map[client_id_str]
            project_dict["client_name"] = client_info.get("name")
            project_dict["client_display_name"] = client_info.get("display_name")
        
        # Add estimator name if found
        estimator_id_str = str(getattr(p, 'estimator_id', None)) if getattr(p, 'estimator_id', None) else None
        if estimator_id_str and estimator_id_str in users_map:
            project_dict["estimator_name"] = users_map[estimator_id_str]
        
        # Add onsite lead name if found
        onsite_lead_id_str = str(getattr(p, 'onsite_lead_id', None)) if getattr(p, 'onsite_lead_id', None) else None
        if onsite_lead_id_str and onsite_lead_id_str in users_map:
            project_dict["onsite_lead_name"] = users_map[onsite_lead_id_str]
        
        # Add estimated value from estimate (Final Total with GST) if available, otherwise use service_value
        if project_id_str in estimated_values_map:
            project_dict["service_value"] = estimated_values_map[project_id_str]
        
        result.append(project_dict)
    
    return result


@router.get("/business/divisions-stats")
def business_divisions_stats(
    division_id: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    mode: Optional[str] = "quantity",
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """Get statistics for each project division, or subdivisions of a specific division"""
    from ..models.models import SettingList, SettingItem
    
    divisions_list = db.query(SettingList).filter(SettingList.name == "project_divisions").first()
    if not divisions_list:
        return []
    
    stats = []
    
    # If division_id is provided, return stats for its subdivisions
    if division_id:
        try:
            div_uuid = uuid.UUID(division_id)
            # Get the selected division
            selected_division = db.query(SettingItem).filter(
                SettingItem.list_id == divisions_list.id,
                SettingItem.id == div_uuid
            ).first()
            
            if not selected_division:
                return []
            
            # Get all subdivisions of this division
            subdivisions = db.query(SettingItem).filter(
                SettingItem.list_id == divisions_list.id,
                SettingItem.parent_id == div_uuid
            ).order_by(SettingItem.sort_index.asc()).all()
            
            # If no subdivisions, return stats for the division itself
            if not subdivisions:
                # Calculate stats for the division itself
                div_id_str = str(selected_division.id)
                conditions = [
                    cast(Project.project_division_ids, String).like(f'%{div_id_str}%'),
                    # Legacy support
                    Project.division_id == selected_division.id,
                    cast(Project.division_ids, String).like(f'%{div_id_str}%')
                ]
                
                opportunities_count = 0
                projects_count = 0
                opportunities_value = 0
                projects_value = 0
                
                opp_query = db.query(Project).filter(
                    Project.is_bidding == True,
                    or_(*conditions)
                )
                proj_query = db.query(Project).filter(
                    Project.is_bidding == False,
                    or_(*conditions)
                )
                
                # Apply date filtering
                effective_start_dt = func.coalesce(Project.date_start, Project.created_at)
                if date_from:
                    try:
                        start_d = datetime.strptime(date_from, "%Y-%m-%d").date()
                        opp_query = opp_query.filter(cast(effective_start_dt, Date) >= start_d)
                        proj_query = proj_query.filter(cast(effective_start_dt, Date) >= start_d)
                    except Exception:
                        pass
                
                if date_to:
                    try:
                        end_d = datetime.strptime(date_to, "%Y-%m-%d").date()
                        opp_query = opp_query.filter(cast(effective_start_dt, Date) <= end_d)
                        proj_query = proj_query.filter(cast(effective_start_dt, Date) <= end_d)
                    except Exception:
                        pass
                
                opportunities_count = opp_query.count()
                projects_count = proj_query.count()
                
                opportunities_profit = 0
                projects_profit = 0
                
                if mode == "value":
                    # Calculate values from estimates, applying division percentages
                    for p in opp_query.all():
                        estimate = db.query(Estimate).filter(Estimate.project_id == p.id).order_by(Estimate.created_at.desc()).first()
                        if estimate:
                            final_total, profit = calculate_estimate_values(estimate, db)
                            if final_total is not None:
                                # Get division percentage for this division
                                percentages = getattr(p, 'project_division_percentages', None)
                                if percentages and isinstance(percentages, dict):
                                    div_percentage = percentages.get(str(selected_division.id), 0) or percentages.get(selected_division.id, 0) or 0
                                    if div_percentage > 0:
                                        opportunities_value += final_total * (div_percentage / 100.0)
                                        if profit is not None:
                                            opportunities_profit += profit * (div_percentage / 100.0)
                                else:
                                    # If no percentages, assume 100% if division matches
                                    opportunities_value += final_total
                                    if profit is not None:
                                        opportunities_profit += profit
                        else:
                            # Fallback to cost_estimated if no estimate
                            opportunities_value += (getattr(p, 'cost_estimated', 0) or 0)
                    
                    for p in proj_query.all():
                        estimate = db.query(Estimate).filter(Estimate.project_id == p.id).order_by(Estimate.created_at.desc()).first()
                        if estimate:
                            final_total, profit = calculate_estimate_values(estimate, db)
                            if final_total is not None:
                                # Get division percentage for this division
                                percentages = getattr(p, 'project_division_percentages', None)
                                if percentages and isinstance(percentages, dict):
                                    div_percentage = percentages.get(str(selected_division.id), 0) or percentages.get(selected_division.id, 0) or 0
                                    if div_percentage > 0:
                                        projects_value += final_total * (div_percentage / 100.0)
                                        if profit is not None:
                                            projects_profit += profit * (div_percentage / 100.0)
                                else:
                                    # If no percentages, assume 100% if division matches
                                    projects_value += final_total
                                    if profit is not None:
                                        projects_profit += profit
                        else:
                            # Fallback to cost_actual if no estimate
                            projects_value += (getattr(p, 'cost_actual', 0) or 0)
                else:
                    # Quantity mode: just count
                    for p in opp_query.all():
                        opportunities_value += (getattr(p, 'cost_estimated', 0) or 0)
                    for p in proj_query.all():
                        projects_value += (getattr(p, 'cost_actual', 0) or 0)
                
                stats.append({
                    "id": str(selected_division.id),
                    "label": selected_division.label,
                    "value": selected_division.value,
                    "opportunities_count": opportunities_count,
                    "projects_count": projects_count,
                    "opportunities_value": opportunities_value,
                    "projects_value": projects_value,
                    "opportunities_profit": opportunities_profit if mode == "value" else None,
                    "projects_profit": projects_profit if mode == "value" else None,
                    "subdivisions": []
                })
                
                return stats
            
            # For each subdivision, calculate stats
            for subdiv in subdivisions:
                subdiv_id_str = str(subdiv.id)
                
                # Count opportunities and projects for this subdivision
                conditions = [
                    cast(Project.project_division_ids, String).like(f'%{subdiv_id_str}%'),
                    # Legacy support
                    Project.division_id == subdiv.id,
                    cast(Project.division_ids, String).like(f'%{subdiv_id_str}%')
                ]
                
                opportunities_count = 0
                projects_count = 0
                opportunities_value = 0
                projects_value = 0
                opportunities_profit = 0
                projects_profit = 0
                
                opp_query = db.query(Project).filter(
                    Project.is_bidding == True,
                    or_(*conditions)
                )
                proj_query = db.query(Project).filter(
                    Project.is_bidding == False,
                    or_(*conditions)
                )
                
                # Apply date filtering
                effective_start_dt = func.coalesce(Project.date_start, Project.created_at)
                if date_from:
                    try:
                        start_d = datetime.strptime(date_from, "%Y-%m-%d").date()
                        opp_query = opp_query.filter(cast(effective_start_dt, Date) >= start_d)
                        proj_query = proj_query.filter(cast(effective_start_dt, Date) >= start_d)
                    except Exception:
                        pass
                
                if date_to:
                    try:
                        end_d = datetime.strptime(date_to, "%Y-%m-%d").date()
                        opp_query = opp_query.filter(cast(effective_start_dt, Date) <= end_d)
                        proj_query = proj_query.filter(cast(effective_start_dt, Date) <= end_d)
                    except Exception:
                        pass
                
                opportunities_count = opp_query.count()
                projects_count = proj_query.count()
                
                if mode == "value":
                    # Calculate values from estimates, applying division percentages
                    for p in opp_query.all():
                        estimate = db.query(Estimate).filter(Estimate.project_id == p.id).order_by(Estimate.created_at.desc()).first()
                        if estimate:
                            final_total, profit = calculate_estimate_values(estimate, db)
                            if final_total is not None:
                                # Get division percentage for this subdivision
                                percentages = getattr(p, 'project_division_percentages', None)
                                if percentages and isinstance(percentages, dict):
                                    subdiv_percentage = percentages.get(str(subdiv.id), 0) or percentages.get(subdiv.id, 0) or 0
                                    if subdiv_percentage > 0:
                                        opportunities_value += final_total * (subdiv_percentage / 100.0)
                                        if profit is not None:
                                            opportunities_profit += profit * (subdiv_percentage / 100.0)
                                else:
                                    # If no percentages, assume 100% if subdivision matches
                                    opportunities_value += final_total
                                    if profit is not None:
                                        opportunities_profit += profit
                        else:
                            # Fallback to cost_estimated if no estimate
                            opportunities_value += (getattr(p, 'cost_estimated', 0) or 0)
                    
                    for p in proj_query.all():
                        estimate = db.query(Estimate).filter(Estimate.project_id == p.id).order_by(Estimate.created_at.desc()).first()
                        if estimate:
                            final_total, profit = calculate_estimate_values(estimate, db)
                            if final_total is not None:
                                # Get division percentage for this subdivision
                                percentages = getattr(p, 'project_division_percentages', None)
                                if percentages and isinstance(percentages, dict):
                                    subdiv_percentage = percentages.get(str(subdiv.id), 0) or percentages.get(subdiv.id, 0) or 0
                                    if subdiv_percentage > 0:
                                        projects_value += final_total * (subdiv_percentage / 100.0)
                                        if profit is not None:
                                            projects_profit += profit * (subdiv_percentage / 100.0)
                                else:
                                    # If no percentages, assume 100% if subdivision matches
                                    projects_value += final_total
                                    if profit is not None:
                                        projects_profit += profit
                        else:
                            # Fallback to cost_actual if no estimate
                            projects_value += (getattr(p, 'cost_actual', 0) or 0)
                else:
                    # Quantity mode: just count (values are still used for display but calculated differently)
                    for p in opp_query.all():
                        opportunities_value += (getattr(p, 'cost_estimated', 0) or 0)
                    for p in proj_query.all():
                        projects_value += (getattr(p, 'cost_actual', 0) or 0)
                
                stats.append({
                    "id": str(subdiv.id),
                    "label": subdiv.label,
                    "value": subdiv.value,
                    "opportunities_count": opportunities_count,
                    "projects_count": projects_count,
                    "opportunities_value": opportunities_value,
                    "projects_value": projects_value,
                    "opportunities_profit": opportunities_profit if mode == "value" else None,
                    "projects_profit": projects_profit if mode == "value" else None,
                    "subdivisions": []  # Subdivisions of subdivisions are not shown
                })
            
            return stats
        except ValueError:
            return []
    
    # Original behavior: Get all main divisions (no parent)
    main_divisions = db.query(SettingItem).filter(
        SettingItem.list_id == divisions_list.id,
        SettingItem.parent_id == None
    ).order_by(SettingItem.sort_index.asc()).all()
    
    for div in main_divisions:
        div_id_str = str(div.id)
        
        # Get all subdivision IDs for this division (including the division itself)
        subdivision_items = db.query(SettingItem).filter(
            SettingItem.list_id == divisions_list.id,
            or_(
                SettingItem.id == div.id,
                SettingItem.parent_id == div.id
            )
        ).all()
        division_ids_list = [str(item.id) for item in subdivision_items]
        
        # Count opportunities and projects for this division
        conditions = []
        for div_id in division_ids_list:
            conditions.append(cast(Project.project_division_ids, String).like(f'%{div_id}%'))
        
        opportunities_count = 0
        projects_count = 0
        opportunities_value = 0
        projects_value = 0
        
        if conditions:
            opp_query = db.query(Project).filter(
                Project.is_bidding == True,
                or_(*conditions)
            )
            proj_query = db.query(Project).filter(
                Project.is_bidding == False,
                or_(*conditions)
            )
            
            # Apply date filtering
            effective_start_dt = func.coalesce(Project.date_start, Project.created_at)
            if date_from:
                try:
                    start_d = datetime.strptime(date_from, "%Y-%m-%d").date()
                    opp_query = opp_query.filter(cast(effective_start_dt, Date) >= start_d)
                    proj_query = proj_query.filter(cast(effective_start_dt, Date) >= start_d)
                except Exception:
                    pass
            
            if date_to:
                try:
                    end_d = datetime.strptime(date_to, "%Y-%m-%d").date()
                    opp_query = opp_query.filter(cast(effective_start_dt, Date) <= end_d)
                    proj_query = proj_query.filter(cast(effective_start_dt, Date) <= end_d)
                except Exception:
                    pass
            
            opportunities_count = opp_query.count()
            projects_count = proj_query.count()
            
            opportunities_profit = 0
            projects_profit = 0
            
            if mode == "value":
                # Calculate values from estimates, applying division percentages
                for p in opp_query.all():
                    estimate = db.query(Estimate).filter(Estimate.project_id == p.id).order_by(Estimate.created_at.desc()).first()
                    if estimate:
                        final_total, profit = calculate_estimate_values(estimate, db)
                        if final_total is not None:
                            # Get division percentage for this division
                            percentages = getattr(p, 'project_division_percentages', None)
                            if percentages and isinstance(percentages, dict):
                                # Sum percentages for this division INCLUDING its subdivisions, since projects may store
                                # allocation at the subdivision level.
                                div_percentage_total = 0.0
                                for div_item_id in division_ids_list:
                                    try:
                                        div_item_uuid = uuid.UUID(div_item_id)
                                    except Exception:
                                        div_item_uuid = None
                                    pct = 0
                                    if div_item_id in percentages:
                                        pct = percentages.get(div_item_id) or 0
                                    elif div_item_uuid is not None and div_item_uuid in percentages:
                                        pct = percentages.get(div_item_uuid) or 0
                                    elif div_item_uuid is not None and str(div_item_uuid) in percentages:
                                        pct = percentages.get(str(div_item_uuid)) or 0
                                    try:
                                        div_percentage_total += float(pct or 0)
                                    except Exception:
                                        pass

                                if div_percentage_total > 0:
                                    opportunities_value += final_total * (div_percentage_total / 100.0)
                                    if profit is not None:
                                        opportunities_profit += profit * (div_percentage_total / 100.0)
                            else:
                                # If no percentages, assume 100% if division matches
                                opportunities_value += final_total
                                if profit is not None:
                                    opportunities_profit += profit
                    else:
                        # Fallback to cost_estimated if no estimate
                        opportunities_value += (getattr(p, 'cost_estimated', 0) or 0)
                
                for p in proj_query.all():
                    estimate = db.query(Estimate).filter(Estimate.project_id == p.id).order_by(Estimate.created_at.desc()).first()
                    if estimate:
                        final_total, profit = calculate_estimate_values(estimate, db)
                        if final_total is not None:
                            # Get division percentage for this division
                            percentages = getattr(p, 'project_division_percentages', None)
                            if percentages and isinstance(percentages, dict):
                                # Sum percentages for this division INCLUDING its subdivisions.
                                div_percentage_total = 0.0
                                for div_item_id in division_ids_list:
                                    try:
                                        div_item_uuid = uuid.UUID(div_item_id)
                                    except Exception:
                                        div_item_uuid = None
                                    pct = 0
                                    if div_item_id in percentages:
                                        pct = percentages.get(div_item_id) or 0
                                    elif div_item_uuid is not None and div_item_uuid in percentages:
                                        pct = percentages.get(div_item_uuid) or 0
                                    elif div_item_uuid is not None and str(div_item_uuid) in percentages:
                                        pct = percentages.get(str(div_item_uuid)) or 0
                                    try:
                                        div_percentage_total += float(pct or 0)
                                    except Exception:
                                        pass

                                if div_percentage_total > 0:
                                    projects_value += final_total * (div_percentage_total / 100.0)
                                    if profit is not None:
                                        projects_profit += profit * (div_percentage_total / 100.0)
                            else:
                                # If no percentages, assume 100% if division matches
                                projects_value += final_total
                                if profit is not None:
                                    projects_profit += profit
                    else:
                        # Fallback to cost_actual if no estimate
                        projects_value += (getattr(p, 'cost_actual', 0) or 0)
            else:
                # Quantity mode: just count
                for p in opp_query.all():
                    opportunities_value += (getattr(p, 'cost_estimated', 0) or 0)
                for p in proj_query.all():
                    projects_value += (getattr(p, 'cost_actual', 0) or 0)
        
        # Get subdivisions
        subdivisions = db.query(SettingItem).filter(
            SettingItem.list_id == divisions_list.id,
            SettingItem.parent_id == div.id
        ).order_by(SettingItem.sort_index.asc()).all()
        
        stats.append({
            "id": str(div.id),
            "label": div.label,
            "value": div.value,
            "opportunities_count": opportunities_count,
            "projects_count": projects_count,
            "opportunities_value": opportunities_value,
            "projects_value": projects_value,
            "opportunities_profit": opportunities_profit if mode == "value" else None,
            "projects_profit": projects_profit if mode == "value" else None,
            "subdivisions": [{
                "id": str(sub.id),
                "label": sub.label,
                "value": sub.value,
            } for sub in subdivisions]
        })
    
    return stats


@router.get("/business/bid-types")
def get_bid_types():
    """Get the structure of bid types with subcategories (deprecated - use /settings/project-divisions instead)"""
    return {
        "Roofing": {
            "SBS": [],
            "Shingles": [],
            "Single Ply": [],
            "Standing Seam Metal": [],
            "Hot Asphalt": [],
            "Cedar": [],
        },
        "Concrete Restoration & Waterproofing": {
            "SBS": [],
            "Liquid Membranes": [],
            "Concrete Surface Prep/Repair": [],
            "Expansion Joints": [],
            "Traffic Membranes": [],
        },
        "Cladding & Exterior Finishes": {
            "Steel Cladding": [],
            "ACM Panels": [],
            "Fibre Cement": [],
            "Phenolic": [],
            "Custom": [],
        },
        "Repairs & Maintenance": {},
        "Additional Services": {
            "Mechanical": [],
            "Electrical": [],
            "Carpentry": [],
            "Welding & Custom Fabrication": [],
            "Structural Upgrading": [],
            "Solar PV": [],
            "Green Roofing": [],
        },
    }

