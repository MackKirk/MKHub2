import os
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from slugify import slugify

from ..config import settings
from ..db import get_db
from ..models.models import FileObject
from ..schemas.files import UploadRequest, UploadResponse, ConfirmRequest
from ..storage.blob_provider import BlobStorageProvider
from ..storage.provider import StorageProvider


router = APIRouter(prefix="/files", tags=["files"])


def get_storage() -> StorageProvider:
    # For now, only blob provider supported; SharePoint adapter would be added later
    return BlobStorageProvider()


def canonical_key(
    project_code: Optional[str], slug: Optional[str], category: Optional[str], original_name: str
) -> str:
    today = datetime.utcnow().strftime("%Y-%m-%d")
    year = datetime.utcnow().strftime("%Y")
    safe_name = slugify(os.path.splitext(original_name)[0])
    ext = os.path.splitext(original_name)[1]
    proj = slugify(project_code or "misc")
    folder = slugify(category or "files")
    slug_part = f"-{slugify(slug)}" if slug else ""
    return f"/org/{year}/{proj}{slug_part}/{folder}/{today}_{safe_name}{ext}"


@router.post("/upload", response_model=UploadResponse)
def upload(req: UploadRequest, storage: StorageProvider = Depends(get_storage)):
    key = canonical_key(
        project_code=req.project_id or "misc",
        slug=None,
        category=req.category_id or "files",
        original_name=req.original_name,
    )
    url = storage.generate_upload_url(key, req.content_type, expires_s=900)
    return UploadResponse(key=key, upload_url=url, expires_in=900)


@router.post("/confirm")
def confirm(req: ConfirmRequest, db: Session = Depends(get_db)):
    fo = FileObject(
        provider="blob",
        container=settings.azure_blob_container or "",
        key=req.key,
        size_bytes=req.size_bytes,
        checksum_sha256=req.checksum_sha256,
        content_type=req.content_type,
    )
    db.add(fo)
    db.commit()
    return {"id": str(fo.id)}


@router.get("/{file_id}/download")
def download(file_id: str, db: Session = Depends(get_db), storage: StorageProvider = Depends(get_storage)):
    fo: Optional[FileObject] = db.query(FileObject).filter(FileObject.id == file_id).first()
    if not fo:
        raise HTTPException(status_code=404, detail="File not found")
    url = storage.get_download_url(fo.key, expires_s=300)
    if not url:
        raise HTTPException(status_code=404, detail="Not available")
    return {"download_url": url, "expires_in": 300}

