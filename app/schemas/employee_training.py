"""Pydantic schemas for manual employee training records (HR), not LMS courses."""
from datetime import date, datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field, model_validator


class EmployeeTrainingRecordBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=500)
    provider: Optional[str] = Field(None, max_length=500)
    category: Optional[str] = Field(None, max_length=100)
    delivery_format: Optional[str] = Field(None, max_length=50)
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    completion_date: date
    duration_hours: Optional[float] = Field(None, ge=0, le=10000)
    status: str = Field(default="completed", max_length=50)
    certificate_number: Optional[str] = Field(None, max_length=255)
    expiry_date: Optional[date] = None
    notes: Optional[str] = None


class EmployeeTrainingRecordCreate(EmployeeTrainingRecordBase):
    @model_validator(mode="after")
    def end_after_start(self):
        if self.start_date and self.end_date and self.end_date < self.start_date:
            raise ValueError("end_date must be on or after start_date")
        return self


class EmployeeTrainingRecordUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=500)
    provider: Optional[str] = Field(None, max_length=500)
    category: Optional[str] = Field(None, max_length=100)
    delivery_format: Optional[str] = Field(None, max_length=50)
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    completion_date: Optional[date] = None
    duration_hours: Optional[float] = Field(None, ge=0, le=10000)
    status: Optional[str] = Field(None, max_length=50)
    certificate_number: Optional[str] = Field(None, max_length=255)
    expiry_date: Optional[date] = None
    notes: Optional[str] = None


class EmployeeTrainingRecordRead(BaseModel):
    id: UUID
    user_id: UUID
    title: str
    provider: Optional[str] = None
    category: Optional[str] = None
    delivery_format: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    completion_date: date
    duration_hours: Optional[float] = None
    status: str
    certificate_number: Optional[str] = None
    expiry_date: Optional[date] = None
    notes: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    created_by_user_id: Optional[UUID] = None

    class Config:
        from_attributes = True
