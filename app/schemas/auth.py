from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List


class UsernameSuggestRequest(BaseModel):
    first_name: str
    last_name: str


class UsernameSuggestResponse(BaseModel):
    suggested: str
    available: bool


class InviteRequest(BaseModel):
    email_personal: EmailStr


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
    preferred_name: Optional[str] = None
    gender: Optional[str] = None
    date_of_birth: Optional[str] = None
    marital_status: Optional[str] = None
    nationality: Optional[str] = None
    phone: Optional[str] = None
    mobile_phone: Optional[str] = None
    address_line1: Optional[str] = None
    address_line2: Optional[str] = None
    city: Optional[str] = None
    province: Optional[str] = None
    postal_code: Optional[str] = None
    country: Optional[str] = None
    # employment
    hire_date: Optional[str] = None
    termination_date: Optional[str] = None
    job_title: Optional[str] = None
    division: Optional[str] = None
    work_email: Optional[EmailStr] = None
    work_phone: Optional[str] = None
    manager_user_id: Optional[str] = None
    # financial/contract
    pay_rate: Optional[str] = None
    pay_type: Optional[str] = None
    employment_type: Optional[str] = None
    # legal
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

