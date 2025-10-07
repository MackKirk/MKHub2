import uuid
from typing import Optional, List
from pydantic import BaseModel, field_validator


class ClientBase(BaseModel):
    code: Optional[str] = None
    # Identity
    name: str
    legal_name: Optional[str] = None
    display_name: Optional[str] = None
    client_type: Optional[str] = None
    client_status: Optional[str] = None
    lead_source: Optional[str] = None
    estimator_id: Optional[uuid.UUID] = None
    description: Optional[str] = None

    # Primary address
    address_line1: Optional[str] = None
    address_line2: Optional[str] = None
    city: Optional[str] = None
    province: Optional[str] = None
    postal_code: Optional[str] = None
    country: Optional[str] = None

    # Billing address
    billing_address_line1: Optional[str] = None
    billing_address_line2: Optional[str] = None
    billing_city: Optional[str] = None
    billing_province: Optional[str] = None
    billing_postal_code: Optional[str] = None
    billing_country: Optional[str] = None
    billing_same_as_address: Optional[bool] = False

    # Legacy/commercial
    billing_email: Optional[str] = None
    po_required: Optional[bool] = False
    tax_number: Optional[str] = None

    # Communication preferences
    preferred_language: Optional[str] = None
    preferred_channels: Optional[List[str]] = None
    marketing_opt_in: Optional[bool] = None
    invoice_delivery_method: Optional[str] = None
    statement_delivery_method: Optional[str] = None
    cc_emails_for_invoices: Optional[List[str]] = None
    cc_emails_for_estimates: Optional[List[str]] = None
    do_not_contact: Optional[bool] = None
    do_not_contact_reason: Optional[str] = None

    @field_validator('address_line1','address_line2','city','province','postal_code','country','billing_address_line1','billing_address_line2','billing_city','billing_province','billing_postal_code','billing_country','billing_email','tax_number','code','legal_name','display_name','client_type','client_status','lead_source','description','preferred_language','invoice_delivery_method','statement_delivery_method','do_not_contact_reason', mode='before')
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
    role_title: Optional[str] = None
    department: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    mobile_phone: Optional[str] = None
    is_primary: Optional[bool] = False
    sort_index: Optional[int] = 0
    notes: Optional[str] = None
    role_tags: Optional[List[str]] = None


class ClientContactCreate(ClientContactBase):
    pass


class ClientContactResponse(ClientContactBase):
    id: uuid.UUID
    client_id: uuid.UUID
    class Config:
        from_attributes = True
class ClientSiteBase(BaseModel):
    site_name: Optional[str] = None
    site_address_line1: Optional[str] = None
    site_address_line2: Optional[str] = None
    site_city: Optional[str] = None
    site_province: Optional[str] = None
    site_postal_code: Optional[str] = None
    site_country: Optional[str] = None
    site_notes: Optional[str] = None
    sort_index: Optional[int] = 0


class ClientSiteCreate(ClientSiteBase):
    pass


class ClientSiteResponse(ClientSiteBase):
    id: uuid.UUID
    client_id: uuid.UUID

    class Config:
        from_attributes = True



