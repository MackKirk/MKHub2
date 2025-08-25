from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional

from ..db import get_db
from ..models.models import Employee


router = APIRouter(prefix="/employees", tags=["employees"])


@router.post("")
def create_employee(payload: dict, db: Session = Depends(get_db)):
    e = Employee(**payload)
    db.add(e)
    db.commit()
    return {"id": str(e.id)}


@router.get("")
def list_employees(q: Optional[str] = None, db: Session = Depends(get_db)):
    query = db.query(Employee)
    if q:
        query = query.filter(Employee.name.ilike(f"%{q}%"))
    return [
        {"id": str(e.id), "name": e.name, "job_title": e.job_title}
        for e in query.limit(200).all()
    ]


@router.get("/{employee_id}")
def get_employee(employee_id: str, db: Session = Depends(get_db)):
    e = db.query(Employee).filter(Employee.id == employee_id).first()
    if not e:
        raise HTTPException(status_code=404, detail="Not found")
    return {
        "id": str(e.id),
        "name": e.name,
        "job_title": e.job_title,
        "department": e.department,
        "email_corporate": e.email_corporate,
        "bamboohr_id": e.bamboohr_id,
    }


@router.patch("/{employee_id}")
def update_employee(employee_id: str, payload: dict, db: Session = Depends(get_db)):
    e = db.query(Employee).filter(Employee.id == employee_id).first()
    if not e:
        raise HTTPException(status_code=404, detail="Not found")
    for k, v in payload.items():
        setattr(e, k, v)
    db.commit()
    return {"status": "ok"}


@router.delete("/{employee_id}")
def delete_employee(employee_id: str, db: Session = Depends(get_db)):
    e = db.query(Employee).filter(Employee.id == employee_id).first()
    if not e:
        return {"status": "ok"}
    db.delete(e)
    db.commit()
    return {"status": "ok"}

