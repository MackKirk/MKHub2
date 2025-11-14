import uuid
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel


class OrderStatus(str):
    draft = "draft"
    awaiting_delivery = "awaiting_delivery"
    delivered = "delivered"


class ProjectOrderItemBase(BaseModel):
    item_type: str
    name: str
    description: Optional[str] = None
    quantity: float
    unit: Optional[str] = None
    unit_price: float
    total_price: float
    section: Optional[str] = None
    supplier_name: Optional[str] = None


class ProjectOrderItemCreate(ProjectOrderItemBase):
    estimate_item_id: Optional[int] = None
    material_id: Optional[int] = None


class ProjectOrderItemResponse(ProjectOrderItemBase):
    id: uuid.UUID
    order_id: uuid.UUID
    estimate_item_id: Optional[int] = None
    material_id: Optional[int] = None
    is_ordered: bool
    created_at: datetime

    class Config:
        from_attributes = True


class ProjectOrderBase(BaseModel):
    project_id: uuid.UUID
    estimate_id: Optional[int] = None
    order_type: str  # 'supplier', 'shop_misc', 'subcontractor'
    supplier_id: Optional[uuid.UUID] = None
    supplier_email: Optional[str] = None
    recipient_email: Optional[str] = None
    recipient_user_id: Optional[uuid.UUID] = None
    status: str = "draft"


class ProjectOrderCreate(ProjectOrderBase):
    items: List[ProjectOrderItemCreate]


class ProjectOrderUpdate(BaseModel):
    status: Optional[str] = None
    recipient_email: Optional[str] = None
    recipient_user_id: Optional[uuid.UUID] = None
    email_subject: Optional[str] = None
    email_body: Optional[str] = None
    email_cc: Optional[str] = None
    notes: Optional[str] = None


class ProjectOrderResponse(ProjectOrderBase):
    id: uuid.UUID
    order_code: Optional[str] = None
    email_subject: Optional[str] = None
    email_body: Optional[str] = None
    email_cc: Optional[str] = None
    email_sent: bool
    email_sent_at: Optional[datetime] = None
    delivered_at: Optional[datetime] = None
    delivered_by: Optional[uuid.UUID] = None
    notes: Optional[str] = None
    created_at: datetime
    created_by: Optional[uuid.UUID] = None
    updated_at: Optional[datetime] = None
    items: List[ProjectOrderItemResponse] = []

    class Config:
        from_attributes = True


class GenerateOrdersRequest(BaseModel):
    estimate_id: int

