"""Hub access enforcement — deny-by-default when restricted mode + blocked."""
from __future__ import annotations

import logging
import uuid
from typing import Optional

from fastapi import Depends, HTTPException, Request
from starlette.requests import HTTPConnection
from sqlalchemy.orm import Session

from ..config import settings
from ..db import SessionLocal, get_db
from ..models.models import User
from ..services.signature_compliance import ComplianceCheckError, get_signature_compliance
from .hub_route_manifest import is_public_path, is_restricted_allowed
from .security import decode_token

logger = logging.getLogger(__name__)


def _extract_bearer_token(conn: HTTPConnection) -> Optional[str]:
    auth = (conn.headers.get("authorization") or conn.headers.get("Authorization") or "").strip()
    if auth.lower().startswith("bearer "):
        token = auth[7:].strip()
        if token:
            return token
    return (conn.query_params.get("access_token") or "").strip() or None


def _optional_user(conn: HTTPConnection, db: Session) -> Optional[User]:
    raw = _extract_bearer_token(conn)
    if not raw:
        return None
    try:
        payload = decode_token(raw)
        user_uuid = uuid.UUID(str(payload.get("sub")))
    except Exception:
        return None
    user = db.query(User).filter(User.id == user_uuid).first()
    if user is None or not user.is_active:
        return None
    return user


def _log_compliance_failure(conn: HTTPConnection, exc: Exception) -> None:
    logger.critical(
        "signature_compliance_check_failed path=%s error=%s",
        conn.url.path,
        exc,
        exc_info=exc,
    )
    try:
        from ..services.system_log import write_system_log

        slog_db = SessionLocal()
        try:
            write_system_log(
                slog_db,
                level="critical",
                category="signature_compliance",
                message=f"Compliance check failed: {exc}"[:500],
                path=conn.url.path,
                method=getattr(conn, "method", "WEBSOCKET"),
            )
            slog_db.commit()
        finally:
            slog_db.close()
    except Exception:
        pass


def require_hub_access(
    request: Request,
    db: Session = Depends(get_db),
) -> None:
    conn: HTTPConnection = request
    if not settings.signature_restricted_mode:
        return

    path = conn.url.path
    method = conn.method

    if is_public_path(method, path):
        return

    user = _optional_user(conn, db)
    if user is None:
        return

    try:
        compliance = get_signature_compliance(db, user.id)
    except ComplianceCheckError as exc:
        _log_compliance_failure(conn, exc)
        return

    if not compliance.blocked:
        return

    if is_restricted_allowed(method, path):
        return

    raise HTTPException(
        status_code=403,
        detail="Hub access restricted — pending signatures must be completed",
    )
