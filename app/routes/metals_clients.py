"""Mack Kirk Metals customer list/create (product-scoped)."""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, literal, or_
from sqlalchemy.exc import ProgrammingError
from sqlalchemy.orm import Session, defer

from ..auth.security import get_current_user, require_permissions
from ..db import get_db
from ..models.models import Client, User
from ..schemas.clients import ClientCreate, ClientResponse
from ..services.client_product_scope import can_read_metals_customers

router = APIRouter(prefix="/metals/clients", tags=["metals-clients"])


def _sort_clause(sort: Optional[str], asc: bool):
    s = (sort or "").strip().lower()
    if s == "name":
        t = func.lower(func.coalesce(Client.display_name, Client.name, literal("")))
        return (t.asc().nulls_last(),) if asc else (t.desc().nulls_last(),)
    if s == "code":
        t = func.lower(func.coalesce(Client.code, literal("")))
        return (t.asc().nulls_last(),) if asc else (t.desc().nulls_last(),)
    if s == "city":
        t = func.lower(func.coalesce(Client.city, literal("")))
        return (t.asc().nulls_last(),) if asc else (t.desc().nulls_last(),)
    return (Client.created_at.desc(),)


@router.get("")
def list_metals_clients(
    q: Optional[str] = None,
    page: int = 1,
    limit: int = 10,
    sort: Optional[str] = None,
    sort_dir: Optional[str] = Query("asc", alias="dir"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _=Depends(require_permissions("metals:customers:read")),
):
    if not can_read_metals_customers(user):
        raise HTTPException(status_code=403, detail="Forbidden")

    page = max(1, page)
    limit = max(1, min(100, limit))
    offset = (page - 1) * limit

    try:
        base_query = db.query(Client).filter(
            Client.is_system == False,
            Client.deleted_at.is_(None),
            Client.serves_metals.is_(True),
        )
    except ProgrammingError as e:
        error_msg = str(e.orig) if hasattr(e, "orig") else str(e)
        if "is_system" in error_msg and "does not exist" in error_msg:
            db.rollback()
            base_query = (
                db.query(Client)
                .options(defer(Client.is_system))
                .filter(Client.deleted_at.is_(None), Client.serves_metals.is_(True))
            )
        else:
            raise

    if q:
        like = f"%{q.strip()}%"
        base_query = base_query.filter(
            or_(
                Client.name.ilike(like),
                Client.display_name.ilike(like),
                Client.code.ilike(like),
                Client.city.ilike(like),
            )
        )

    total = base_query.count()
    asc = (sort_dir or "asc").lower() != "desc"
    rows = (
        base_query.order_by(*_sort_clause(sort, asc)).offset(offset).limit(limit).all()
    )
    total_pages = (total + limit - 1) // limit if limit else 1
    return {
        "items": rows,
        "total": total,
        "page": page,
        "limit": limit,
        "total_pages": total_pages,
    }


@router.post("", response_model=ClientResponse)
def create_metals_client(
    payload: ClientCreate,
    create_default_folders: bool = False,
    db: Session = Depends(get_db),
    _=Depends(require_permissions("metals:customers:write")),
):
    from .clients import create_default_folders_for_parent

    try:
        data = payload.dict(exclude_unset=True)
        data = {k: v for k, v in data.items() if v is not None}
        if not data.get("name"):
            data["name"] = data.get("display_name") or "client"
        if not data.get("code"):
            existing_clients = db.query(Client.code).filter(Client.code.isnot(None)).all()
            numeric_codes = []
            for row in existing_clients:
                code_value = row[0] if isinstance(row, (tuple, list)) else row
                if code_value and isinstance(code_value, str) and code_value.isdigit() and len(code_value) == 5:
                    try:
                        numeric_codes.append(int(code_value))
                    except ValueError:
                        pass
            next_code = (max(numeric_codes) if numeric_codes else 0) + 1
            code = f"{next_code:05d}"
            while db.query(Client).filter(Client.code == code, Client.deleted_at.is_(None)).first():
                next_code += 1
                code = f"{next_code:05d}"
            data["code"] = code

        data["serves_hub"] = False
        data["serves_metals"] = True
        c = Client(**data)
        db.add(c)
        db.commit()
        db.refresh(c)

        if create_default_folders:
            try:
                create_default_folders_for_parent(db, c.id, None, None)
            except Exception:
                pass

        return c
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
