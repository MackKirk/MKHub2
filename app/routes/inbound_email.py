"""Webhook for inbound email (Microsoft 365 / Power Automate JSON; multipart also OK)."""
from __future__ import annotations

import logging
import secrets
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from sqlalchemy.orm import Session

from ..config import settings
from ..db import get_db
from ..services.inbound_email import (
    parse_office365_json,
    parse_sendgrid_inbound_form,
    process_inbound_email,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


def _verify_inbound_secret(
    request: Request,
    x_inbound_email_secret: Optional[str] = Header(default=None, alias="X-Inbound-Email-Secret"),
    secret: Optional[str] = Query(default=None),
) -> None:
    expected = (settings.inbound_email_webhook_secret or "").strip()
    if not expected:
        raise HTTPException(status_code=503, detail="Inbound email webhook is not configured")
    provided = (x_inbound_email_secret or secret or "").strip()
    if not provided:
        auth = request.headers.get("authorization") or ""
        if auth.lower().startswith("bearer "):
            provided = auth[7:].strip()
    if not provided or not secrets.compare_digest(provided, expected):
        raise HTTPException(status_code=401, detail="Unauthorized")


@router.post("/inbound-email")
async def inbound_email_webhook(
    request: Request,
    db: Session = Depends(get_db),
    _: None = Depends(_verify_inbound_secret),
):
    """Receive inbound mail from Microsoft 365 Power Automate (JSON) or multipart form.

    Always returns 200 for valid auth so the flow does not retry forever on
    business discards (bad domain, missing MK code, etc.).
    """
    content_type = (request.headers.get("content-type") or "").lower()

    try:
        if "application/json" in content_type or content_type.endswith("+json"):
            payload = await request.json()
            if not isinstance(payload, dict):
                raise HTTPException(status_code=400, detail="JSON body must be an object")
            parsed = parse_office365_json(payload)
        elif "multipart/form-data" in content_type or "application/x-www-form-urlencoded" in content_type:
            form = await request.form()
            form_data: dict = {}
            files: list[tuple[str, str, str, bytes]] = []
            for key, value in form.multi_items():
                if hasattr(value, "read") and hasattr(value, "filename"):
                    raw = await value.read()
                    files.append(
                        (
                            str(key),
                            getattr(value, "filename", None) or str(key),
                            getattr(value, "content_type", None) or "application/octet-stream",
                            raw or b"",
                        )
                    )
                else:
                    form_data[str(key)] = value if isinstance(value, str) else str(value)
            parsed = parse_sendgrid_inbound_form(form_data, files)
        else:
            # Try JSON first (Power Automate sometimes omits/wrong content-type)
            try:
                payload = await request.json()
                if isinstance(payload, dict):
                    parsed = parse_office365_json(payload)
                else:
                    raise HTTPException(status_code=400, detail="Expected JSON object or multipart form")
            except HTTPException:
                raise
            except Exception:
                raise HTTPException(status_code=400, detail="Expected application/json or multipart form")

        result = process_inbound_email(db, parsed)
    except HTTPException:
        raise
    except Exception:
        logger.exception("inbound_email_webhook_failed")
        return {"ok": False, "status": "error", "detail": "processing_failed"}

    return {
        "ok": result.status in ("created", "duplicate"),
        "status": result.status,
        "detail": result.detail,
        "report_id": result.report_id,
        "project_id": result.project_id,
        "project_code": result.project_code,
        "mk_code": result.mk_code,
    }
