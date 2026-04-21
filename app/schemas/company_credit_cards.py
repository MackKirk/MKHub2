import uuid
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field, field_validator


NETWORK_VALUES = frozenset({"visa", "mastercard", "amex", "other"})
STATUS_VALUES = frozenset({"active", "cancelled", "replaced", "lost"})


class CompanyCreditCardBase(BaseModel):
    label: str = Field(..., min_length=1, max_length=255)
    network: str
    last_four: str = Field(..., min_length=4, max_length=4)
    expiry_month: int = Field(..., ge=1, le=12)
    expiry_year: int = Field(..., ge=2020, le=2100)
    cardholder_name: Optional[str] = None
    issuer: Optional[str] = None
    billing_entity: Optional[str] = None
    status: str = "active"
    notes: Optional[str] = None
    documents: Optional[List[uuid.UUID]] = None

    @field_validator("last_four")
    @classmethod
    def last_four_digits(cls, v: str) -> str:
        s = (v or "").strip()
        if len(s) != 4 or not s.isdigit():
            raise ValueError("last_four must be exactly 4 digits")
        return s

    @field_validator("network")
    @classmethod
    def network_ok(cls, v: str) -> str:
        x = (v or "").strip().lower()
        if x not in NETWORK_VALUES:
            raise ValueError(f"network must be one of: {', '.join(sorted(NETWORK_VALUES))}")
        return x

    @field_validator("status")
    @classmethod
    def status_ok(cls, v: str) -> str:
        x = (v or "").strip().lower()
        if x not in STATUS_VALUES:
            raise ValueError(f"status must be one of: {', '.join(sorted(STATUS_VALUES))}")
        return x


class CompanyCreditCardCreate(CompanyCreditCardBase):
    pass


class CompanyCreditCardUpdate(BaseModel):
    label: Optional[str] = Field(None, min_length=1, max_length=255)
    network: Optional[str] = None
    last_four: Optional[str] = Field(None, min_length=4, max_length=4)
    expiry_month: Optional[int] = Field(None, ge=1, le=12)
    expiry_year: Optional[int] = Field(None, ge=2020, le=2100)
    cardholder_name: Optional[str] = None
    issuer: Optional[str] = None
    billing_entity: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None
    documents: Optional[List[uuid.UUID]] = None

    @field_validator("last_four")
    @classmethod
    def last_four_digits_opt(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        s = v.strip()
        if len(s) != 4 or not s.isdigit():
            raise ValueError("last_four must be exactly 4 digits")
        return s

    @field_validator("network")
    @classmethod
    def network_ok_opt(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        x = v.strip().lower()
        if x not in NETWORK_VALUES:
            raise ValueError(f"network must be one of: {', '.join(sorted(NETWORK_VALUES))}")
        return x

    @field_validator("status")
    @classmethod
    def status_ok_opt(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        x = v.strip().lower()
        if x not in STATUS_VALUES:
            raise ValueError(f"status must be one of: {', '.join(sorted(STATUS_VALUES))}")
        return x


class CompanyCreditCardResponse(CompanyCreditCardBase):
    id: uuid.UUID
    created_at: datetime
    updated_at: Optional[datetime] = None
    created_by: Optional[uuid.UUID] = None

    class Config:
        from_attributes = True


class CompanyCreditCardListItemResponse(CompanyCreditCardResponse):
    assigned_to_name: Optional[str] = None

    class Config:
        from_attributes = True


class CompanyCreditCardListResponse(BaseModel):
    items: List[CompanyCreditCardListItemResponse]
    total: int
    page: int
    limit: int
    total_pages: int


class CompanyCreditCardAssignmentCreate(BaseModel):
    assigned_to_user_id: uuid.UUID
    notes: Optional[str] = None


class CompanyCreditCardAssignmentReturn(BaseModel):
    notes: Optional[str] = None


class CompanyCreditCardAssignmentResponse(BaseModel):
    id: uuid.UUID
    company_credit_card_id: uuid.UUID
    assigned_to_user_id: uuid.UUID
    assigned_at: datetime
    returned_at: Optional[datetime] = None
    returned_to_user_id: Optional[uuid.UUID] = None
    notes: Optional[str] = None
    is_active: bool
    created_by: Optional[uuid.UUID] = None
    created_at: datetime
    assigned_to_name: Optional[str] = None

    class Config:
        from_attributes = True
