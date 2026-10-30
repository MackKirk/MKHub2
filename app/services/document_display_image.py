"""One on-screen copy per file, stored next to the original.

The original blob stays full size for PDF export. A single 1600px derivative
is written once under org/display/{file_id}. The server disk cache is only a
hot copy of that derivative. At most two renders run at a time.
"""
from __future__ import annotations

import io
import logging
import queue
import threading
from typing import Optional

import httpx

from ..config import settings
from ..storage.blob_provider import BlobStorageProvider
from ..storage.local_provider import LocalStorageProvider
from ..storage.provider import StorageProvider
from .image_thumbnails import (
    DISPLAY_THUMB_WIDTH,
    ThumbnailResult,
    cache_lookup,
    cache_store,
    render_thumbnail,
    thumbnail_slot,
)

logger = logging.getLogger(__name__)

_DISPLAY_PREFIX = "org/display"
_QUEUE_MAX = 500
_job_queue: queue.Queue = queue.Queue(maxsize=_QUEUE_MAX)
_workers_lock = threading.Lock()
_workers_started = False


def display_object_key(file_id: str, media_type: str) -> str:
    ext = "png" if media_type == "image/png" else "jpg"
    return f"{_DISPLAY_PREFIX}/{file_id}.{ext}"


def _candidate_keys(file_id: str) -> list[tuple[str, str]]:
    return [
        (f"{_DISPLAY_PREFIX}/{file_id}.jpg", "image/jpeg"),
        (f"{_DISPLAY_PREFIX}/{file_id}.png", "image/png"),
    ]


def storage_for_provider(provider: str) -> StorageProvider:
    if provider == "blob" and settings.azure_blob_connection and settings.azure_blob_container:
        try:
            return BlobStorageProvider()
        except Exception:
            logger.warning("blob storage unavailable, using local storage for display image", exc_info=True)
    return LocalStorageProvider()


def _read_object_bytes(storage: StorageProvider, key: str) -> Optional[bytes]:
    if not storage.exists(key):
        return None
    if isinstance(storage, LocalStorageProvider):
        path = storage._get_path(key)
        if not path.is_file():
            return None
        return path.read_bytes()
    url = storage.get_download_url(key, expires_s=300)
    if not url:
        return None
    with httpx.stream("GET", url, timeout=30.0) as response:
        if response.status_code == 404:
            return None
        response.raise_for_status()
        buf = bytearray()
        for chunk in response.iter_bytes(65536):
            buf.extend(chunk)
        return bytes(buf)


def _put_object_bytes(storage: StorageProvider, key: str, data: bytes, content_type: str) -> None:
    if isinstance(storage, BlobStorageProvider):
        from azure.storage.blob import ContentSettings

        client = storage._service.get_blob_client(storage._container, key.lstrip("/"))
        client.upload_blob(
            io.BytesIO(data),
            overwrite=True,
            content_settings=ContentSettings(content_type=content_type),
        )
        return
    storage.copy_in(io.BytesIO(data), key)


def load_stored_display(storage: StorageProvider, file_id: str) -> Optional[ThumbnailResult]:
    for key, media_type in _candidate_keys(file_id):
        data = _read_object_bytes(storage, key)
        if data:
            return ThumbnailResult(data, media_type)
    return None


def delete_display_copies(storage: StorageProvider, file_id: str) -> None:
    for key, _media_type in _candidate_keys(file_id):
        try:
            storage.delete(key)
        except Exception:
            logger.warning("failed to delete display copy %s", key, exc_info=True)


def ensure_display_copy(
    storage: StorageProvider,
    *,
    file_id: str,
    source_key: str,
    size_bytes: int,
    content_type: str = "",
) -> ThumbnailResult:
    """Return the 1600px copy, creating and uploading it once if it is missing."""
    width = DISPLAY_THUMB_WIDTH
    cached = cache_lookup(file_id, width, size_bytes)
    if cached is not None:
        return cached

    stored = load_stored_display(storage, file_id)
    if stored is not None:
        cache_store(file_id, width, size_bytes, stored)
        return stored

    with thumbnail_slot():
        cached = cache_lookup(file_id, width, size_bytes)
        if cached is not None:
            return cached
        stored = load_stored_display(storage, file_id)
        if stored is not None:
            cache_store(file_id, width, size_bytes, stored)
            return stored

        original = _read_object_bytes(storage, source_key)
        if not original:
            from fastapi import HTTPException

            raise HTTPException(status_code=404, detail="File not found in storage")
        result = render_thumbnail(
            original,
            width,
            original_name=source_key,
            content_type=content_type,
        )
        try:
            _put_object_bytes(storage, display_object_key(file_id, result.media_type), result.content, result.media_type)
        except Exception:
            logger.warning("failed to store display copy for %s", file_id, exc_info=True)
        cache_store(file_id, width, size_bytes, result)
        return result


def _worker() -> None:
    while True:
        job = _job_queue.get()
        try:
            file_id, source_key, size_bytes, content_type, provider = job
            storage = storage_for_provider(provider)
            ensure_display_copy(
                storage,
                file_id=file_id,
                source_key=source_key,
                size_bytes=int(size_bytes or 0),
                content_type=content_type or "",
            )
        except Exception:
            logger.warning("display image job failed", exc_info=True)
        finally:
            _job_queue.task_done()


def _ensure_workers() -> None:
    global _workers_started
    with _workers_lock:
        if _workers_started:
            return
        for index in range(2):
            thread = threading.Thread(target=_worker, name=f"display-image-{index}", daemon=True)
            thread.start()
        _workers_started = True


def enqueue_display_job(
    *,
    file_id: str,
    source_key: str,
    size_bytes: int,
    content_type: str,
    provider: str,
) -> None:
    """Hand the render to the two background workers. The upload request does not wait."""
    _ensure_workers()
    job = (str(file_id), str(source_key or ""), int(size_bytes or 0), str(content_type or ""), str(provider or ""))
    try:
        _job_queue.put_nowait(job)
    except queue.Full:
        logger.warning("display image queue full; file %s will be built on first view", file_id)
