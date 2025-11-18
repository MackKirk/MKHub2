from fastapi import APIRouter, Depends, HTTPException, Body
import uuid
from sqlalchemy.orm import Session
from sqlalchemy.exc import ProgrammingError
from typing import Optional, List

from ..db import get_db
from ..models.models import Client, ClientContact, ClientSite, ClientFile, FileObject, ClientFolder, ClientDocument, Project, Proposal
import mimetypes
from ..schemas.clients import (
    ClientCreate, ClientResponse,
    ClientContactCreate, ClientContactResponse,
    ClientSiteCreate, ClientSiteResponse,
)
from ..auth.security import require_permissions


router = APIRouter(prefix="/clients", tags=["clients"])


@router.post("", response_model=ClientResponse)
def create_client(
    payload: ClientCreate, 
    create_default_folders: bool = False,
    db: Session = Depends(get_db), 
    _=Depends(require_permissions("clients:write"))
):
    try:
        data = payload.dict(exclude_unset=True)
        # Drop explicit nulls to avoid touching columns that might not exist in older DBs
        data = {k: v for k, v in data.items() if v is not None}
        # Ensure a name is always present (display_name fallback)
        if not data.get("name"):
            data["name"] = data.get("display_name") or "client"
        # Ensure client code uniqueness by simple slug if missing
        if not data.get("code"):
            base = (data.get("name") or "client").lower().replace(" ", "-")[:20]
            code = base
            i = 1
            while db.query(Client).filter(Client.code == code).first():
                code = f"{base}-{i}"
                i += 1
            data["code"] = code
        c = Client(**data)
        db.add(c)
        db.commit()
        db.refresh(c)
        
        # Optionally create default folder structure at client root
        if create_default_folders:
            try:
                create_default_folders_for_parent(db, c.id, None, None)
            except Exception:
                # If folder creation fails, don't fail client creation
                pass
        
        return c
    except Exception as e:
        db.rollback()
        # Expose error detail to aid debugging of prod schema mismatches
        raise HTTPException(status_code=400, detail=f"Create failed: {e}")


@router.get("", response_model=List[ClientResponse])
def list_clients(city: Optional[str] = None, status: Optional[str] = None, type: Optional[str] = None, q: Optional[str] = None, db: Session = Depends(get_db), _=Depends(require_permissions("clients:read"))):
    query = db.query(Client)
    # Exclude system clients (e.g., "Company Files") from normal customer listings
    query = query.filter(Client.is_system == False)
    
    if city:
        query = query.filter(Client.city == city)
    if status:
        query = query.filter(Client.status_id == status)
    if type:
        query = query.filter(Client.type_id == type)
    if q:
        # Search over display_name or name
        query = query.filter((Client.name.ilike(f"%{q}%")) | (Client.display_name.ilike(f"%{q}%")))
    
    # Try to execute the query, retry without is_system filter if column doesn't exist
    try:
        return query.order_by(Client.created_at.desc()).limit(500).all()
    except ProgrammingError as e:
        # If the error is about missing is_system column, retry without that filter
        error_msg = str(e.orig) if hasattr(e, 'orig') else str(e)
        if 'is_system' in error_msg and 'does not exist' in error_msg:
            query = db.query(Client)
            if city:
                query = query.filter(Client.city == city)
            if status:
                query = query.filter(Client.status_id == status)
            if type:
                query = query.filter(Client.type_id == type)
            if q:
                query = query.filter((Client.name.ilike(f"%{q}%")) | (Client.display_name.ilike(f"%{q}%")))
            return query.order_by(Client.created_at.desc()).limit(500).all()
        raise


@router.get("/{client_id}", response_model=ClientResponse)
def get_client(client_id: str, db: Session = Depends(get_db), _=Depends(require_permissions("clients:read"))):
    c = db.query(Client).filter(Client.id == client_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Not found")
    return c


@router.patch("/{client_id}")
def update_client(client_id: str, payload: dict, db: Session = Depends(get_db), _=Depends(require_permissions("clients:write"))):
    c = db.query(Client).filter(Client.id == client_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Not found")
    for k, v in payload.items():
        setattr(c, k, v)
    db.commit()
    return {"status": "ok"}


@router.delete("/{client_id}")
def delete_client(client_id: str, db: Session = Depends(get_db), _=Depends(require_permissions("clients:write"))):
    c = db.query(Client).filter(Client.id == client_id).first()
    if not c:
        return {"status": "ok"}
    # Check for related projects and proposals - these are NOT cascade deleted
    projects_count = db.query(Project).filter(Project.client_id == client_id).count()
    proposals_count = db.query(Proposal).filter(Proposal.client_id == client_id).count()
    if projects_count > 0 or proposals_count > 0:
        raise HTTPException(
            status_code=400, 
            detail=f"Cannot delete client: {projects_count} project(s) and {proposals_count} proposal(s) still exist. Please delete or reassign them first."
        )
    # The following will be cascade deleted automatically:
    # - ClientContact (CASCADE)
    # - ClientSite (CASCADE)
    # - ClientFile (CASCADE)
    # - ClientFolder (CASCADE)
    # - ClientDocument (CASCADE)
    db.delete(c)
    db.commit()
    return {"status": "ok"}


@router.post("/{client_id}/contacts", response_model=ClientContactResponse)
def add_contact(client_id: str, payload: ClientContactCreate, db: Session = Depends(get_db), _=Depends(require_permissions("clients:write"))):
    try:
        # Validate client exists and coerce UUID
        try:
            client_uuid = uuid.UUID(str(client_id))
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid client id")
        c = db.query(Client).filter(Client.id == client_uuid).first()
        if not c:
            raise HTTPException(status_code=404, detail="Client not found")
        data = payload.dict(exclude_unset=True)
        contact = ClientContact(client_id=client_uuid, **data)
        db.add(contact)
        db.commit()
        db.refresh(contact)
        return contact
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Create contact failed: {e}")


@router.get("/{client_id}/contacts", response_model=List[ClientContactResponse])
def list_contacts(client_id: str, db: Session = Depends(get_db), _=Depends(require_permissions("clients:read"))):
    rows = db.query(ClientContact).filter(ClientContact.client_id == client_id).order_by(ClientContact.sort_index.asc()).all()
    return rows


@router.patch("/{client_id}/contacts/{contact_id}")
def update_contact(client_id: str, contact_id: str, payload: dict, db: Session = Depends(get_db), _=Depends(require_permissions("clients:write"))):
    c = db.query(ClientContact).filter(ClientContact.id == contact_id, ClientContact.client_id == client_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Not found")
    for k, v in payload.items():
        setattr(c, k, v)
    db.commit()
    return {"status": "ok"}


@router.delete("/{client_id}/contacts/{contact_id}")
def delete_contact(client_id: str, contact_id: str, db: Session = Depends(get_db), _=Depends(require_permissions("clients:write"))):
    c = db.query(ClientContact).filter(ClientContact.id == contact_id, ClientContact.client_id == client_id).first()
    if not c:
        return {"status": "ok"}
    db.delete(c)
    db.commit()
    return {"status": "ok"}


@router.post("/{client_id}/contacts/reorder")
def reorder_contacts(client_id: str, order: list[str], db: Session = Depends(get_db)):
    contacts = db.query(ClientContact).filter(ClientContact.client_id == client_id).all()
    index = {cid: i for i, cid in enumerate(order)}
    for c in contacts:
        c.sort_index = index.get(str(c.id), c.sort_index)
    db.commit()
    return {"status": "ok"}


# ----- Sites -----
@router.get("/{client_id}/sites", response_model=List[ClientSiteResponse])
def list_sites(client_id: str, db: Session = Depends(get_db), _=Depends(require_permissions("clients:read"))):
    rows = db.query(ClientSite).filter(ClientSite.client_id == client_id).order_by(ClientSite.sort_index.asc()).all()
    return rows


@router.post("/{client_id}/sites", response_model=ClientSiteResponse)
def create_site(client_id: str, payload: ClientSiteCreate, db: Session = Depends(get_db), _=Depends(require_permissions("clients:write"))):
    row = ClientSite(client_id=client_id, **payload.dict(exclude_unset=True))
    db.add(row)
    db.commit()
    db.refresh(row)
    # Auto-create a top-level folder for this site
    try:
        name = (row.site_name or row.site_address_line1 or str(row.id) or "site").strip()
        if name:
            exists = db.query(ClientFolder).filter(ClientFolder.client_id == client_id, ClientFolder.name == name, ClientFolder.parent_id == None).first()
            if not exists:
                f = ClientFolder(client_id=client_id, name=name)
                db.add(f)
                db.commit()
    except Exception:
        db.rollback()
    return row


@router.patch("/{client_id}/sites/{site_id}")
def update_site(client_id: str, site_id: str, payload: dict, db: Session = Depends(get_db), _=Depends(require_permissions("clients:write"))):
    from ..models.models import Project, Shift
    from datetime import datetime, timezone
    
    row = db.query(ClientSite).filter(ClientSite.id == site_id, ClientSite.client_id == client_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Not found")
    
    # Check if coordinates (site_lat/site_lng) are being updated
    old_lat = getattr(row, 'site_lat', None)
    old_lng = getattr(row, 'site_lng', None)
    new_lat = payload.get('site_lat')
    new_lng = payload.get('site_lng')
    
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
    
    # Update site
    for k, v in payload.items():
        setattr(row, k, v)
    db.commit()
    
    # If coordinates changed, update projects that use this site
    if coordinates_changed:
        # Get final coordinates (use new values if provided, otherwise keep old ones)
        final_lat = new_lat if new_lat is not None else old_lat
        final_lng = new_lng if new_lng is not None else old_lng
        
        # Only update if we have valid coordinates
        if final_lat is not None and final_lng is not None:
            # Get all projects that use this site
            projects = db.query(Project).filter(Project.site_id == site_id).all()
            
            # Update each project's coordinates
            for project in projects:
                # Save old project coordinates before updating
                old_project_lat = getattr(project, 'lat', None)
                old_project_lng = getattr(project, 'lng', None)
                
                # Check if project's coordinates match the old site coordinates (within tolerance)
                project_uses_site_coords = False
                if old_project_lat is not None and old_project_lng is not None:
                    if old_lat is not None and old_lng is not None:
                        lat_diff = abs(float(old_project_lat) - float(old_lat))
                        lng_diff = abs(float(old_project_lng) - float(old_lng))
                        if lat_diff < 0.0001 and lng_diff < 0.0001:
                            project_uses_site_coords = True
                elif old_project_lat is None and old_project_lng is None and old_lat is not None and old_lng is not None:
                    # Project doesn't have coordinates but site had them, assume they should match
                    project_uses_site_coords = True
                
                # Update project coordinates if they matched the old site coordinates
                if project_uses_site_coords or (old_project_lat is None and old_project_lng is None):
                    project.lat = final_lat
                    project.lng = final_lng
                    db.commit()
                    
                    # Now update shifts for this project (same logic as in update_project)
                    # Use old_project_lat/lng to compare with shift geofences
                    shifts = db.query(Shift).filter(Shift.project_id == project.id).all()
                    updated_shifts_count = 0
                    for shift in shifts:
                        # If shift has no geofences or empty geofences, it already uses project coordinates
                        if not shift.geofences or len(shift.geofences) == 0:
                            continue
                        
                        # Check if shift's geofences match the old project coordinates
                        shift_uses_project_coords = False
                        if shift.geofences and len(shift.geofences) > 0:
                            for geofence in shift.geofences:
                                if isinstance(geofence, dict):
                                    geofence_lat = geofence.get('lat')
                                    geofence_lng = geofence.get('lng')
                                    if geofence_lat is not None and geofence_lng is not None:
                                        # Check if geofence matches old project coordinates (within tolerance)
                                        if old_project_lat is not None and old_project_lng is not None:
                                            lat_diff = abs(float(geofence_lat) - float(old_project_lat))
                                            lng_diff = abs(float(geofence_lng) - float(old_project_lng))
                                            if lat_diff < 0.0001 and lng_diff < 0.0001:
                                                shift_uses_project_coords = True
                                                break
                        
                        # If shift's geofences match old project coordinates, clear them to use new project coordinates
                        if shift_uses_project_coords:
                            shift.geofences = None  # Clear geofences to use project coordinates in real-time
                            shift.updated_at = datetime.now(timezone.utc)
                            updated_shifts_count += 1
                    
                    if updated_shifts_count > 0:
                        db.commit()
    
    return {"status": "ok"}


@router.delete("/{client_id}/sites/{site_id}")
def delete_site(client_id: str, site_id: str, db: Session = Depends(get_db), _=Depends(require_permissions("clients:write"))):
    row = db.query(ClientSite).filter(ClientSite.id == site_id, ClientSite.client_id == client_id).first()
    if not row:
        return {"status": "ok"}
    db.delete(row)
    db.commit()
    return {"status": "ok"}


# ----- Files -----
@router.get("/{client_id}/files")
def list_files(
    client_id: str,
    site_id: Optional[str] = None,
    project_id: Optional[str] = None,
    category: Optional[str] = None,
    limit: Optional[int] = None,
    offset: Optional[int] = None,
    db: Session = Depends(get_db),
    _=Depends(require_permissions("clients:read"))
):
    q = db.query(ClientFile)
    q = q.filter(ClientFile.client_id == client_id)
    if site_id:
        q = q.filter(ClientFile.site_id == site_id)
    if category:
        q = q.filter(ClientFile.category == category)
    q = q.order_by(ClientFile.uploaded_at.desc())
    # Optional pagination when provided
    if offset is not None and isinstance(offset, int) and offset >= 0:
        q = q.offset(int(offset))
    if limit is not None and isinstance(limit, int) and limit > 0:
        q = q.limit(int(limit))
    rows = q.all()
    out = []
    for cf in rows:
        fo = db.query(FileObject).filter(FileObject.id == cf.file_object_id).first()
        # Optional filter by project id - only include if matches
        if project_id and (not fo or str(getattr(fo, 'project_id', None) or '') != str(project_id)):
            continue
        ct = getattr(fo, 'content_type', None) if fo else None
        # Heuristic to determine image if content_type missing
        name = cf.original_name or cf.key or ''
        ext = (name.rsplit('.', 1)[-1] if '.' in name else '').lower()
        is_img_ext = ext in { 'png','jpg','jpeg','webp','gif','bmp','heic','heif' }
        is_image = (ct or '').startswith('image/') or is_img_ext
        # Per-client sort index stored in FileObject.tags.client_sort[client_id]
        sort_index = 0
        try:
            if fo and getattr(fo, "tags", None):
                client_sort = (fo.tags or {}).get("client_sort") or {}
                sort_index = int(client_sort.get(str(client_id), 0) or 0)
        except Exception:
            sort_index = 0
        
        # Get project information if file belongs to a project
        project_info = None
        file_project_id = None
        if fo and getattr(fo, 'project_id', None):
            file_project_id = str(fo.project_id)
            proj = db.query(Project).filter(Project.id == fo.project_id).first()
            if proj:
                project_info = {
                    "id": str(proj.id),
                    "name": getattr(proj, 'name', None),
                    "code": getattr(proj, 'code', None),
                }
        
        out.append({
            "id": str(cf.id),
            "file_object_id": str(cf.file_object_id),
            "category": cf.category,
            "key": cf.key,
            "original_name": cf.original_name,
            "site_id": str(cf.site_id) if getattr(cf, 'site_id', None) else None,
            "project_id": file_project_id,
            "project": project_info,  # Include project details for better UI display
            "uploaded_at": cf.uploaded_at.isoformat() if cf.uploaded_at else None,
            "uploaded_by": str(cf.uploaded_by) if cf.uploaded_by else None,
            "content_type": ct,
            "is_image": is_image,
            "sort_index": sort_index,
        })
    # Sort by explicit sort_index asc, then uploaded_at desc
    try:
        out.sort(key=lambda x: (int(x.get("sort_index") or 0), (x.get("uploaded_at") or "")), reverse=False)
        # stable sort for uploaded_at desc within same sort_index
        out.sort(key=lambda x: (x.get("uploaded_at") or ""), reverse=True)
    except Exception:
        pass
    return out


@router.delete("/{client_id}/files/{client_file_id}")
def delete_client_file(client_id: str, client_file_id: str, db: Session = Depends(get_db), _=Depends(require_permissions("clients:write"))):
    row = db.query(ClientFile).filter(ClientFile.id == client_file_id, ClientFile.client_id == client_id).first()
    if not row:
        return {"status":"ok"}
    db.delete(row)
    db.commit()
    return {"status":"ok"}


@router.post("/{client_id}/files/reorder")
def reorder_client_files(client_id: str, order: list[str], db: Session = Depends(get_db), _=Depends(require_permissions("clients:write"))):
    # Persist per-client order using FileObject.tags.client_sort[client_id] = index
    cfiles = db.query(ClientFile).filter(ClientFile.client_id == client_id).all()
    index = {str(cid): i for i, cid in enumerate(order or [])}
    for cf in cfiles:
        idx = index.get(str(cf.id))
        if idx is None:
            continue
        fo = db.query(FileObject).filter(FileObject.id == cf.file_object_id).first()
        if not fo:
            continue
        tags = dict(getattr(fo, "tags", None) or {})
        client_sort = dict(tags.get("client_sort") or {})
        client_sort[str(client_id)] = int(idx)
        tags["client_sort"] = client_sort
        fo.tags = tags
    db.commit()
    return {"status": "ok"}


@router.post("/{client_id}/files")
def attach_file(client_id: str, file_object_id: str, category: Optional[str] = None, original_name: Optional[str] = None, site_id: Optional[str] = None, db: Session = Depends(get_db), _=Depends(require_permissions("clients:write"))):
    fo = db.query(FileObject).filter(FileObject.id == file_object_id).first()
    if not fo:
        raise HTTPException(status_code=404, detail="File not found")
    row = ClientFile(client_id=client_id, site_id=site_id, file_object_id=fo.id, category=category, key=fo.key, original_name=original_name)
    db.add(row)
    db.commit()
    return {"id": str(row.id)}


# ===== File Categories =====
@router.get("/file-categories")
def list_file_categories():
    """
    Returns standard file categories that can be used for organizing files.
    These categories can be used for both client and project files.
    """
    return [
        {"id": "general", "name": "Geral", "icon": "📁"},
        {"id": "designs", "name": "Designs", "icon": "🎨"},
        {"id": "prints", "name": "Impressões", "icon": "🖨️"},
        {"id": "photos", "name": "Fotos", "icon": "📷"},
        {"id": "documents", "name": "Documentos", "icon": "📄"},
        {"id": "contracts", "name": "Contratos", "icon": "📋"},
        {"id": "invoices", "name": "Faturas", "icon": "🧾"},
        {"id": "estimates", "name": "Orçamentos", "icon": "💰"},
        {"id": "reports", "name": "Relatórios", "icon": "📊"},
        {"id": "plans", "name": "Plantas", "icon": "📐"},
        {"id": "other", "name": "Outros", "icon": "📦"},
    ]


def get_default_folder_structure():
    """
    Returns the default folder structure that can be created for projects or clients.
    Returns a list of folder names with their sort order.
    """
    return [
        {"name": "Designs", "sort_index": 1},
        {"name": "Impressões", "sort_index": 2},
        {"name": "Fotos", "sort_index": 3},
        {"name": "Documentos", "sort_index": 4},
        {"name": "Contratos", "sort_index": 5},
        {"name": "Faturas", "sort_index": 6},
        {"name": "Orçamentos", "sort_index": 7},
        {"name": "Relatórios", "sort_index": 8},
        {"name": "Plantas", "sort_index": 9},
        {"name": "Outros", "sort_index": 10},
    ]


def create_default_folders_for_parent(
    db: Session, 
    client_id,  # Can be str or UUID
    parent_folder_id: Optional[uuid.UUID],
    project_id: Optional[uuid.UUID] = None
):
    """
    Creates default folder structure under a parent folder.
    Used for both project folders and general client folders.
    """
    # Convert client_id to UUID if it's a string
    try:
        if isinstance(client_id, str):
            client_uuid = uuid.UUID(client_id)
        else:
            client_uuid = client_id
    except Exception:
        raise ValueError(f"Invalid client_id: {client_id}")
    
    default_folders = get_default_folder_structure()
    created_folders = []
    
    for folder_def in default_folders:
        # Check if folder already exists
        existing = db.query(ClientFolder).filter(
            ClientFolder.client_id == client_uuid,
            ClientFolder.name == folder_def["name"],
            ClientFolder.parent_id == parent_folder_id
        ).first()
        
        if not existing:
            folder = ClientFolder(
                client_id=client_uuid,
                name=folder_def["name"],
                parent_id=parent_folder_id,
                project_id=project_id,
                sort_index=folder_def["sort_index"]
            )
            db.add(folder)
            created_folders.append(folder)
    
    if created_folders:
        db.commit()
        for folder in created_folders:
            db.refresh(folder)
    
    return created_folders


# ===== Client Folders & Documents =====
@router.get("/{client_id}/folders")
def list_client_folders(client_id: str, db: Session = Depends(get_db), _=Depends(require_permissions("clients:read"))):
    rows = db.query(ClientFolder).filter(ClientFolder.client_id == client_id).order_by(ClientFolder.sort_index.asc(), ClientFolder.name.asc()).all()
    out = []
    for f in rows:
        folder_data = {
            "id": str(f.id),
            "name": f.name,
            "parent_id": str(f.parent_id) if getattr(f, 'parent_id', None) else None,
            "sort_index": f.sort_index,
        }
        # Include project information if this folder is linked to a project
        if getattr(f, 'project_id', None):
            proj = db.query(Project).filter(Project.id == f.project_id).first()
            if proj:
                folder_data["project_id"] = str(proj.id)
                folder_data["project"] = {
                    "id": str(proj.id),
                    "name": getattr(proj, 'name', None),
                    "code": getattr(proj, 'code', None),
                }
        out.append(folder_data)
    return out


@router.post("/{client_id}/folders")
def create_client_folder(
    client_id: str, 
    name: str = Body(...), 
    parent_id: Optional[str] = Body(None),
    create_default_subfolders: bool = Body(False),
    db: Session = Depends(get_db), 
    _=Depends(require_permissions("clients:write"))
):
    pid = None
    try:
        pid = uuid.UUID(str(parent_id)) if parent_id else None
    except Exception:
        pid = None
    f = ClientFolder(client_id=client_id, name=(name or '').strip(), parent_id=pid)
    if not f.name:
        raise HTTPException(status_code=400, detail="Folder name required")
    db.add(f)
    db.commit()
    db.refresh(f)
    
    # Optionally create default subfolders
    if create_default_subfolders:
        try:
            create_default_folders_for_parent(db, client_id, f.id, None)
        except Exception:
            # If subfolder creation fails, don't fail folder creation
            pass
    
    return {"id": str(f.id)}


@router.post("/{client_id}/folders/initialize-defaults")
def initialize_default_folders(
    client_id: str,
    parent_folder_id: Optional[str] = Body(None),
    project_id: Optional[str] = Body(None),
    db: Session = Depends(get_db),
    _=Depends(require_permissions("clients:write"))
):
    """
    Initialize default folder structure for a client or project.
    Can be called to create standard folders (Designs, Impressões, etc.)
    at the client root level or under a specific parent folder.
    """
    parent_id = None
    proj_id = None
    
    try:
        if parent_folder_id:
            parent_id = uuid.UUID(str(parent_folder_id))
        if project_id:
            proj_id = uuid.UUID(str(project_id))
    except Exception:
        pass
    
    created = create_default_folders_for_parent(db, client_id, parent_id, proj_id)
    return {
        "status": "ok",
        "created_count": len(created),
        "folders": [{"id": str(f.id), "name": f.name} for f in created]
    }


@router.put("/{client_id}/folders/{folder_id}")
def update_client_folder(client_id: str, folder_id: str, name: Optional[str] = Body(None), parent_id: Optional[str] = Body(None), db: Session = Depends(get_db), _=Depends(require_permissions("clients:write"))):
    try:
        fid = uuid.UUID(str(folder_id))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid folder")
    f = db.query(ClientFolder).filter(ClientFolder.client_id == client_id, ClientFolder.id == fid).first()
    if not f:
        raise HTTPException(status_code=404, detail="Not found")
    if name is not None:
        f.name = (name or '').strip()
        if not f.name:
            raise HTTPException(status_code=400, detail="Folder name required")
    if parent_id is not None:
        try:
            f.parent_id = uuid.UUID(str(parent_id)) if parent_id else None
        except Exception:
            f.parent_id = None
    db.commit()
    return {"status":"ok"}


@router.delete("/{client_id}/folders/{folder_id}")
def delete_client_folder(client_id: str, folder_id: str, db: Session = Depends(get_db), _=Depends(require_permissions("clients:write"))):
    try:
        fid = uuid.UUID(str(folder_id))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid folder")
    tag = f"folder:{folder_id}"
    has_docs = db.query(ClientDocument).filter(ClientDocument.client_id == client_id, ClientDocument.doc_type == tag).first()
    if has_docs:
        raise HTTPException(status_code=400, detail="Folder not empty")
    db.query(ClientFolder).filter(ClientFolder.client_id == client_id, ClientFolder.id == fid).delete()
    db.commit()
    return {"status":"ok"}


@router.get("/{client_id}/documents")
def list_client_documents(client_id: str, folder_id: Optional[str] = None, db: Session = Depends(get_db), _=Depends(require_permissions("clients:read"))):
    q = db.query(ClientDocument).filter(ClientDocument.client_id == client_id)
    if folder_id:
        tag = f"folder:{folder_id}"
        q = q.filter(ClientDocument.doc_type == tag)
    rows = q.order_by(ClientDocument.created_at.desc()).all()
    out = []
    for d in rows:
        fid = None
        try:
            if (d.doc_type or '').startswith('folder:'):
                fid = d.doc_type.split(':',1)[1]
        except Exception:
            fid = None
        out.append({
            "id": str(d.id),
            "folder_id": fid,
            "title": d.title,
            "notes": d.notes,
            "file_id": str(d.file_id) if getattr(d, 'file_id', None) else None,
            "created_at": d.created_at.isoformat() if getattr(d,'created_at',None) else None,
        })
    return out


@router.post("/{client_id}/documents")
def create_client_document(client_id: str, payload: dict = Body(...), db: Session = Depends(get_db), _=Depends(require_permissions("clients:write"))):
    folder_id = payload.get("folder_id")
    d = ClientDocument(
        client_id=client_id,
        doc_type=(f"folder:{folder_id}" if folder_id else (payload.get("doc_type") or "other")),
        title=payload.get("title"),
        notes=payload.get("notes"),
        file_id=payload.get("file_id"),
    )
    db.add(d)
    db.commit()
    return {"id": str(d.id)}


@router.put("/{client_id}/documents/{doc_id}")
def update_client_document(client_id: str, doc_id: str, payload: dict = Body(...), db: Session = Depends(get_db), _=Depends(require_permissions("clients:write"))):
    d = db.query(ClientDocument).filter(ClientDocument.client_id == client_id, ClientDocument.id == doc_id).first()
    if not d:
        raise HTTPException(status_code=404, detail="Not found")
    if "folder_id" in payload:
        fid = payload.get("folder_id")
        d.doc_type = f"folder:{fid}" if fid else (d.doc_type or None)
    if "title" in payload:
        d.title = payload.get("title")
    if "notes" in payload:
        d.notes = payload.get("notes")
    db.commit()
    return {"status":"ok"}


@router.delete("/{client_id}/documents/{doc_id}")
def delete_client_document(client_id: str, doc_id: str, db: Session = Depends(get_db), _=Depends(require_permissions("clients:write"))):
    db.query(ClientDocument).filter(ClientDocument.client_id == client_id, ClientDocument.id == doc_id).delete()
    db.commit()
    return {"status":"ok"}

