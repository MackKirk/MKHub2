from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional

from ..db import get_db
from ..models.models import Project, ClientFile, FileObject, ProjectUpdate, ProjectReport


router = APIRouter(prefix="/projects", tags=["projects"])


@router.post("")
def create_project(payload: dict, db: Session = Depends(get_db)):
    # Minimal validation: require client_id
    if not payload.get("client_id"):
        raise HTTPException(status_code=400, detail="client_id is required")
    proj = Project(**payload)
    db.add(proj)
    db.commit()
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
        }
        for p in query.order_by(Project.created_at.desc()).limit(100).all()
    ]


@router.get("/{project_id}")
def get_project(project_id: str, db: Session = Depends(get_db)):
    p = db.query(Project).filter(Project.id == project_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Not found")
    return {
        "id": str(p.id),
        "code": p.code,
        "name": p.name,
        "slug": p.slug,
        "client_id": str(p.client_id) if p.client_id else None,
        "address_city": getattr(p, 'address_city', None),
        "address_province": getattr(p, 'address_province', None),
        "address_country": getattr(p, 'address_country', None),
        "description": getattr(p, 'description', None),
        "status_id": getattr(p, 'status_id', None),
        "division_id": getattr(p, 'division_id', None),
        "estimator_id": getattr(p, 'estimator_id', None),
        "onsite_lead_id": getattr(p, 'onsite_lead_id', None),
        "date_start": p.date_start.isoformat() if getattr(p, 'date_start', None) else None,
        "date_eta": getattr(p, 'date_eta', None).isoformat() if getattr(p, 'date_eta', None) else None,
        "date_end": p.date_end.isoformat() if getattr(p, 'date_end', None) else None,
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
        })
    return out


@router.post("/{project_id}/reports")
def create_project_report(project_id: str, payload: dict, db: Session = Depends(get_db)):
    row = ProjectReport(
        project_id=project_id,
        category_id=payload.get("category_id"),
        division_id=payload.get("division_id"),
        description=payload.get("description"),
        images=payload.get("images"),
        status=payload.get("status"),
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

