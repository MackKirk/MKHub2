import os
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session
from slugify import slugify

# Register HEIF opener early to support HEIC/HEIF files
try:
    from pillow_heif import register_heif_opener
    register_heif_opener()
except Exception:
    pass  # pillow-heif not available, continue without HEIC support

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
    # Use project_id OR client_id to partition blob paths so uploads from different
    # entities never overwrite when original_name is stable (e.g., 'client-logo.jpg').
    key = canonical_key(
        project_code=(req.project_id or req.client_id or "misc"),
        slug=None,
        category=req.category_id or "files",
        original_name=req.original_name,
    )
    url = storage.generate_upload_url(key, req.content_type, expires_s=900)
    return UploadResponse(key=key, upload_url=url, expires_in=900)


@router.post("/confirm")
def confirm(req: ConfirmRequest, db: Session = Depends(get_db), storage: StorageProvider = Depends(get_storage)):
    # Check if this is a HEIC file that needs conversion
    is_heic = False
    content_type = req.content_type or ""
    original_key = req.key
    
    # Check by content type
    if 'heic' in content_type.lower() or 'heif' in content_type.lower():
        is_heic = True
    
    # Check by file extension
    if original_key.lower().endswith(('.heic', '.heif')):
        is_heic = True
    
    # If it's HEIC, convert to JPG before saving
    if is_heic:
        try:
            import io
            import httpx
            from PIL import Image as PILImage
            
            # Ensure pillow-heif is registered
            try:
                from pillow_heif import register_heif_opener
                register_heif_opener()
            except Exception:
                pass
            
            # Download the HEIC file from storage
            download_url = storage.get_download_url(original_key, expires_s=300)
            if not download_url:
                raise ValueError("Could not get download URL for HEIC file")
            
            # Download and convert
            with httpx.stream("GET", download_url, timeout=30.0) as r:
                r.raise_for_status()
                file_content = b""
                for chunk in r.iter_bytes():
                    file_content += chunk
            
            if len(file_content) == 0:
                raise ValueError("Downloaded HEIC file is empty")
            
            # Convert HEIC to JPG
            buf = io.BytesIO(file_content)
            buf.seek(0)
            with PILImage.open(buf) as im:
                # Convert to RGB (required for JPG)
                if im.mode != "RGB":
                    im = im.convert("RGB")
                
                # Save as JPG
                jpg_buf = io.BytesIO()
                im.save(jpg_buf, format="JPEG", quality=95, optimize=True)
                jpg_buf.seek(0)
                jpg_content = jpg_buf.read()
            
            # Upload the converted JPG file
            jpg_key = original_key.rsplit('.', 1)[0] + '.jpg'
            if jpg_key == original_key:
                jpg_key = original_key + '.jpg'
            
            # Generate upload URL for JPG
            upload_url = storage.generate_upload_url(jpg_key, "image/jpeg", expires_s=900)
            
            # Upload JPG
            put_resp = httpx.put(
                upload_url,
                content=jpg_content,
                headers={"Content-Type": "image/jpeg", "x-ms-blob-type": "BlockBlob"},
                timeout=30.0
            )
            put_resp.raise_for_status()
            
            # Create FileObject with JPG instead of HEIC
            fo = FileObject(
                provider="blob",
                container=settings.azure_blob_container or "",
                key=jpg_key,
                size_bytes=len(jpg_content),
                checksum_sha256=req.checksum_sha256,  # Keep original checksum
                content_type="image/jpeg",  # Changed to JPEG
            )
            db.add(fo)
            db.commit()
            return {"id": str(fo.id)}
        except Exception as e:
            # If conversion fails, log and fall back to saving HEIC as-is
            import logging
            logger = logging.getLogger(__name__)
            logger.warning(f"Failed to convert HEIC to JPG for {original_key}: {str(e)}", exc_info=True)
            # Continue with original HEIC file
    
    # Original code for non-HEIC files or fallback
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


@router.get("/{file_id}/thumbnail")
def thumbnail(file_id: str, w: int = 200, db: Session = Depends(get_db), storage: StorageProvider = Depends(get_storage)):
    fo: Optional[FileObject] = db.query(FileObject).filter(FileObject.id == file_id).first()
    if not fo:
        raise HTTPException(status_code=404, detail="File not found")
    url = storage.get_download_url(fo.key, expires_s=300)
    if not url:
        raise HTTPException(status_code=404, detail="Not available")
    # Fetch and convert to small PNG
    import io
    import httpx
    from PIL import Image as PILImage
    
    try:
        # Download file from storage
        with httpx.stream("GET", url, timeout=30.0) as r:
            r.raise_for_status()
            # Read all content into bytes
            file_content = b""
            for chunk in r.iter_bytes():
                file_content += chunk
        
        # Check if file has content
        if len(file_content) == 0:
            raise ValueError("Downloaded file is empty")
        
        # Create buffer from bytes
        buf = io.BytesIO(file_content)
        buf.seek(0)
        
        # Try to detect if it's a HEIC file by extension or content type
        is_heic = False
        original_name = str(fo.key) if fo else ''
        content_type = str(fo.content_type) if fo and fo.content_type else ''
        
        # Check by extension
        if original_name.lower().endswith(('.heic', '.heif')):
            is_heic = True
        
        # Check by content type
        if 'heic' in content_type.lower() or 'heif' in content_type.lower():
            is_heic = True
        
        # Check file signature (HEIC files start with ftyp box)
        if len(file_content) >= 12:
            header = file_content[:12]
            if header[:4] == b'ftyp':
                # Check for HEIC/HEIF brand indicators
                if b'heic' in header[4:12] or b'heif' in header[4:12] or b'mif1' in header[4:12] or b'msf1' in header[4:12]:
                    is_heic = True
        
        # Ensure pillow-heif is registered for HEIC files
        if is_heic:
            try:
                from pillow_heif import register_heif_opener
                register_heif_opener()
            except Exception as heif_err:
                import logging
                logger = logging.getLogger(__name__)
                logger.warning(f"Could not register HEIF opener: {heif_err}")
        
        # Open and process image
        buf.seek(0)
        try:
            im = PILImage.open(buf)
        except Exception as open_err:
            # If opening failed and it's a HEIC file, try to re-register and retry
            if is_heic:
                try:
                    from pillow_heif import register_heif_opener
                    register_heif_opener()
                    buf.seek(0)
                    im = PILImage.open(buf)
                except Exception as retry_err:
                    raise ValueError(f"Cannot open HEIC file. Make sure pillow-heif is properly installed: {retry_err}")
            else:
                # For non-HEIC files, provide more details
                raise ValueError(f"Cannot identify image file (size: {len(file_content)} bytes, content_type: {content_type}, key: {original_name}): {open_err}")
        
        try:
            # Convert to RGB (needed for HEIC and some other formats)
            if im.mode != "RGB":
                im = im.convert("RGB")
            # Resize to width maintaining aspect
            target_w = max(80, min(1024, int(w or 200)))
            scale = target_w / float(im.width)
            target_h = int(im.height * scale)
            im = im.resize((target_w, max(1, target_h)), PILImage.Resampling.LANCZOS)
            out = io.BytesIO()
            im.save(out, format="PNG", optimize=True)
            out.seek(0)
            return Response(content=out.read(), media_type="image/png")
        finally:
            im.close()
    except Exception as e:
        # Log error for debugging but don't expose to client
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Thumbnail generation failed for file {file_id} (key: {fo.key if fo else 'unknown'}, content_type: {getattr(fo, 'content_type', 'unknown') if fo else 'unknown'}): {str(e)}", exc_info=True)
        # Return 500 error instead of redirect - browsers can't handle redirects in img tags
        raise HTTPException(status_code=500, detail=f"Failed to generate thumbnail: {str(e)}")

