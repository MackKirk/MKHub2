import uuid
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, field_validator
import enum


class OrderStatus(str, enum.Enum):
    pending = "pending"
    delivered = "delivered"
    canceled = "canceled"


class ProductBase(BaseModel):
    name: str
    unit: str
    stock_quantity: int = 0
    reorder_point: int = 0


class ProductCreate(ProductBase):
    pass


class ProductResponse(ProductBase):
    id: uuid.UUID

    class Config:
        from_attributes = True


class SupplierBase(BaseModel):
    name: str
    legal_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    website: Optional[str] = None

    address_line1: Optional[str] = None
    address_line2: Optional[str] = None
    city: Optional[str] = None
    province: Optional[str] = None
    postal_code: Optional[str] = None
    country: Optional[str] = None

    tax_number: Optional[str] = None
    payment_terms: Optional[str] = None
    currency: Optional[str] = None
    lead_time_days: Optional[int] = None
    category: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = True
    image_base64: Optional[str] = None

    @field_validator("email", "phone", "website", "address_line1", "address_line2", "city", "province", "postal_code", "country", "tax_number", "payment_terms", "currency", "category", "status", "notes", mode="before")
    @classmethod
    def empty_str_to_none(cls, v):
        if v is None:
            return None
        v = str(v).strip()
        return v or None


class SupplierCreate(SupplierBase):
    pass


class SupplierResponse(SupplierBase):
    id: uuid.UUID

    class Config:
        from_attributes = True


class SupplierContactBase(BaseModel):
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    title: Optional[str] = None
    notes: Optional[str] = None

    @field_validator("email", "phone", mode="before")
    @classmethod
    def empty_to_none(cls, v):
        if v is None:
            return None
        v = str(v).strip()
        return v or None


class SupplierContactCreate(SupplierContactBase):
    supplier_id: uuid.UUID


class SupplierContactResponse(SupplierContactBase):
    id: uuid.UUID
    supplier_id: uuid.UUID

    class Config:
        from_attributes = True


class OrderItemBase(BaseModel):
    product_id: uuid.UUID
    quantity: int


class OrderItemCreate(OrderItemBase):
    pass


class OrderItemResponse(OrderItemBase):
    id: uuid.UUID

    class Config:
        from_attributes = True


class OrderBase(BaseModel):
    supplier_id: uuid.UUID
    contact_id: Optional[uuid.UUID] = None
    status: Optional[OrderStatus] = OrderStatus.pending


class OrderCreate(OrderBase):
    items: List[OrderItemCreate]


class OrderResponse(OrderBase):
    id: uuid.UUID
    order_code: str
    order_date: datetime
    delivered_date: Optional[datetime] = None
    email_sent: bool
    email_sent_date: Optional[datetime] = None
    items: List[OrderItemResponse]

    class Config:
        from_attributes = True


