from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional, List

from ..db import get_db
from ..models.models import Client, ClientContact
from ..schemas.clients import ClientCreate, ClientResponse, ClientContactCreate, ClientContactResponse
from ..auth.security import require_permissions


router = APIRouter(prefix="/clients", tags=["clients"])


@router.post("", response_model=ClientResponse)
def create_client(payload: ClientCreate, db: Session = Depends(get_db), _=Depends(require_permissions("clients:write"))):
    data = payload.dict(exclude_unset=True)
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
        query = query.filter(Client.name.ilike(f"%{q}%"))
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
    contact = ClientContact(client_id=client_id, **payload.dict(exclude_unset=True))
    db.add(contact)
    db.commit()
    db.refresh(contact)
    return contact


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

