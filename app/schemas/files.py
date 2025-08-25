from pydantic import BaseModel
from typing import Optional


class UploadRequest(BaseModel):
    project_id: Optional[str]
    client_id: Optional[str]
    employee_id: Optional[str]
    category_id: Optional[str]
    original_name: str
    content_type: str


class UploadResponse(BaseModel):
    key: str
    upload_url: str
    expires_in: int


class ConfirmRequest(BaseModel):
    key: str
    size_bytes: int
    checksum_sha256: str

