from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional

from ..db import get_db
from ..models.models import Employee


router = APIRouter(prefix="/employees", tags=["employees"])

# Deprecated endpoint stubs maintained for backward compatibility; return empty lists / not implemented.
@router.get("")
def list_employees(q: Optional[str] = None, db: Session = Depends(get_db)):
    return []

