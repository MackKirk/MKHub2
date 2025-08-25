from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional

from ..db import get_db
from ..models.models import Client, ClientContact


router = APIRouter(prefix="/clients", tags=["clients"])


@router.post("")
def create_client(payload: dict, db: Session = Depends(get_db)):
    c = Client(**payload)
    db.add(c)
    db.commit()
    return {"id": str(c.id)}


@router.get("")
def list_clients(city: Optional[str] = None, status: Optional[str] = None, type: Optional[str] = None, q: Optional[str] = None, db: Session = Depends(get_db)):
    query = db.query(Client)
    if city:
        query = query.filter(Client.city == city)
    if status:
        query = query.filter(Client.status_id == status)
    if type:
        query = query.filter(Client.type_id == type)
    if q:
        query = query.filter(Client.name.ilike(f"%{q}%"))
    return [
        {"id": str(c.id), "name": c.name, "city": c.city}
        for c in query.limit(200).all()
    ]


@router.get("/{client_id}")
def get_client(client_id: str, db: Session = Depends(get_db)):
    c = db.query(Client).filter(Client.id == client_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Not found")
    return {
        "id": str(c.id),
        "name": c.name,
        "city": c.city,
        "province": c.province,
        "country": c.country,
        "billing_email": c.billing_email,
        "po_required": c.po_required,
        "tax_number": c.tax_number,
        "dataforma_id": c.dataforma_id,
    }


@router.patch("/{client_id}")
def update_client(client_id: str, payload: dict, db: Session = Depends(get_db)):
    c = db.query(Client).filter(Client.id == client_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Not found")
    for k, v in payload.items():
        setattr(c, k, v)
    db.commit()
    return {"status": "ok"}


@router.delete("/{client_id}")
def delete_client(client_id: str, db: Session = Depends(get_db)):
    c = db.query(Client).filter(Client.id == client_id).first()
    if not c:
        return {"status": "ok"}
    db.delete(c)
    db.commit()
    return {"status": "ok"}


@router.post("/{client_id}/contacts")
def add_contact(client_id: str, payload: dict, db: Session = Depends(get_db)):
    contact = ClientContact(client_id=client_id, **payload)
    db.add(contact)
    db.commit()
    return {"id": str(contact.id)}


@router.patch("/{client_id}/contacts/{contact_id}")
def update_contact(client_id: str, contact_id: str, payload: dict, db: Session = Depends(get_db)):
    c = db.query(ClientContact).filter(ClientContact.id == contact_id, ClientContact.client_id == client_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Not found")
    for k, v in payload.items():
        setattr(c, k, v)
    db.commit()
    return {"status": "ok"}


@router.delete("/{client_id}/contacts/{contact_id}")
def delete_contact(client_id: str, contact_id: str, db: Session = Depends(get_db)):
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

