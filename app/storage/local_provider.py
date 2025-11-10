"""
Local filesystem storage provider for development.
Saves files to a local directory instead of Azure Blob Storage.
"""
import os
from typing import Optional, BinaryIO
from pathlib import Path
from urllib.parse import quote

from ..config import settings
from .provider import StorageProvider


class LocalStorageProvider(StorageProvider):
    """Local filesystem storage provider for development."""
    
    def __init__(self, base_dir: str = "var/storage"):
        self.base_dir = Path(base_dir)
        self.base_dir.mkdir(parents=True, exist_ok=True)
        # Create subdirectories for organization
        (self.base_dir / "uploads").mkdir(exist_ok=True)
        (self.base_dir / "thumbnails").mkdir(exist_ok=True)
    
    def _get_path(self, key: str) -> Path:
        """Get the local filesystem path for a given key."""
        # Remove leading slash and sanitize
        clean_key = key.lstrip("/").replace("..", "").replace("\\", "/")
        return self.base_dir / "uploads" / clean_key
    
    def generate_upload_url(self, key: str, content_type: str, expires_s: int) -> str:
        """Generate a local file URL for upload (for development only)."""
        # In development, we'll use a direct file path
        # The frontend will need to handle this differently, but for now
        # we'll return a URL that the backend can handle
        return f"{settings.public_base_url}/files/local/{quote(key.lstrip('/'))}"
    
    def get_download_url(self, key: str, expires_s: int) -> Optional[str]:
        """Get a local file URL for download."""
        path = self._get_path(key)
        if path.exists():
            return f"{settings.public_base_url}/files/local/{quote(key.lstrip('/'))}"
        return None
    
    def exists(self, key: str) -> bool:
        """Check if a file exists locally."""
        path = self._get_path(key)
        return path.exists()
    
    def copy_in(self, src_stream_or_url: str | BinaryIO, key: str) -> None:
        """Copy a file to local storage."""
        path = self._get_path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        
        if isinstance(src_stream_or_url, str):
            # If it's a URL, we'd need to download it first
            # For now, just log that we can't handle URLs in local storage
            import logging
            logger = logging.getLogger(__name__)
            logger.warning(f"LocalStorageProvider: Cannot copy from URL {src_stream_or_url}")
            return
        
        # Copy from stream
        with open(path, "wb") as f:
            if hasattr(src_stream_or_url, "read"):
                f.write(src_stream_or_url.read())
            else:
                f.write(src_stream_or_url)
    
    def delete(self, key: str) -> None:
        """Delete a file from local storage."""
        path = self._get_path(key)
        try:
            if path.exists():
                path.unlink()
        except Exception:
            pass

