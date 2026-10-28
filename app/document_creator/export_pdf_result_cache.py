"""
In-process TTL cache for streamed PDF export results.

Single-process deployments (typical Render web dyno) only. Multi-worker setups
need sticky sessions or an external store — tokens are not shared across processes.
"""
from __future__ import annotations

import threading
import time
import uuid
from dataclasses import dataclass
from typing import Optional


TTL_SECONDS = 5 * 60


@dataclass
class ExportPdfResult:
    pdf_bytes: bytes
    user_id: uuid.UUID
    document_id: uuid.UUID
    filename: str
    expires_at: float


_lock = threading.Lock()
_store: dict[str, ExportPdfResult] = {}


def _purge_expired_locked(now: float) -> None:
    dead = [k for k, v in _store.items() if v.expires_at <= now]
    for k in dead:
        _store.pop(k, None)


def store_export_pdf_result(
    *,
    pdf_bytes: bytes,
    user_id: uuid.UUID,
    document_id: uuid.UUID,
    filename: str,
    ttl_seconds: int = TTL_SECONDS,
) -> str:
    token = uuid.uuid4().hex
    now = time.time()
    with _lock:
        _purge_expired_locked(now)
        _store[token] = ExportPdfResult(
            pdf_bytes=pdf_bytes,
            user_id=user_id,
            document_id=document_id,
            filename=filename or "document.pdf",
            expires_at=now + max(30, int(ttl_seconds)),
        )
    return token


def take_export_pdf_result(
    token: str,
    *,
    user_id: uuid.UUID,
    document_id: uuid.UUID,
) -> Optional[ExportPdfResult]:
    """One-shot fetch: returns and removes the entry when valid."""
    now = time.time()
    with _lock:
        _purge_expired_locked(now)
        item = _store.get(token)
        if not item:
            return None
        if item.expires_at <= now:
            _store.pop(token, None)
            return None
        if item.user_id != user_id or item.document_id != document_id:
            return None
        return _store.pop(token, None)
