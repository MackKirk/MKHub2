"""Read/write FileObject bytes for onboarding PDFs."""
import io
import os
from datetime import datetime
from typing import Optional
from urllib.parse import quote
from uuid import UUID

from sqlalchemy.orm import Session

from ..config import settings
from ..models.models import FileObject
from ..routes.files import canonical_key, get_storage
from ..storage.local_provider import LocalStorageProvider


def read_file_object_bytes(db: Session, fo: FileObject) -> bytes:
    storage = get_storage()
    if isinstance(storage, LocalStorageProvider):
        path = storage._get_path(fo.key)
        if not path.exists():
            raise FileNotFoundError(f"Missing file: {fo.key}")
        return path.read_bytes()
    from azure.storage.blob import BlobServiceClient

    if not settings.azure_blob_connection or not settings.azure_blob_container:
        raise RuntimeError("Blob not configured")
    svc = BlobServiceClient.from_connection_string(settings.azure_blob_connection)
    client = svc.get_blob_client(settings.azure_blob_container, fo.key.lstrip("/"))
    return client.download_blob().readall()


def save_pdf_bytes_as_file_object(
    db: Session,
    pdf_bytes: bytes,
    original_name: str,
    employee_id: UUID,
    created_by_id: Optional[UUID] = None,
) -> FileObject:
    """Store PDF in blob/local and persist FileObject (same pattern as upload-proxy)."""
    storage = get_storage()
    key = canonical_key(
        project_code="onboarding",
        slug=str(employee_id)[:8],
        category="signed-onboarding",
        original_name=original_name or "signed.pdf",
    )
    bio = io.BytesIO(pdf_bytes)
    bio.seek(0)
    storage.copy_in(bio, key)
    if isinstance(storage, LocalStorageProvider):
        provider, container = "local", "local"
    else:
        provider, container = "blob", settings.azure_blob_container or ""
    fo = FileObject(
        provider=provider,
        container=container,
        key=key,
        size_bytes=len(pdf_bytes),
        checksum_sha256="na",
        content_type="application/pdf",
        employee_id=employee_id,
        created_by=created_by_id,
    )
    db.add(fo)
    db.flush()
    return fo
