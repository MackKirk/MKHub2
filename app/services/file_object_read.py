"""Read raw bytes from storage for a FileObject (server-side, no HTTP user context)."""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Optional

import httpx
from ..models.models import FileObject
from ..routes.files import get_storage_for_file
from ..storage.local_provider import LocalStorageProvider

logger = logging.getLogger(__name__)


def read_file_object_bytes(fo: FileObject) -> Optional[bytes]:
    """
    Load file bytes from local path or blob (same resolution rules as inline file serving).
    Returns None if the file is missing or fetch fails.
    """
    try:
        storage = get_storage_for_file(fo)
        if isinstance(storage, LocalStorageProvider):
            file_path = storage._get_path(fo.key)
            if not file_path.exists():
                logger.warning("file_object_read: missing local path for %s key=%s", fo.id, fo.key)
                return None
            return Path(file_path).read_bytes()
        url = storage.get_download_url(fo.key, expires_s=300)
        if not url:
            return None
        with httpx.Client(timeout=120.0) as client:
            r = client.get(url)
            r.raise_for_status()
            return r.content
    except Exception as e:
        logger.warning("file_object_read: failed for %s: %s", fo.id, e)
        return None
