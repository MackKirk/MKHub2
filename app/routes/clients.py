from fastapi import APIRouter, Depends, HTTPException, Body
import uuid
from sqlalchemy.orm import Session
from typing import Optional, List

from ..db import get_db
from ..models.models import Client, ClientContact, ClientSite, ClientFile, FileObject, ClientFolder, ClientDocument
import mimetypes
from ..schemas.clients import (
    ClientCreate, ClientResponse,
    ClientContactCreate, ClientContactResponse,
    ClientSiteCreate, ClientSiteResponse,
)
from ..auth.security import require_permissions


router = APIRouter(prefix="/clients", tags=["clients"])


@router.post("", response_model=ClientResponse)
def create_client(payload: ClientCreate, db: Session = Depends(get_db), _=Depends(require_permissions("clients:write"))):
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
        return c
    except Exception as e:
        db.rollback()
        # Expose error detail to aid debugging of prod schema mismatches
        raise HTTPException(status_code=400, detail=f"Create failed: {e}")


@router.get("", response_model=List[ClientResponse])
def list_clients(city: Optional[str] = None, status: Optional[str] = None, type: Optional[str] = None, q: Optional[str] = None, db: Session = Depends(get_db), _=Depends(require_permissions("clients:read"))):
    query = db.query(Client)
    if city:
        query = query.filter(Client.city == city)
    if status:
        query = query.filter(Client.status_id == status)
    if type:
        query = query.filter(Client.type_id == type)
    if q:
        # Search over display_name or name
        query = query.filter((Client.name.ilike(f"%{q}%")) | (Client.display_name.ilike(f"%{q}%")))
    return query.order_by(Client.created_at.desc()).limit(500).all()


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
    return row


@router.patch("/{client_id}/sites/{site_id}")
def update_site(client_id: str, site_id: str, payload: dict, db: Session = Depends(get_db), _=Depends(require_permissions("clients:write"))):
    row = db.query(ClientSite).filter(ClientSite.id == site_id, ClientSite.client_id == client_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Not found")
    for k, v in payload.items():
        setattr(row, k, v)
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
def list_files(client_id: str, site_id: Optional[str] = None, project_id: Optional[str] = None, db: Session = Depends(get_db), _=Depends(require_permissions("clients:read"))):
    q = db.query(ClientFile)
    q = q.filter(ClientFile.client_id == client_id)
    if site_id:
        q = q.filter(ClientFile.site_id == site_id)
    rows = q.order_by(ClientFile.uploaded_at.desc()).all()
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
        out.append({
            "id": str(cf.id),
            "file_object_id": str(cf.file_object_id),
            "category": cf.category,
            "key": cf.key,
            "original_name": cf.original_name,
            "site_id": str(cf.site_id) if getattr(cf, 'site_id', None) else None,
            "project_id": str(getattr(fo, 'project_id', '')) if fo and getattr(fo, 'project_id', None) else None,
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


# ===== Client Folders & Documents =====
@router.get("/{client_id}/folders")
def list_client_folders(client_id: str, db: Session = Depends(get_db), _=Depends(require_permissions("clients:read"))):
    rows = db.query(ClientFolder).filter(ClientFolder.client_id == client_id).order_by(ClientFolder.sort_index.asc(), ClientFolder.name.asc()).all()
    return [{
        "id": str(f.id),
        "name": f.name,
        "parent_id": str(f.parent_id) if getattr(f, 'parent_id', None) else None,
        "sort_index": f.sort_index,
    } for f in rows]


@router.post("/{client_id}/folders")
def create_client_folder(client_id: str, name: str = Body(...), parent_id: Optional[str] = Body(None), db: Session = Depends(get_db), _=Depends(require_permissions("clients:write"))):
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
    return {"id": str(f.id)}


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

