"""
Company Files Routes
Handles company-wide files organized by departments.
Uses a special approach: we'll create a "Company" client or use department-based organization.
For now, we'll use department_id to organize files.
"""
from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.orm import Session, defer
from sqlalchemy.exc import ProgrammingError
from typing import Optional, List
import uuid

from ..db import get_db
from ..models.models import ClientFolder, ClientDocument, FileObject, SettingItem, SettingList, User, EmployeeProfile
from ..auth.security import require_permissions, get_current_user

router = APIRouter(prefix="/company/files", tags=["company-files"])


def get_company_client_id(db: Session) -> uuid.UUID:
    """
    Get or create a special "Company" client for company-wide files.
    This allows us to reuse the existing ClientFolder/ClientDocument system.
    """
    from ..models.models import Client
    # Look for a client with code "COMPANY" or name "Company Files"
    try:
        company = db.query(Client).filter(
            (Client.code == "COMPANY") | (Client.name.ilike("%company%files%"))
        ).first()
    except ProgrammingError as e:
        error_msg = str(e.orig) if hasattr(e, 'orig') else str(e)
        if 'is_system' in error_msg and 'does not exist' in error_msg:
            db.rollback()
            company = db.query(Client).options(defer(Client.is_system)).filter(
                (Client.code == "COMPANY") | (Client.name.ilike("%company%files%"))
            ).first()
        else:
            raise
    
    if not company:
        # Create company client if it doesn't exist
        # Mark it as system client so it doesn't appear in customer listings
        # Only set is_system if column exists
        company_data = {
            "code": "COMPANY",
            "name": "Company Files",
            "display_name": "Company Files",
        }
        # Try to set is_system, but don't fail if column doesn't exist
        try:
            company = Client(**company_data, is_system=True)
        except Exception:
            # Column doesn't exist, create without it
            company = Client(**company_data)
        db.add(company)
        db.commit()
        db.refresh(company)
    else:
        # Ensure existing company client is marked as system (only if column exists)
        try:
            if not getattr(company, 'is_system', False):
                company.is_system = True
                db.commit()
                db.refresh(company)
        except (AttributeError, ProgrammingError):
            # Column doesn't exist, skip setting it
            pass
    
    return company.id


def get_user_division(db: Session, user_id: uuid.UUID) -> Optional[str]:
    """Get user's division name from their EmployeeProfile."""
    profile = db.query(EmployeeProfile).filter(EmployeeProfile.user_id == user_id).first()
    if profile and getattr(profile, 'division', None):
        return profile.division
    return None


def user_has_folder_access(db: Session, user: User, folder: ClientFolder) -> bool:
    """
    Check if a user has access to a folder based on permissions.
    Returns True if:
    - Folder has no access_permissions (public by default)
    - Folder is_public is True
    - User ID is in allowed_user_ids
    - User's division is in allowed_divisions
    - User is admin
    """
    # Admin users always have access
    from ..services.permissions import is_admin
    if is_admin(user, db):
        return True
    
    # If no permissions set, folder is public
    perms = getattr(folder, 'access_permissions', None)
    if not perms:
        return True
    
    # Check if folder is explicitly public
    if perms.get('is_public', True):
        return True
    
    # Check if user ID is in allowed list
    allowed_user_ids = perms.get('allowed_user_ids', [])
    if allowed_user_ids:
        # Convert to UUIDs if they're strings
        user_ids = []
        for uid in allowed_user_ids:
            try:
                if isinstance(uid, str):
                    user_ids.append(uuid.UUID(uid))
                else:
                    user_ids.append(uid)
            except Exception:
                pass
        if user.id in user_ids:
            return True
    
    # Check if user's division is in allowed list
    allowed_divisions = perms.get('allowed_divisions', [])
    if allowed_divisions:
        user_division = get_user_division(db, user.id)
        if user_division and user_division in allowed_divisions:
            return True
    
    return False


@router.get("/folders")
def list_company_folders(
    department_id: Optional[str] = None,
    parent_id: Optional[str] = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _=Depends(require_permissions("documents:read", "documents:access", "clients:read"))
):
    """List folders for company files, optionally filtered by department and parent. Filters by user permissions."""
    company_id = get_company_client_id(db)
    
    # If department_id is provided and no parent_id, we need to get or create the department root folder
    dept_root_folder_id = None
    if department_id and not parent_id:
        dept_list = db.query(SettingList).filter(SettingList.name == "departments").first()
        if dept_list:
            dept = db.query(SettingItem).filter(
                SettingItem.id == department_id,
                SettingItem.list_id == dept_list.id
            ).first()
            if dept:
                # Find or create the root folder for this department
                dept_root = db.query(ClientFolder).filter(
                    ClientFolder.client_id == company_id,
                    ClientFolder.name == dept.label,
                    ClientFolder.parent_id == None
                ).first()
                
                if not dept_root:
                    # Create the department root folder if it doesn't exist
                    dept_root = ClientFolder(
                        client_id=company_id,
                        name=dept.label,
                        parent_id=None
                    )
                    db.add(dept_root)
                    db.commit()
                    db.refresh(dept_root)
                
                dept_root_folder_id = dept_root.id
    
    query = db.query(ClientFolder).filter(ClientFolder.client_id == company_id)
    
    # Filter by parent_id if provided
    if parent_id:
        try:
            pid = uuid.UUID(str(parent_id))
            query = query.filter(ClientFolder.parent_id == pid)
        except Exception:
            pass
    elif dept_root_folder_id:
        # If we have a department root folder, show folders inside it
        query = query.filter(ClientFolder.parent_id == dept_root_folder_id)
    else:
        # If no parent_id and no department, show only root folders (no parent)
        query = query.filter(ClientFolder.parent_id == None)
    
    rows = query.order_by(ClientFolder.sort_index.asc(), ClientFolder.name.asc()).all()
    
    out = []
    for f in rows:
        # Check if user has access to this folder
        if not user_has_folder_access(db, user, f):
            continue
        
        # Get last modified date from documents in this folder
        last_modified = getattr(f, 'created_at', None)
        if f.id:
            latest_doc = db.query(ClientDocument).filter(
                ClientDocument.client_id == company_id,
                ClientDocument.doc_type == f"folder:{f.id}"
            ).order_by(ClientDocument.created_at.desc()).first()
            if latest_doc and getattr(latest_doc, 'created_at', None):
                last_modified = latest_doc.created_at
        
        folder_data = {
            "id": str(f.id),
            "name": f.name,
            "parent_id": str(f.parent_id) if getattr(f, 'parent_id', None) else None,
            "sort_index": f.sort_index,
            "access_permissions": getattr(f, 'access_permissions', None),
            "created_at": f.created_at.isoformat() if getattr(f, 'created_at', None) else None,
            "last_modified": last_modified.isoformat() if last_modified else None,
        }
        out.append(folder_data)
    return out


@router.post("/folders")
def create_company_folder(
    name: str = Body(...),
    parent_id: Optional[str] = Body(None),
    department_id: Optional[str] = Body(None),
    db: Session = Depends(get_db),
    _=Depends(require_permissions("documents:write", "documents:access", "clients:write"))
):
    """Create a folder for company files."""
    company_id = get_company_client_id(db)
    
    pid = None
    if parent_id:
        try:
            pid = uuid.UUID(str(parent_id))
        except Exception:
            pass
    elif department_id:
        # If no parent_id but department_id is provided, create folder inside department root
        dept_list = db.query(SettingList).filter(SettingList.name == "departments").first()
        if dept_list:
            dept = db.query(SettingItem).filter(
                SettingItem.id == department_id,
                SettingItem.list_id == dept_list.id
            ).first()
            if dept:
                # Find or create the root folder for this department
                dept_root = db.query(ClientFolder).filter(
                    ClientFolder.client_id == company_id,
                    ClientFolder.name == dept.label,
                    ClientFolder.parent_id == None
                ).first()
                
                if not dept_root:
                    # Create the department root folder if it doesn't exist
                    dept_root = ClientFolder(
                        client_id=company_id,
                        name=dept.label,
                        parent_id=None
                    )
                    db.add(dept_root)
                    db.commit()
                    db.refresh(dept_root)
                
                pid = dept_root.id
    
    folder = ClientFolder(
        client_id=company_id,
        name=(name or '').strip(),
        parent_id=pid
    )
    if not folder.name:
        raise HTTPException(status_code=400, detail="Folder name required")
    
    db.add(folder)
    db.commit()
    db.refresh(folder)
    return {"id": str(folder.id)}


@router.put("/folders/{folder_id}")
def update_company_folder(
    folder_id: str,
    name: Optional[str] = Body(None),
    parent_id: Optional[str] = Body(None),
    db: Session = Depends(get_db),
    _=Depends(require_permissions("documents:move", "documents:access", "clients:write"))
):
    """Update a company folder."""
    company_id = get_company_client_id(db)
    
    try:
        fid = uuid.UUID(str(folder_id))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid folder")
    
    folder = db.query(ClientFolder).filter(
        ClientFolder.client_id == company_id,
        ClientFolder.id == fid
    ).first()
    
    if not folder:
        raise HTTPException(status_code=404, detail="Not found")
    
    if name is not None:
        folder.name = (name or '').strip()
        if not folder.name:
            raise HTTPException(status_code=400, detail="Folder name required")
    
    if parent_id is not None:
        try:
            folder.parent_id = uuid.UUID(str(parent_id)) if parent_id else None
        except Exception:
            folder.parent_id = None
    
    db.commit()
    return {"status": "ok"}


@router.delete("/folders/{folder_id}")
def delete_company_folder(
    folder_id: str,
    db: Session = Depends(get_db),
    _=Depends(require_permissions("documents:delete", "documents:access", "clients:write"))
):
    """Delete a company folder."""
    company_id = get_company_client_id(db)
    
    try:
        fid = uuid.UUID(str(folder_id))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid folder")
    
    # Check if folder has documents
    has_docs = db.query(ClientDocument).filter(
        ClientDocument.client_id == company_id,
        ClientDocument.doc_type == f"folder:{folder_id}"
    ).first()
    
    if has_docs:
        raise HTTPException(status_code=400, detail="Folder not empty")
    
    db.query(ClientFolder).filter(
        ClientFolder.client_id == company_id,
        ClientFolder.id == fid
    ).delete()
    db.commit()
    return {"status": "ok"}


@router.get("/documents")
def list_company_documents(
    folder_id: Optional[str] = None,
    department_id: Optional[str] = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _=Depends(require_permissions("documents:read", "documents:access", "clients:read"))
):
    """List documents in company files. Only shows documents in folders the user has access to."""
    company_id = get_company_client_id(db)
    
    query = db.query(ClientDocument).filter(ClientDocument.client_id == company_id)
    
    if folder_id:
        tag = f"folder:{folder_id}"
        query = query.filter(ClientDocument.doc_type == tag)
        
        # Check if user has access to this folder
        try:
            fid = uuid.UUID(str(folder_id))
            folder = db.query(ClientFolder).filter(
                ClientFolder.client_id == company_id,
                ClientFolder.id == fid
            ).first()
            if folder and not user_has_folder_access(db, user, folder):
                raise HTTPException(status_code=403, detail="Access denied to this folder")
        except HTTPException:
            raise
        except Exception:
            pass
    
    rows = query.order_by(ClientDocument.created_at.desc()).all()
    
    out = []
    for d in rows:
        fid = None
        try:
            if (d.doc_type or '').startswith('folder:'):
                fid = d.doc_type.split(':', 1)[1]
                # Verify user has access to the folder containing this document
                if fid:
                    try:
                        folder_uuid = uuid.UUID(str(fid))
                        folder = db.query(ClientFolder).filter(
                            ClientFolder.client_id == company_id,
                            ClientFolder.id == folder_uuid
                        ).first()
                        if folder and not user_has_folder_access(db, user, folder):
                            continue  # Skip this document
                    except Exception:
                        pass
        except Exception:
            fid = None
        
        out.append({
            "id": str(d.id),
            "folder_id": fid,
            "title": d.title,
            "notes": d.notes,
            "file_id": str(d.file_id) if getattr(d, 'file_id', None) else None,
            "created_at": d.created_at.isoformat() if getattr(d, 'created_at', None) else None,
        })
    return out


@router.post("/documents")
def create_company_document(
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    _=Depends(require_permissions("documents:write", "documents:access", "clients:write"))
):
    """Create a document in company files."""
    company_id = get_company_client_id(db)
    
    folder_id = payload.get("folder_id")
    doc = ClientDocument(
        client_id=company_id,
        doc_type=(f"folder:{folder_id}" if folder_id else (payload.get("doc_type") or "other")),
        title=payload.get("title"),
        notes=payload.get("notes"),
        file_id=payload.get("file_id"),
    )
    db.add(doc)
    db.commit()
    return {"id": str(doc.id)}


@router.put("/documents/{doc_id}")
def update_company_document(
    doc_id: str,
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    _=Depends(require_permissions("documents:move", "documents:access", "clients:write"))
):
    """Update a company document."""
    company_id = get_company_client_id(db)
    
    doc = db.query(ClientDocument).filter(
        ClientDocument.client_id == company_id,
        ClientDocument.id == doc_id
    ).first()
    
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    
    if "folder_id" in payload:
        fid = payload.get("folder_id")
        doc.doc_type = f"folder:{fid}" if fid else (doc.doc_type or None)
    
    if "title" in payload:
        doc.title = payload.get("title")
    
    if "notes" in payload:
        doc.notes = payload.get("notes")
    
    db.commit()
    return {"status": "ok"}


@router.delete("/documents/{doc_id}")
def delete_company_document(
    doc_id: str,
    db: Session = Depends(get_db),
    _=Depends(require_permissions("documents:delete", "documents:access", "clients:write"))
):
    """Delete a company document."""
    company_id = get_company_client_id(db)
    
    db.query(ClientDocument).filter(
        ClientDocument.client_id == company_id,
        ClientDocument.id == doc_id
    ).delete()
    db.commit()
    return {"status": "ok"}


@router.get("/folders/{folder_id}/permissions")
def get_folder_permissions(
    folder_id: str,
    db: Session = Depends(get_db),
    _=Depends(require_permissions("documents:read", "documents:access", "clients:read"))
):
    """Get access permissions for a folder."""
    company_id = get_company_client_id(db)
    
    try:
        fid = uuid.UUID(str(folder_id))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid folder")
    
    folder = db.query(ClientFolder).filter(
        ClientFolder.client_id == company_id,
        ClientFolder.id == fid
    ).first()
    
    if not folder:
        raise HTTPException(status_code=404, detail="Not found")
    
    perms = getattr(folder, 'access_permissions', None) or {}
    
    # Get user details for allowed_user_ids
    allowed_user_ids = perms.get('allowed_user_ids', [])
    users = []
    for uid in allowed_user_ids:
        try:
            user_uuid = uuid.UUID(str(uid)) if isinstance(uid, str) else uid
            user = db.query(User).filter(User.id == user_uuid).first()
            if user:
                users.append({
                    "id": str(user.id),
                    "username": user.username,
                    "email": user.email_personal or user.email_corporate
                })
        except Exception:
            pass
    
    return {
        "is_public": perms.get('is_public', True),
        "allowed_user_ids": [str(uid) for uid in allowed_user_ids],
        "allowed_users": users,
        "allowed_divisions": perms.get('allowed_divisions', [])
    }


@router.put("/folders/{folder_id}/permissions")
def update_folder_permissions(
    folder_id: str,
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    _=Depends(require_permissions("documents:move", "documents:access", "clients:write"))
):
    """Update access permissions for a folder."""
    company_id = get_company_client_id(db)
    
    try:
        fid = uuid.UUID(str(folder_id))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid folder")
    
    folder = db.query(ClientFolder).filter(
        ClientFolder.client_id == company_id,
        ClientFolder.id == fid
    ).first()
    
    if not folder:
        raise HTTPException(status_code=404, detail="Not found")
    
    # Build permissions object
    perms = {}
    
    # is_public flag
    is_public = payload.get('is_public', True)
    perms['is_public'] = bool(is_public)
    
    # allowed_user_ids
    allowed_user_ids = payload.get('allowed_user_ids', [])
    if allowed_user_ids:
        user_uuids = []
        for uid in allowed_user_ids:
            try:
                if isinstance(uid, str):
                    user_uuids.append(uuid.UUID(uid))
                else:
                    user_uuids.append(uid)
            except Exception:
                pass
        perms['allowed_user_ids'] = [str(u) for u in user_uuids]
    else:
        perms['allowed_user_ids'] = []
    
    # allowed_divisions
    allowed_divisions = payload.get('allowed_divisions', [])
    if allowed_divisions:
        perms['allowed_divisions'] = [str(d) for d in allowed_divisions if d]
    else:
        perms['allowed_divisions'] = []
    
    folder.access_permissions = perms
    db.commit()
    
    return {"status": "ok", "permissions": perms}


@router.get("/users-options")
def get_users_options(
    q: Optional[str] = None,
    limit: int = 100,
    db: Session = Depends(get_db),
    _=Depends(require_permissions("documents:read", "documents:access", "clients:read"))
):
    """Get list of users for permission configuration."""
    query = db.query(User).filter(User.is_active == True)
    
    if q:
        query = query.filter(
            (User.username.ilike(f"%{q}%")) |
            (User.email_personal.ilike(f"%{q}%")) |
            (User.email_corporate.ilike(f"%{q}%"))
        )
    
    users = query.limit(limit).all()
    
    out = []
    for u in users:
        out.append({
            "id": str(u.id),
            "username": u.username,
            "email": u.email_personal or u.email_corporate
        })
    return out


@router.get("/divisions-options")
def get_divisions_options(
    db: Session = Depends(get_db),
    _=Depends(require_permissions("documents:read", "documents:access", "clients:read"))
):
    """Get list of divisions for permission configuration."""
    divisions_list = db.query(SettingList).filter(SettingList.name == "divisions").first()
    if not divisions_list:
        return []
    
    items = db.query(SettingItem).filter(
        SettingItem.list_id == divisions_list.id
    ).order_by(SettingItem.sort_index.asc(), SettingItem.label.asc()).all()
    
    return [{"id": str(item.id), "label": item.label} for item in items]

