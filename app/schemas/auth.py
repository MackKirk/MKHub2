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
    first_name: Optional[str]
    last_name: Optional[str]
    preferred_name: Optional[str]
    gender: Optional[str]
    date_of_birth: Optional[str]
    marital_status: Optional[str]
    nationality: Optional[str]
    phone: Optional[str]
    mobile_phone: Optional[str]
    address_line1: Optional[str]
    address_line2: Optional[str]
    city: Optional[str]
    province: Optional[str]
    postal_code: Optional[str]
    country: Optional[str]
    # employment
    hire_date: Optional[str]
    termination_date: Optional[str]
    job_title: Optional[str]
    division: Optional[str]
    work_email: Optional[EmailStr]
    work_phone: Optional[str]
    manager_user_id: Optional[str]
    # financial/contract
    pay_rate: Optional[str]
    pay_type: Optional[str]
    employment_type: Optional[str]
    # legal
    sin_number: Optional[str]
    work_permit_status: Optional[str]
    visa_status: Optional[str]
    emergency_contact_name: Optional[str]
    emergency_contact_relationship: Optional[str]
    emergency_contact_phone: Optional[str]

