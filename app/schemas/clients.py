import uuid
from typing import Optional, List
from pydantic import BaseModel, field_validator


class ClientBase(BaseModel):
    code: Optional[str] = None
    name: str
    address: Optional[str] = None
    city: Optional[str] = None
    province: Optional[str] = None
    country: Optional[str] = None
    billing_email: Optional[str] = None
    po_required: Optional[bool] = False
    tax_number: Optional[str] = None

    @field_validator('address','city','province','country','billing_email','tax_number','code', mode='before')
    @classmethod
    def empty_to_none(cls, v):
        if v is None:
            return None
        v = str(v).strip()
        return v or None


class ClientCreate(ClientBase):
    pass


class ClientResponse(ClientBase):
    id: uuid.UUID

    class Config:
        from_attributes = True


class ClientContactBase(BaseModel):
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    is_primary: Optional[bool] = False


class ClientContactCreate(ClientContactBase):
    client_id: uuid.UUID


class ClientContactResponse(ClientContactBase):
    id: uuid.UUID
    client_id: uuid.UUID

    class Config:
        from_attributes = True


