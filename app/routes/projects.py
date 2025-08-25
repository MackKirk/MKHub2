from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional

from ..db import get_db
from ..models.models import Project


router = APIRouter(prefix="/projects", tags=["projects"])


@router.post("")
def create_project(payload: dict, db: Session = Depends(get_db)):
    proj = Project(**payload)
    db.add(proj)
    db.commit()
    return {"id": str(proj.id)}


@router.get("")
def list_projects(client: Optional[str] = None, status: Optional[str] = None, q: Optional[str] = None, db: Session = Depends(get_db)):
    query = db.query(Project)
    if client:
        query = query.filter(Project.client_id == client)
    if status:
        query = query.filter(Project.status_id == status)
    if q:
        query = query.filter(Project.name.ilike(f"%{q}%"))
    return [
        {"id": str(p.id), "code": p.code, "name": p.name, "slug": p.slug}
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

