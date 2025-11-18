import os
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Form, File, UploadFile
from fastapi.responses import Response
from sqlalchemy.orm import Session
from slugify import slugify
import httpx

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
from ..storage.local_provider import LocalStorageProvider
from ..storage.provider import StorageProvider


router = APIRouter(prefix="/files", tags=["files"])


def get_storage() -> StorageProvider:
    """
    Get storage provider based on configuration.
    Uses LocalStorageProvider for local development when Azure Blob is not configured.
    Uses BlobStorageProvider in production (Render) when Azure Blob is configured.
    """
    # Check if Azure Blob Storage is configured
    if settings.azure_blob_connection and settings.azure_blob_container:
        return BlobStorageProvider()
    else:
        # Use local filesystem storage for development
        return LocalStorageProvider()


def get_storage_for_file(fo: FileObject) -> StorageProvider:
    """
    Get the appropriate storage provider for a specific file.
    This ensures that files stored in blob storage can be accessed even in local development
    if Azure credentials are available, and files stored locally can be accessed locally.
    """
    # If the file was stored with blob provider, try to use blob storage
    if fo.provider == "blob":
        # Check if Azure Blob Storage is configured (even in local dev)
        if settings.azure_blob_connection and settings.azure_blob_container:
            try:
                return BlobStorageProvider()
            except Exception:
                # If blob provider fails, fall back to local storage
                pass
    
    # For local files or if blob is not available, use local storage
    return LocalStorageProvider()


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


@router.post("/upload-proxy")
async def upload_proxy(
    file: UploadFile = File(...),
    original_name: str = Form(...),
    content_type: str = Form("application/octet-stream"),
    project_id: Optional[str] = Form(None),
    client_id: Optional[str] = Form(None),
    employee_id: Optional[str] = Form(None),
    category_id: str = Form("files"),
    db: Session = Depends(get_db),
    storage: StorageProvider = Depends(get_storage)
):
    """
    Proxy endpoint for file uploads when direct Azure Blob upload fails due to CORS.
    This endpoint receives the file data and uploads it to Azure Blob Storage on behalf of the client.
    """
    # Read file content
    file_content = await file.read()
    
    # Use provided original_name or filename from upload
    if not original_name or original_name == "upload":
        original_name = file.filename or "upload"
    
    # Generate upload URL
    key = canonical_key(
        project_code=(project_id or client_id or "misc"),
        slug=None,
        category=category_id,
        original_name=original_name,
    )
    upload_url = storage.generate_upload_url(key, content_type, expires_s=900)
    
    # Upload to Azure Blob Storage via backend
    async with httpx.AsyncClient() as client:
        try:
            put_resp = await client.put(
                upload_url,
                content=file_content,
                headers={
                    "Content-Type": content_type,
                    "x-ms-blob-type": "BlockBlob"
                },
                timeout=60.0
            )
            put_resp.raise_for_status()
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to upload to Azure: {str(e)}")
    
    # Confirm upload
    try:
        # Determine provider and container
        if isinstance(storage, LocalStorageProvider):
            provider = "local"
            container = "local"
        else:
            provider = "blob"
            container = settings.azure_blob_container or ""
        
        fo = FileObject(
            provider=provider,
            container=container,
            key=key,
            size_bytes=len(file_content),
            checksum_sha256="na",
            content_type=content_type,
        )
        db.add(fo)
        db.commit()
        db.refresh(fo)
        return {"id": str(fo.id), "key": key}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to confirm upload: {str(e)}")


@router.post("/confirm")
def confirm(req: ConfirmRequest, db: Session = Depends(get_db), storage: StorageProvider = Depends(get_storage)):
    # Check if this is a HEIC file that needs conversion
    is_heic = False
    content_type = req.content_type or ""
    original_key = req.key
    
    # Check by content type
    if 'heic' in content_type.lower() or 'heif' in content_type.lower():
        is_heic = True
    
    # Check by file extension (case-insensitive)
    if original_key.lower().endswith(('.heic', '.heif')):
        is_heic = True
    
    import logging
    logger = logging.getLogger(__name__)
    
    # If it's HEIC, convert to JPG before saving
    if is_heic:
        logger.info(f"Detected HEIC file: {original_key}, content_type: {content_type}")
        try:
            import io
            import httpx
            import time
            from PIL import Image as PILImage
            
            # Ensure pillow-heif is registered and working
            pillow_heif_available = False
            try:
                from pillow_heif import register_heif_opener
                register_heif_opener()
                logger.info("pillow-heif opener registered successfully")
                pillow_heif_available = True
                
                # Test if pillow-heif is actually working by checking if HEIC format is available
                try:
                    # Check if HEIC is in the list of supported formats
                    # registered_extensions() returns a dict mapping extensions to formats
                    registered_exts = PILImage.registered_extensions()
                    has_heic = any(fmt == 'HEIC' for fmt in registered_exts.values()) or '.heic' in registered_exts or '.heif' in registered_exts
                    if not has_heic:
                        logger.warning("HEIC format may not be fully supported - libheif may be missing")
                        pillow_heif_available = False
                except Exception as test_err:
                    logger.warning(f"Could not verify HEIC support: {test_err}")
                    pillow_heif_available = False
            except ImportError as import_err:
                logger.warning(f"pillow-heif module not found. HEIC conversion will be skipped. Install with: pip install pillow-heif. Error: {import_err}")
                pillow_heif_available = False
            except Exception as heif_err:
                logger.warning(f"Failed to register pillow-heif opener: {heif_err}. HEIC conversion will be skipped. Make sure libheif is installed (apt-get install libheif-dev libde265-dev x265). Error: {heif_err}")
                pillow_heif_available = False
            
            # If pillow-heif is not available, try CLI fallback (heif-convert); otherwise save HEIC as-is
            if not pillow_heif_available:
                logger.info(f"pillow-heif not available for {original_key}. Attempting heif-convert CLI fallback.")
                try:
                    import tempfile
                    import subprocess
                    # Small delay to ensure Azure blob is available
                    time.sleep(0.5)
                    download_url = storage.get_download_url(original_key, expires_s=300)
                    if not download_url:
                        raise ValueError("Could not get download URL for HEIC file")
                    with httpx.stream("GET", download_url, timeout=30.0) as r:
                        r.raise_for_status()
                        file_content = b""
                        for chunk in r.iter_bytes():
                            file_content += chunk
                    if len(file_content) == 0:
                        raise ValueError("Downloaded HEIC file is empty")
                    with tempfile.TemporaryDirectory() as td:
                        src_path = os.path.join(td, "in.heic")
                        dst_path = os.path.join(td, "out.jpg")
                        with open(src_path, "wb") as fsrc:
                            fsrc.write(file_content)
                        # heif-convert outputs JPEG
                        subprocess.run(["heif-convert", "-q", "95", src_path, dst_path], check=True, timeout=30)
                        with open(dst_path, "rb") as fdst:
                            jpg_content = fdst.read()
                    # Upload the converted JPG file
                    jpg_key = original_key.rsplit('.', 1)[0] + '.jpg'
                    if jpg_key == original_key:
                        jpg_key = original_key + '.jpg'
                    if original_key.lower().endswith('.heic'):
                        jpg_key = original_key[:-5] + '.jpg'
                    elif original_key.lower().endswith('.heif'):
                        jpg_key = original_key[:-5] + '.jpg'
                    else:
                        jpg_key = original_key.rsplit('.', 1)[0] + '.jpg'
                    upload_url = storage.generate_upload_url(jpg_key, "image/jpeg", expires_s=900)
                    put_resp = httpx.put(
                        upload_url,
                        content=jpg_content,
                        headers={"Content-Type": "image/jpeg", "x-ms-blob-type": "BlockBlob"},
                        timeout=30.0
                    )
                    put_resp.raise_for_status()
                    # Determine provider and container based on storage type
                    if isinstance(storage, LocalStorageProvider):
                        provider = "local"
                        container = "local"
                    else:
                        provider = "blob"
                        container = settings.azure_blob_container or ""
                    
                    fo = FileObject(
                        provider=provider,
                        container=container,
                        key=jpg_key,
                        size_bytes=len(jpg_content),
                        checksum_sha256=req.checksum_sha256,
                        content_type="image/jpeg",
                    )
                    db.add(fo)
                    db.commit()
                    return {"id": str(fo.id)}
                except Exception as cli_err:
                    logger.warning(f"heif-convert fallback failed for {original_key}: {cli_err}. Saving HEIC as-is.", exc_info=True)
                    # Fall through to save the original HEIC file
            
            # Small delay to ensure Azure blob is available
            time.sleep(0.5)
            
            # Download the HEIC file from storage
            download_url = storage.get_download_url(original_key, expires_s=300)
            if not download_url:
                raise ValueError("Could not get download URL for HEIC file")
            
            logger.info(f"Downloading HEIC from Azure: {download_url[:100]}...")
            
            # Download and convert
            with httpx.stream("GET", download_url, timeout=30.0) as r:
                r.raise_for_status()
                file_content = b""
                for chunk in r.iter_bytes():
                    file_content += chunk
            
            logger.info(f"Downloaded {len(file_content)} bytes")
            
            if len(file_content) == 0:
                raise ValueError("Downloaded HEIC file is empty")
            
            # Convert HEIC to JPG
            buf = io.BytesIO(file_content)
            buf.seek(0)
            logger.info("Opening HEIC image with PIL...")
            
            try:
                im = PILImage.open(buf)
                logger.info(f"Opened image: {im.format}, size: {im.size}, mode: {im.mode}")
            except Exception as open_err:
                logger.error(f"Failed to open HEIC with PIL: {open_err}", exc_info=True)
                error_msg = f"Cannot open HEIC file. The pillow-heif library is registered but may not be working correctly. This usually means libheif is not installed on the system. Please install libheif-dev, libde265-dev, and x265. Error: {open_err}"
                raise ValueError(error_msg)
            
            try:
                # Convert to RGB (required for JPG)
                if im.mode != "RGB":
                    im = im.convert("RGB")
                
                # Save as JPG
                jpg_buf = io.BytesIO()
                im.save(jpg_buf, format="JPEG", quality=95, optimize=True)
                jpg_buf.seek(0)
                jpg_content = jpg_buf.read()
                
                logger.info(f"Converted to JPG: {len(jpg_content)} bytes")
            finally:
                im.close()
            
            # Upload the converted JPG file
            jpg_key = original_key.rsplit('.', 1)[0] + '.jpg'
            if jpg_key == original_key:
                jpg_key = original_key + '.jpg'
            
            # Handle case-insensitive extension replacement
            if original_key.lower().endswith('.heic'):
                jpg_key = original_key[:-5] + '.jpg'
            elif original_key.lower().endswith('.heif'):
                jpg_key = original_key[:-5] + '.jpg'
            else:
                jpg_key = original_key.rsplit('.', 1)[0] + '.jpg'
            
            logger.info(f"Uploading converted JPG to Azure: {jpg_key}")
            
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
            
            logger.info(f"Successfully converted and uploaded JPG: {jpg_key}")
            
            # Create FileObject with JPG instead of HEIC
            # Determine provider and container based on storage type
            if isinstance(storage, LocalStorageProvider):
                provider = "local"
                container = "local"
            else:
                provider = "blob"
                container = settings.azure_blob_container or ""
            
            fo = FileObject(
                provider=provider,
                container=container,
                key=jpg_key,
                size_bytes=len(jpg_content),
                checksum_sha256=req.checksum_sha256,  # Keep original checksum
                content_type="image/jpeg",  # Changed to JPEG
            )
            db.add(fo)
            db.commit()
            return {"id": str(fo.id)}
        except Exception as e:
            # If conversion fails, log warning but fall back to saving HEIC as-is
            # This allows uploads to succeed even if libheif is not yet installed
            logger.warning(f"Failed to convert HEIC to JPG for {original_key}: {str(e)}. Saving HEIC file as-is. Error: {str(e)}", exc_info=True)
            # Fall through to save the original HEIC file
    
    # Original code for non-HEIC files
    # Determine provider and container based on storage type
    if isinstance(storage, LocalStorageProvider):
        provider = "local"
        container = "local"
    else:
        provider = "blob"
        container = settings.azure_blob_container or ""
    
    fo = FileObject(
        provider=provider,
        container=container,
        key=req.key,
        size_bytes=req.size_bytes,
        checksum_sha256=req.checksum_sha256,
        content_type=req.content_type,
    )
    db.add(fo)
    db.commit()
    return {"id": str(fo.id)}


@router.get("/local/{file_path:path}")
def serve_local_file(file_path: str):
    """Serve files from local storage for development."""
    from pathlib import Path
    from fastapi.responses import FileResponse
    
    # Security: prevent directory traversal
    clean_path = file_path.lstrip("/").replace("..", "").replace("\\", "/")
    local_storage = LocalStorageProvider()
    file_path_obj = local_storage._get_path(clean_path)
    
    # Ensure the file is within the storage directory
    storage_base = local_storage.base_dir.resolve()
    file_resolved = file_path_obj.resolve()
    
    if not str(file_resolved).startswith(str(storage_base)):
        raise HTTPException(status_code=403, detail="Access denied")
    
    if not file_path_obj.exists():
        raise HTTPException(status_code=404, detail="File not found")
    
    # Determine content type
    content_type = "application/octet-stream"
    if file_path_obj.suffix:
        from mimetypes import guess_type
        guessed = guess_type(str(file_path_obj))
        if guessed[0]:
            content_type = guessed[0]
    
    return FileResponse(
        path=str(file_path_obj),
        media_type=content_type,
        filename=file_path_obj.name
    )


@router.get("/{file_id}/download")
def download(file_id: str, db: Session = Depends(get_db)):
    import logging
    logger = logging.getLogger(__name__)
    
    fo: Optional[FileObject] = db.query(FileObject).filter(FileObject.id == file_id).first()
    if not fo:
        raise HTTPException(status_code=404, detail="File not found")
    
    # Get the appropriate storage provider for this specific file
    storage = get_storage_for_file(fo)
    
    # If using local storage, serve directly
    if isinstance(storage, LocalStorageProvider):
        from fastapi.responses import FileResponse
        from pathlib import Path
        
        file_path = storage._get_path(fo.key)
        if not file_path.exists():
            # File not found locally
            # If this file was stored in blob storage, it won't be available locally
            # unless Azure credentials are configured in local environment
            if fo.provider == "blob":
                logger.warning(
                    f"File {file_id} (key: {fo.key}) not found locally. "
                    f"This file was stored in blob storage. "
                    f"To access it locally, configure AZURE_BLOB_CONNECTION and AZURE_BLOB_CONTAINER environment variables."
                )
            raise HTTPException(status_code=404, detail="File not found")
        
        # Determine content type
        content_type = fo.content_type or "application/octet-stream"
        if file_path.suffix:
            from mimetypes import guess_type
            guessed = guess_type(str(file_path))
            if guessed[0]:
                content_type = guessed[0]
        
        return FileResponse(
            path=str(file_path),
            media_type=content_type,
            filename=Path(fo.key).name
        )
    
    # For blob storage, return download URL
    url = storage.get_download_url(fo.key, expires_s=300)
    if not url:
        raise HTTPException(status_code=404, detail="File not available in blob storage")
    return {"download_url": url, "expires_in": 300}


@router.get("/{file_id}/thumbnail")
def thumbnail(file_id: str, w: int = 200, db: Session = Depends(get_db)):
    import logging
    logger = logging.getLogger(__name__)
    
    fo: Optional[FileObject] = db.query(FileObject).filter(FileObject.id == file_id).first()
    if not fo:
        raise HTTPException(status_code=404, detail="File not found")
    
    # Get the appropriate storage provider for this specific file
    storage = get_storage_for_file(fo)
    
    # Fetch and convert to small PNG
    import io
    import httpx
    from PIL import Image as PILImage
    
    try:
        # For local storage, read file directly
        if isinstance(storage, LocalStorageProvider):
            file_path = storage._get_path(fo.key)
            if not file_path.exists():
                # File not found locally
                # If this file was stored in blob storage, it won't be available locally
                # unless Azure credentials are configured in local environment
                if fo.provider == "blob":
                    logger.warning(
                        f"File {file_id} (key: {fo.key}) not found locally. "
                        f"This file was stored in blob storage. "
                        f"To access it locally, configure AZURE_BLOB_CONNECTION and AZURE_BLOB_CONTAINER environment variables."
                    )
                raise HTTPException(status_code=404, detail="File not found")
            with open(file_path, "rb") as f:
                file_content = f.read()
        else:
            # For blob storage, download from URL
            url = storage.get_download_url(fo.key, expires_s=300)
            if not url:
                raise HTTPException(status_code=404, detail="File not available in blob storage")
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
        # HEIC files can have 'heic' or 'heif' in the first 20 bytes, or 'mif1'/'msf1' slightly later
        if len(file_content) >= 20:
            header = file_content[:20]
            if header[:4] == b'ftyp':
                # Check for HEIC/HEIF brand indicators in first 20 bytes
                # 'heic'/'heif' typically appear around bytes 8-12, 'mif1'/'msf1' around bytes 16-20
                if (b'heic' in header[4:20] or b'heif' in header[4:20] or 
                    b'mif1' in header[4:20] or b'msf1' in header[4:20]):
                    is_heic = True
        
        # Ensure pillow-heif is registered for HEIC files
        if is_heic:
            try:
                from pillow_heif import register_heif_opener
                register_heif_opener()
            except Exception as heif_err:
                logger.warning(f"Could not register HEIF opener: {heif_err}")
        
        # Open and process image
        buf.seek(0)
        try:
            im = PILImage.open(buf)
        except Exception as open_err:
            # If opening failed, check if it might be a HEIC file that wasn't detected
            # This can happen if the file signature check failed or content_type is wrong
            error_msg = str(open_err).lower()
            is_possibly_heic = (
                is_heic or 
                'cannot identify image file' in error_msg or
                original_name.lower().endswith(('.heic', '.heif')) or
                ('heic' in content_type.lower() or 'heif' in content_type.lower())
            )
            
            if is_possibly_heic:
                # Try to register pillow-heif and retry
                try:
                    from pillow_heif import register_heif_opener
                    register_heif_opener()
                    buf.seek(0)
                    im = PILImage.open(buf)
                    logger.info(f"Successfully opened HEIC file after re-registering opener: {original_name}")
                except Exception as retry_err:
                    # Try CLI fallback via heif-convert to JPEG, then open and continue
                    try:
                        import tempfile
                        import subprocess
                        with tempfile.TemporaryDirectory() as td:
                            src_path = os.path.join(td, "in.heic")
                            dst_path = os.path.join(td, "out.jpg")
                            with open(src_path, "wb") as fsrc:
                                fsrc.write(file_content)
                            subprocess.run(["heif-convert", "-q", "90", src_path, dst_path], check=True, timeout=30)
                            with open(dst_path, "rb") as fdst:
                                jpeg_bytes = fdst.read()
                        # Open the produced JPEG with PIL and proceed
                        buf2 = io.BytesIO(jpeg_bytes)
                        buf2.seek(0)
                        im = PILImage.open(buf2)
                        logger.info(f"Thumbnail: opened JPEG from heif-convert fallback for {original_name}")
                    except Exception as cli_err:
                        logger.error(f"Failed to open HEIC file after CLI fallback. File: {original_name}, Error: {cli_err}", exc_info=True)
                        raise ValueError(f"Cannot open HEIC file. Make sure pillow-heif/libheif or heif-convert are installed. Error: {cli_err}")
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
    except HTTPException:
        # Re-raise HTTPException (like 404) as-is, don't convert to 500
        raise
    except Exception as e:
        # Log error for debugging but don't expose to client
        logger.error(f"Thumbnail generation failed for file {file_id} (key: {fo.key if fo else 'unknown'}, content_type: {getattr(fo, 'content_type', 'unknown') if fo else 'unknown'}): {str(e)}", exc_info=True)
        # Return 500 error instead of redirect - browsers can't handle redirects in img tags
        raise HTTPException(status_code=500, detail=f"Failed to generate thumbnail: {str(e)}")

