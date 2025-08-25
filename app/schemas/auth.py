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

