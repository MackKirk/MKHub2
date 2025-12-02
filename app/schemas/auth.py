from pydantic import BaseModel, EmailStr, Field, field_validator
from typing import Optional, List


class UsernameSuggestRequest(BaseModel):
    first_name: str
    last_name: str


class UsernameSuggestResponse(BaseModel):
    suggested: str
    available: bool


class InviteRequest(BaseModel):
    email_personal: EmailStr
    division_id: Optional[str] = None  # Legacy: kept for backward compatibility
    division_name: Optional[str] = None  # Legacy: kept for backward compatibility
    division_ids: Optional[List[str]] = None  # Array of division IDs (UUIDs as strings)
    document_ids: Optional[List[str]] = None
    needs_email: bool = False
    needs_business_card: bool = False
    needs_phone: bool = False
    needs_vehicle: bool = False
    needs_equipment: bool = False
    equipment_list: Optional[str] = None
    # Job information
    hire_date: Optional[str] = None
    job_title: Optional[str] = None
    work_email: Optional[EmailStr] = None
    work_phone: Optional[str] = None
    manager_user_id: Optional[str] = None
    pay_rate: Optional[str] = None
    pay_type: Optional[str] = None
    employment_type: Optional[str] = None


class RegisterRequest(BaseModel):
    invite_token: str
    password: str = Field(min_length=8)
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email_personal: Optional[EmailStr] = None


class LoginRequest(BaseModel):
    identifier: str  # username or email
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class MeResponse(BaseModel):
    id: str
    username: str
    email_personal: EmailStr
    email_corporate: Optional[EmailStr]
    roles: List[str] = []
    permissions: List[str] = []


class EmployeeProfileInput(BaseModel):
    # personal info
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    middle_name: Optional[str] = None
    preferred_name: Optional[str] = None
    gender: Optional[str] = None
    date_of_birth: Optional[str] = None
    marital_status: Optional[str] = None
    nationality: Optional[str] = None
    phone: Optional[str] = None
    mobile_phone: Optional[str] = None
    address_line1: Optional[str] = None
    address_line1_complement: Optional[str] = None
    address_line2: Optional[str] = None
    address_line2_complement: Optional[str] = None
    city: Optional[str] = None
    province: Optional[str] = None
    postal_code: Optional[str] = None
    country: Optional[str] = None
    # employment
    hire_date: Optional[str] = None
    termination_date: Optional[str] = None
    job_title: Optional[str] = None
    division: Optional[str] = None
    work_email: Optional[str] = None  # Changed from EmailStr to str to allow empty strings (validation happens in endpoint)
    work_phone: Optional[str] = None
    manager_user_id: Optional[str] = None
    # financial/contract
    pay_rate: Optional[str] = None
    pay_type: Optional[str] = None
    employment_type: Optional[str] = None
    # legal
    profile_photo_file_id: Optional[str] = None
    sin_number: Optional[str] = None
    work_permit_status: Optional[str] = None
    visa_status: Optional[str] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_relationship: Optional[str] = None
    emergency_contact_phone: Optional[str] = None


class RegisterPayload(BaseModel):
    invite_token: str
    password: str = Field(min_length=8)
    first_name: str
    last_name: str
    profile: Optional[EmployeeProfileInput] = None

