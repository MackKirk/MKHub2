import uuid
from datetime import date, datetime
from typing import List, Optional

from pydantic import BaseModel, Field, field_validator


STATUS_VALUES = frozenset({"active", "cancelled", "replaced", "lost"})


class FuelCardBase(BaseModel):
    card_number: str = Field(..., min_length=1, max_length=100)
    pin: str = Field(..., min_length=1, max_length=50)
    date_issued: date
    status: str = "active"
    notes: Optional[str] = None

    @field_validator("card_number")
    @classmethod
    def card_number_ok(cls, v: str) -> str:
        s = (v or "").strip()
        if not s:
            raise ValueError("card_number is required")
        return s

    @field_validator("pin")
    @classmethod
    def pin_ok(cls, v: str) -> str:
        s = (v or "").strip()
        if not s:
            raise ValueError("pin is required")
        return s

    @field_validator("status")
    @classmethod
    def status_ok(cls, v: str) -> str:
        x = (v or "").strip().lower()
        if x not in STATUS_VALUES:
            raise ValueError(f"status must be one of: {', '.join(sorted(STATUS_VALUES))}")
        return x


class FuelCardCreate(FuelCardBase):
    pass


class FuelCardUpdate(BaseModel):
    card_number: Optional[str] = Field(None, min_length=1, max_length=100)
    pin: Optional[str] = Field(None, min_length=1, max_length=50)
    date_issued: Optional[date] = None
    status: Optional[str] = None
    notes: Optional[str] = None

    @field_validator("card_number")
    @classmethod
    def card_number_ok_opt(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        s = v.strip()
        if not s:
            raise ValueError("card_number cannot be empty")
        return s

    @field_validator("pin")
    @classmethod
    def pin_ok_opt(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        s = v.strip()
        if not s:
            raise ValueError("pin cannot be empty")
        return s

    @field_validator("status")
    @classmethod
    def status_ok_opt(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        x = v.strip().lower()
        if x not in STATUS_VALUES:
            raise ValueError(f"status must be one of: {', '.join(sorted(STATUS_VALUES))}")
        return x


class FuelCardResponse(FuelCardBase):
    id: uuid.UUID
    created_at: datetime
    updated_at: Optional[datetime] = None
    created_by: Optional[uuid.UUID] = None

    class Config:
        from_attributes = True


class FuelCardListItemResponse(FuelCardResponse):
    assigned_to_name: Optional[str] = None

    class Config:
        from_attributes = True


class FuelCardListResponse(BaseModel):
    items: List[FuelCardListItemResponse]
    total: int
    page: int
    limit: int
    total_pages: int


class FuelCardAssignmentCreate(BaseModel):
    assigned_to_user_id: uuid.UUID
    notes: Optional[str] = None


class FuelCardAssignmentReturn(BaseModel):
    notes: Optional[str] = None


class FuelCardAssignmentResponse(BaseModel):
    id: uuid.UUID
    fuel_card_id: uuid.UUID
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
