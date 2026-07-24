"""Print shop request form (public) and internal queue management."""
from __future__ import annotations

import io
import logging
import os
import re
import time
import uuid
from collections import defaultdict, deque
from datetime import date, datetime, timezone
from email.message import EmailMessage
from typing import Any, Deque, Dict, List, Optional, Tuple

import smtplib
from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Request,
    UploadFile,
)
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import BaseModel
from slugify import slugify
from sqlalchemy.orm import Session, joinedload

from ..auth.security import (
    get_current_user,
    http_bearer,
    require_permissions,
    decode_token,
)
from ..config import settings
from ..db import get_db
from ..models.models import FileObject, PrintShopRequest, PrintShopRequestFile, PrintShopRequestItem, User
from ..routes.files import get_storage, unique_upload_key
from ..storage.blob_provider import BlobStorageProvider
from ..storage.local_provider import LocalStorageProvider

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/print-shop", tags=["print-shop"])

PRODUCT_TYPES = (
    ("sign", "Sign"),
    ("sticker", "Sticker"),
    ("other", "Other"),
)
PRODUCT_TYPE_KEYS = {k for k, _ in PRODUCT_TYPES}

UNITS = (
    ("in", "Inches"),
    ("cm", "Centimeters"),
    ("ft", "Feet"),
)
UNIT_KEYS = {k for k, _ in UNITS}

STATUS_TODO = "todo"
STATUS_IN_PRODUCTION = "in_production"
STATUS_READY = "ready"
STATUS_CANCELLED = "cancelled"

STATUS_LABELS = {
    STATUS_TODO: "To Do",
    STATUS_IN_PRODUCTION: "In Production",
    STATUS_READY: "Ready",
    STATUS_CANCELLED: "Cancelled",
}

ALLOWED_STATUSES = set(STATUS_LABELS.keys())

ALLOWED_CONTENT_TYPES = {
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/jpg",
}
ALLOWED_EXTENSIONS = {".pdf", ".png", ".jpg", ".jpeg"}

MAX_ARTWORK_BYTES = 15 * 1024 * 1024  # 15 MB per file
MAX_ARTWORK_FILES = 10  # per line item
MAX_LINE_ITEMS = 20
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

# Simple in-memory rate limit for public create: 10 / hour / IP
_RATE_LIMIT_MAX = 10
_RATE_LIMIT_WINDOW_S = 60 * 60
_rate_hits: Dict[str, Deque[float]] = defaultdict(deque)


class CancelBody(BaseModel):
    reason: Optional[str] = None


class PatchBody(BaseModel):
    internal_notes: Optional[str] = None
    notes: Optional[str] = None


class SendEstimateBody(BaseModel):
    estimated_delivery_date: str
    message: Optional[str] = None


class MarkReadyBody(BaseModel):
    pickup_location: Optional[str] = None
    send_email: bool = True


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _client_ip(request: Request) -> str:
    forwarded = (request.headers.get("x-forwarded-for") or "").split(",")[0].strip()
    if forwarded:
        return forwarded
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


def _check_rate_limit(ip: str) -> None:
    now = time.time()
    q = _rate_hits[ip]
    while q and now - q[0] > _RATE_LIMIT_WINDOW_S:
        q.popleft()
    if len(q) >= _RATE_LIMIT_MAX:
        raise HTTPException(status_code=429, detail="Too many requests. Please try again later.")
    q.append(now)


def get_optional_user(
    db: Session = Depends(get_db),
    creds: Optional[HTTPAuthorizationCredentials] = Depends(http_bearer),
) -> Optional[User]:
    if creds is None:
        return None
    try:
        payload = decode_token(creds.credentials)
        user_id_raw = payload.get("sub")
        user_uuid = uuid.UUID(str(user_id_raw))
    except Exception:
        return None
    u = db.query(User).filter(User.id == user_uuid).first()
    if u is None or not u.is_active:
        return None
    return u


def _next_request_code(db: Session) -> str:
    year = _utcnow().year
    prefix = f"PS-{year}-"
    last = (
        db.query(PrintShopRequest)
        .filter(PrintShopRequest.request_code.like(f"{prefix}%"))
        .order_by(PrintShopRequest.request_code.desc())
        .first()
    )
    n = 1
    if last and last.request_code:
        try:
            n = int(str(last.request_code).rsplit("-", 1)[-1]) + 1
        except Exception:
            n = 1
    return f"{prefix}{n:05d}"


def _parse_optional_float(raw: Optional[str], field: str) -> Optional[float]:
    if raw is None or str(raw).strip() == "":
        return None
    try:
        return float(str(raw).strip())
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid {field}")


def _parse_due_date(raw: Optional[str]) -> Optional[date]:
    if raw is None or str(raw).strip() == "":
        return None
    try:
        return date.fromisoformat(str(raw).strip()[:10])
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid due_date (use YYYY-MM-DD)")


def _artwork_key(original_name: str) -> str:
    today = _utcnow().strftime("%Y-%m-%d")
    year = _utcnow().strftime("%Y")
    safe_name = slugify(os.path.splitext(original_name)[0]) or "artwork"
    ext = os.path.splitext(original_name)[1].lower()
    if ext == ".jpeg":
        ext = ".jpg"
    base = f"/org/{year}/print-shop/artwork/{today}_{safe_name}{ext}"
    return unique_upload_key(base)


def _store_artwork(
    *,
    content: bytes,
    content_type: str,
    original_name: str,
    created_by: Optional[uuid.UUID],
    db: Session,
) -> FileObject:
    storage = get_storage()
    key = _artwork_key(original_name)
    try:
        storage.copy_in(io.BytesIO(content), key)
    except Exception as e:
        logger.exception("Failed to store print-shop artwork")
        raise HTTPException(status_code=500, detail=f"Failed to store artwork: {e}") from e

    if isinstance(storage, LocalStorageProvider):
        provider = "local"
        container = "local"
    elif isinstance(storage, BlobStorageProvider):
        provider = "blob"
        container = settings.azure_blob_container or ""
    else:
        provider = getattr(storage, "provider", "blob")
        container = settings.azure_blob_container or "local"

    fo = FileObject(
        provider=provider,
        container=container,
        key=key,
        size_bytes=len(content),
        content_type=content_type,
        checksum_sha256="na",
        created_by=created_by,
        source_ref="print-shop",
        tags={"original_name": original_name, "scope": "print-shop"},
    )
    db.add(fo)
    db.flush()
    return fo


async def _read_artwork(file: UploadFile) -> Tuple[bytes, str, str]:
    original_name = (file.filename or "artwork").strip() or "artwork"
    ext = os.path.splitext(original_name)[1].lower()
    content_type = (file.content_type or "").strip().lower() or "application/octet-stream"

    if ext not in ALLOWED_EXTENSIONS and content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=400,
            detail="Artwork must be PDF, PNG, or JPG",
        )
    if ext and ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Artwork must be PDF, PNG, or JPG")
    if content_type not in ALLOWED_CONTENT_TYPES and ext in ALLOWED_EXTENSIONS:
        # Trust extension when browser sends odd MIME
        if ext == ".pdf":
            content_type = "application/pdf"
        elif ext == ".png":
            content_type = "image/png"
        else:
            content_type = "image/jpeg"

    chunks: List[bytes] = []
    total = 0
    while True:
        chunk = await file.read(1024 * 1024)
        if not chunk:
            break
        total += len(chunk)
        if total > MAX_ARTWORK_BYTES:
            raise HTTPException(status_code=413, detail="Artwork too large (max 15 MB)")
        chunks.append(chunk)
    content = b"".join(chunks)
    if not content:
        raise HTTPException(status_code=400, detail="Artwork file is empty")
    return content, content_type, original_name


def _product_label(key: str) -> str:
    for k, label in PRODUCT_TYPES:
        if k == key:
            return label
    return key


def _serialize_file(fo: FileObject, *, original_name: Optional[str] = None) -> Dict[str, Any]:
    name = original_name
    if not name and isinstance(fo.tags, dict):
        name = fo.tags.get("original_name")
    return {
        "id": str(fo.id),
        "content_type": fo.content_type,
        "original_name": name,
        "size_bytes": fo.size_bytes,
        "url": f"/files/{fo.id}",
    }


def _serialize_item(item: PrintShopRequestItem) -> Dict[str, Any]:
    files_out: List[Dict[str, Any]] = []
    for pf in list(getattr(item, "files", None) or []):
        fo = pf.file_object
        if fo:
            files_out.append(_serialize_file(fo, original_name=pf.original_name))
    return {
        "id": str(item.id),
        "sort_index": item.sort_index,
        "product_type": item.product_type,
        "product_type_label": _product_label(item.product_type),
        "title": item.title,
        "description": item.description,
        "quantity": item.quantity,
        "width": item.width,
        "height": item.height,
        "unit": item.unit,
        "files": files_out,
    }


def _legacy_item_from_request(row: PrintShopRequest) -> Dict[str, Any]:
    files_out: List[Dict[str, Any]] = []
    for pf in list(getattr(row, "files", None) or []):
        fo = pf.file_object
        if fo:
            files_out.append(_serialize_file(fo, original_name=pf.original_name))
    if not files_out and row.artwork_file:
        files_out.append(_serialize_file(row.artwork_file))
    return {
        "id": None,
        "sort_index": 0,
        "product_type": row.product_type,
        "product_type_label": _product_label(row.product_type),
        "title": row.title,
        "description": row.description,
        "quantity": row.quantity,
        "width": row.width,
        "height": row.height,
        "unit": row.unit,
        "files": files_out,
    }


def _serialize(row: PrintShopRequest, *, include_internal: bool = False) -> Dict[str, Any]:
    item_rows = list(getattr(row, "items", None) or [])
    if item_rows:
        items_out = [_serialize_item(it) for it in item_rows]
    else:
        items_out = [_legacy_item_from_request(row)]

    all_files: List[Dict[str, Any]] = []
    for it in items_out:
        all_files.extend(it.get("files") or [])

    first = items_out[0] if items_out else {}
    out: Dict[str, Any] = {
        "id": str(row.id),
        "request_code": row.request_code,
        "status": row.status,
        "status_label": STATUS_LABELS.get(row.status, row.status),
        "product_type": first.get("product_type") or row.product_type,
        "product_type_label": first.get("product_type_label") or _product_label(row.product_type),
        "title": first.get("title") or row.title,
        "description": first.get("description") if first else row.description,
        "quantity": first.get("quantity") if first else row.quantity,
        "width": first.get("width") if first else row.width,
        "height": first.get("height") if first else row.height,
        "unit": first.get("unit") if first else row.unit,
        "item_count": len(items_out),
        "items": items_out,
        "due_date": row.due_date.isoformat() if row.due_date else None,
        "estimated_delivery_date": (
            row.estimated_delivery_date.isoformat() if row.estimated_delivery_date else None
        ),
        "estimate_message": row.estimate_message,
        "pickup_location": row.pickup_location,
        "requester_name": row.requester_name,
        "requester_email": row.requester_email,
        "requested_by_user_id": str(row.requested_by_user_id) if row.requested_by_user_id else None,
        "notes": row.notes,
        "artwork": all_files[0] if all_files else None,
        "files": all_files,
        "cancelled_reason": row.cancelled_reason,
        "received_emailed_at": row.received_emailed_at.isoformat() if row.received_emailed_at else None,
        "estimate_emailed_at": row.estimate_emailed_at.isoformat() if row.estimate_emailed_at else None,
        "ready_emailed_at": row.ready_emailed_at.isoformat() if row.ready_emailed_at else None,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
        "status_changed_at": row.status_changed_at.isoformat() if row.status_changed_at else None,
        "status_changed_by": str(row.status_changed_by) if row.status_changed_by else None,
    }
    if include_internal:
        out["internal_notes"] = row.internal_notes
    return out


def _set_status(row: PrintShopRequest, new_status: str, user: User) -> None:
    row.status = new_status
    row.status_changed_at = _utcnow()
    row.status_changed_by = user.id
    row.updated_at = _utcnow()


def _items_email_block(row: PrintShopRequest) -> str:
    item_rows = list(getattr(row, "items", None) or [])
    if item_rows:
        lines = []
        for it in item_rows:
            dims = ""
            if it.width is not None and it.height is not None:
                dims = f", {it.width} × {it.height} {it.unit}"
            lines.append(f"- {it.title} ({_product_label(it.product_type)}) × {it.quantity}{dims}")
        return "\n".join(lines)
    dims = ""
    if row.width is not None and row.height is not None:
        dims = f"\nSize: {row.width} × {row.height} {row.unit}"
    return (
        f"Item: {row.title}\n"
        f"Type: {_product_label(row.product_type)}\n"
        f"Quantity: {row.quantity}{dims}"
    )


def _items_email_html(row: PrintShopRequest) -> str:
    item_rows = list(getattr(row, "items", None) or [])
    if item_rows:
        lis = []
        for it in item_rows:
            dims = ""
            if it.width is not None and it.height is not None:
                dims = f" · {it.width} × {it.height} {it.unit}"
            title = (it.title or "").replace("<", "&lt;").replace(">", "&gt;")
            lis.append(
                f'<li style="margin:0 0 8px 0;">{title} '
                f'<span style="color:#6b7280;">({_product_label(it.product_type)})</span> '
                f'× <strong>{it.quantity}</strong>{dims}</li>'
            )
        return "<ul style=\"margin:0; padding-left:18px;\">" + "".join(lis) + "</ul>"
    title = (row.title or "").replace("<", "&lt;").replace(">", "&gt;")
    dims = ""
    if row.width is not None and row.height is not None:
        dims = f"<br/>Size: {row.width} × {row.height} {row.unit}"
    return (
        f"<p style=\"margin:0;\">{title}<br/>"
        f"Type: {_product_label(row.product_type)}<br/>"
        f"Quantity: {row.quantity}{dims}</p>"
    )


PRINT_SHOP_EMAIL_FROM_NAME = "Mack Kirk Printing Team"


def _print_shop_logo_url() -> str:
    base = (settings.public_base_url or "").rstrip("/")
    return f"{base}/proposals/assets/MK_logo.png"


def _print_shop_email_html(
    *,
    title: str,
    greeting_name: str,
    intro_html: str,
    body_html: str,
    footer_note: str = "",
) -> str:
    """Branded HTML shell for print-shop customer emails."""
    logo_url = _print_shop_logo_url()
    safe_name = (greeting_name or "there").replace("<", "&lt;").replace(">", "&gt;")
    note_block = ""
    if footer_note:
        note_block = (
            f'<p style="margin:24px 0 0 0; font-size:13px; line-height:1.55; color:#6b7280;">'
            f"{footer_note}</p>"
        )
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{title}</title>
</head>
<body style="margin:0; padding:0; background-color:#f3f4f6; font-family: Georgia, 'Times New Roman', Times, serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f3f4f6;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px; background:#ffffff; border-radius:14px; overflow:hidden; border:1px solid #e5e7eb; box-shadow:0 8px 24px rgba(15,23,42,0.06);">
          <tr>
            <td align="center" style="padding:28px 28px 20px; background:linear-gradient(160deg, #7f1010 0%, #b91c1c 55%, #a31414 100%);">
              <img src="{logo_url}" alt="Mack Kirk" width="220" style="max-width:220px; width:100%; height:auto; display:block; margin:0 auto;" />
              <p style="margin:14px 0 0 0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif; font-size:12px; letter-spacing:0.14em; text-transform:uppercase; color:rgba(255,255,255,0.85);">
                Printing Team
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 28px 8px;">
              <h1 style="margin:0 0 18px 0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif; font-size:22px; line-height:1.3; font-weight:700; color:#111827;">
                {title}
              </h1>
              <p style="margin:0 0 16px 0; font-size:16px; line-height:1.6; color:#374151;">
                Hello {safe_name},
              </p>
              <div style="font-size:16px; line-height:1.65; color:#374151;">
                {intro_html}
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 28px;">
              <div style="background:#f9fafb; border:1px solid #e5e7eb; border-radius:10px; padding:16px 18px;">
                {body_html}
              </div>
              {note_block}
              <p style="margin:28px 0 0 0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif; font-size:14px; line-height:1.5; color:#6b7280;">
                — {PRINT_SHOP_EMAIL_FROM_NAME}
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:14px 28px 22px; border-top:1px solid #f3f4f6; background:#fafafa;">
              <p style="margin:0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif; font-size:11px; line-height:1.5; color:#9ca3af; text-align:center;">
                Mack Kirk Mechanical · Print requests
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""


def _smtp_send(
    *,
    subject: str,
    to_email: str,
    body: str,
    log_label: str,
    html_body: Optional[str] = None,
) -> bool:
    if not settings.enable_email:
        logger.info("%s skipped (ENABLE_EMAIL=false)", log_label)
        return False
    if not settings.smtp_host or not settings.mail_from:
        logger.warning("%s skipped (SMTP not configured)", log_label)
        return False
    to_email = (to_email or "").strip()
    if not to_email:
        logger.warning("%s skipped (no recipient email)", log_label)
        return False

    msg = EmailMessage()
    msg["Subject"] = subject
    from_addr = settings.mail_from
    # Prefer a friendly display name for customer-facing print emails
    if "<" not in from_addr and PRINT_SHOP_EMAIL_FROM_NAME not in from_addr:
        msg["From"] = f"{PRINT_SHOP_EMAIL_FROM_NAME} <{from_addr}>"
    else:
        msg["From"] = from_addr
    msg["To"] = to_email
    msg.set_content(body)
    if html_body:
        msg.add_alternative(html_body, subtype="html")

    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as s:
            if settings.smtp_tls:
                s.starttls()
            if settings.smtp_username and settings.smtp_password:
                s.login(settings.smtp_username, settings.smtp_password)
            s.send_message(msg)
        return True
    except Exception:
        logger.exception("Failed to send %s", log_label)
        return False


def _send_received_email(row: PrintShopRequest) -> bool:
    """Confirmation that the request was received; team will follow up with an estimate."""
    due_plain = f"\nRequested delivery: {row.due_date.isoformat()}" if row.due_date else ""
    items_block = _items_email_block(row)
    body = (
        f"Hello {row.requester_name},\n\n"
        f"We received your print request {row.request_code}. Thank you!\n\n"
        f"Here is a summary of what you submitted:\n"
        f"{items_block}{due_plain}\n\n"
        f"Someone from our print shop team will review your request shortly and email you "
        f"an estimated production and delivery date based on our current print demand.\n\n"
        f"No action is needed from you right now — we will be in touch.\n\n"
        f"— {PRINT_SHOP_EMAIL_FROM_NAME}\n"
    )
    due_html = (
        f'<p style="margin:12px 0 0 0; font-size:14px; color:#4b5563;">'
        f"<strong>Requested delivery:</strong> {row.due_date.isoformat()}</p>"
        if row.due_date
        else ""
    )
    intro = (
        f'<p style="margin:0 0 14px 0;">We received your print request '
        f'<strong style="color:#7f1010;">{row.request_code}</strong>. Thank you!</p>'
        f'<p style="margin:0 0 14px 0;">Someone from our team will review it shortly and email you '
        f"an estimated production and delivery date based on our current print demand.</p>"
        f'<p style="margin:0;">No action is needed from you right now — we will be in touch.</p>'
    )
    summary = (
        f'<p style="margin:0 0 10px 0; font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Arial,sans-serif; '
        f'font-size:12px; letter-spacing:0.06em; text-transform:uppercase; color:#6b7280;">Summary</p>'
        f"{_items_email_html(row)}{due_html}"
    )
    html = _print_shop_email_html(
        title="Request received",
        greeting_name=row.requester_name or "there",
        intro_html=intro,
        body_html=summary,
    )
    return _smtp_send(
        subject=f"Print request {row.request_code} received",
        to_email=row.requester_email,
        body=body,
        html_body=html,
        log_label=f"print shop received email for {row.request_code}",
    )


def _send_estimate_email(row: PrintShopRequest) -> bool:
    """Notify requester of staff-set estimated delivery date (with estimate disclaimer)."""
    if not row.estimated_delivery_date:
        return False
    est = row.estimated_delivery_date.isoformat()
    due = f"\nYour requested delivery date: {row.due_date.isoformat()}" if row.due_date else ""
    staff_note = ""
    staff_note_html = ""
    if row.estimate_message and row.estimate_message.strip():
        msg = row.estimate_message.strip()
        staff_note = f"\nMessage from the team:\n{msg}\n"
        safe = msg.replace("<", "&lt;").replace(">", "&gt;").replace("\n", "<br/>")
        staff_note_html = (
            f'<div style="margin:16px 0 0 0; padding:14px 16px; background:#fff7ed; border:1px solid #fed7aa; '
            f'border-radius:10px;">'
            f'<p style="margin:0 0 6px 0; font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Arial,sans-serif; '
            f'font-size:11px; letter-spacing:0.08em; text-transform:uppercase; color:#c2410c;">Message from our team</p>'
            f'<p style="margin:0; font-size:15px; line-height:1.55; color:#9a3412;">{safe}</p>'
            f"</div>"
        )
    items_block = _items_email_block(row)
    body = (
        f"Hello {row.requester_name},\n\n"
        f"Our team has reviewed your request {row.request_code}.\n\n"
        f"Estimated ready / delivery date: {est}\n\n"
        f"Please note: this is an estimate only. Timing can change depending on print demand, "
        f"artwork adjustments, and production capacity. We will update you if the date needs "
        f"to shift significantly.\n"
        f"{staff_note}\n"
        f"Request summary:\n"
        f"{items_block}{due}\n\n"
        f"— {PRINT_SHOP_EMAIL_FROM_NAME}\n"
    )
    due_html = (
        f'<p style="margin:12px 0 0 0; font-size:14px; color:#4b5563;">'
        f"<strong>Your requested delivery:</strong> {row.due_date.isoformat()}</p>"
        if row.due_date
        else ""
    )
    intro = (
        f'<p style="margin:0 0 18px 0;">We reviewed your request '
        f'<strong style="color:#7f1010;">{row.request_code}</strong>.</p>'
        f'<div style="margin:0 0 18px 0; padding:18px 20px; text-align:center; '
        f'background:linear-gradient(160deg,#7f1010 0%,#b91c1c 100%); border-radius:12px;">'
        f'<p style="margin:0 0 6px 0; font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Arial,sans-serif; '
        f'font-size:11px; letter-spacing:0.12em; text-transform:uppercase; color:rgba(255,255,255,0.8);">'
        f"Estimated ready / delivery</p>"
        f'<p style="margin:0; font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Arial,sans-serif; '
        f'font-size:26px; font-weight:700; color:#ffffff; letter-spacing:0.02em;">{est}</p>'
        f"</div>"
        f'<p style="margin:0; font-size:15px; line-height:1.6; color:#4b5563;">'
        f"Please note: this is an <em>estimate</em> only. Timing can change with print demand, "
        f"artwork adjustments, and capacity. We will update you if it needs to shift significantly.</p>"
        f"{staff_note_html}"
    )
    summary = (
        f'<p style="margin:0 0 10px 0; font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Arial,sans-serif; '
        f'font-size:12px; letter-spacing:0.06em; text-transform:uppercase; color:#6b7280;">Request summary</p>'
        f"{_items_email_html(row)}{due_html}"
    )
    html = _print_shop_email_html(
        title="Estimated delivery",
        greeting_name=row.requester_name or "there",
        intro_html=intro,
        body_html=summary,
    )
    return _smtp_send(
        subject=f"Estimated delivery for print request {row.request_code}",
        to_email=row.requester_email,
        body=body,
        html_body=html,
        log_label=f"print shop estimate email for {row.request_code}",
    )


def _send_ready_email(row: PrintShopRequest) -> bool:
    """Send ready-for-pickup notification. Returns True if sent. Does not raise for SMTP misconfig."""
    location = (row.pickup_location or "").strip()
    location_plain = f"\nPickup location:\n{location}\n" if location else ""
    items_block = _items_email_block(row)
    body = (
        f"Hello {row.requester_name},\n\n"
        f"Your print request {row.request_code} is ready for pickup.\n"
        f"{location_plain}\n"
        f"Request summary:\n"
        f"{items_block}\n\n"
        f"— {PRINT_SHOP_EMAIL_FROM_NAME}\n"
    )
    if location:
        safe_loc = location.replace("<", "&lt;").replace(">", "&gt;").replace("\n", "<br/>")
        location_html = (
            f'<div style="margin:0 0 18px 0; padding:18px 20px; text-align:center; '
            f'background:linear-gradient(160deg,#7f1010 0%,#b91c1c 100%); border-radius:12px;">'
            f'<p style="margin:0 0 6px 0; font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Arial,sans-serif; '
            f'font-size:11px; letter-spacing:0.12em; text-transform:uppercase; color:rgba(255,255,255,0.8);">'
            f"Pickup location</p>"
            f'<p style="margin:0; font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Arial,sans-serif; '
            f'font-size:20px; font-weight:700; line-height:1.35; color:#ffffff;">{safe_loc}</p>'
            f"</div>"
        )
    else:
        location_html = ""
    intro = (
        f'<p style="margin:0 0 18px 0;">Great news — your print request '
        f'<strong style="color:#7f1010;">{row.request_code}</strong> is '
        f"<strong>ready for pickup</strong>.</p>"
        f"{location_html}"
    )
    summary = (
        f'<p style="margin:0 0 10px 0; font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Arial,sans-serif; '
        f'font-size:12px; letter-spacing:0.06em; text-transform:uppercase; color:#6b7280;">Request summary</p>'
        f"{_items_email_html(row)}"
    )
    html = _print_shop_email_html(
        title="Ready for pickup",
        greeting_name=row.requester_name or "there",
        intro_html=intro,
        body_html=summary,
    )
    return _smtp_send(
        subject=f"Your print request {row.request_code} is ready for pickup",
        to_email=row.requester_email,
        body=body,
        html_body=html,
        log_label=f"print shop ready email for {row.request_code}",
    )


@router.get("/public/meta")
def public_meta():
    return {
        "product_types": [{"value": k, "label": v} for k, v in PRODUCT_TYPES],
        "units": [{"value": k, "label": v} for k, v in UNITS],
        "max_artwork_mb": 15,
        "max_artwork_files": MAX_ARTWORK_FILES,
        "max_line_items": MAX_LINE_ITEMS,
        "allowed_artwork_types": ["application/pdf", "image/png", "image/jpeg"],
        "statuses": [{"value": k, "label": v} for k, v in STATUS_LABELS.items()],
    }


@router.post("/public/requests")
async def create_public_request(
    request: Request,
    requester_name: str = Form(...),
    requester_email: str = Form(...),
    due_date: Optional[str] = Form(None),
    notes: Optional[str] = Form(None),
    items_json: str = Form(...),
    db: Session = Depends(get_db),
    user: Optional[User] = Depends(get_optional_user),
):
    """Create a request with one or more line items.

    Frontend sends `items_json` (array of item metadata) and files named `artwork_0`, `artwork_1`, …
    (repeat the same field name once per file for that item index).
    """
    import json

    _check_rate_limit(_client_ip(request))

    name = (requester_name or "").strip()
    email = (requester_email or "").strip().lower()
    notes_s = (notes or "").strip() or None

    if not name:
        raise HTTPException(status_code=400, detail="requester_name is required")
    if not email or not EMAIL_RE.match(email):
        raise HTTPException(status_code=400, detail="Valid requester_email is required")

    try:
        raw_items = json.loads(items_json or "[]")
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid items_json")
    if not isinstance(raw_items, list) or len(raw_items) < 1:
        raise HTTPException(status_code=400, detail="At least one item is required")
    if len(raw_items) > MAX_LINE_ITEMS:
        raise HTTPException(status_code=400, detail=f"Too many items (max {MAX_LINE_ITEMS})")

    form = await request.form()
    due = _parse_due_date(due_date)
    created_by = user.id if user else None
    now = _utcnow()

    parsed_items: List[Dict[str, Any]] = []
    for idx, raw in enumerate(raw_items):
        if not isinstance(raw, dict):
            raise HTTPException(status_code=400, detail=f"Invalid item at index {idx}")
        ptype = str(raw.get("product_type") or "").strip().lower()
        title_s = str(raw.get("title") or "").strip()
        unit_s = str(raw.get("unit") or "in").strip().lower()
        desc = str(raw.get("description") or "").strip() or None
        try:
            quantity = int(raw.get("quantity") or 1)
        except Exception:
            raise HTTPException(status_code=400, detail=f"Invalid quantity on item {idx + 1}")
        if ptype not in PRODUCT_TYPE_KEYS:
            raise HTTPException(status_code=400, detail=f"Invalid product_type on item {idx + 1}")
        if not title_s:
            raise HTTPException(status_code=400, detail=f"Title is required on item {idx + 1}")
        if quantity < 1 or quantity > 100_000:
            raise HTTPException(status_code=400, detail=f"Invalid quantity on item {idx + 1}")
        if unit_s not in UNIT_KEYS:
            raise HTTPException(status_code=400, detail=f"Invalid unit on item {idx + 1}")

        width_raw = raw.get("width")
        height_raw = raw.get("height")
        width_f = _parse_optional_float(
            None if width_raw is None or width_raw == "" else str(width_raw), "width"
        )
        height_f = _parse_optional_float(
            None if height_raw is None or height_raw == "" else str(height_raw), "height"
        )

        uploads = form.getlist(f"artwork_{idx}")
        file_uploads: List[UploadFile] = []
        for u in uploads:
            if hasattr(u, "read") and hasattr(u, "filename"):
                file_uploads.append(u)  # type: ignore[arg-type]
        if len(file_uploads) > MAX_ARTWORK_FILES:
            raise HTTPException(
                status_code=400,
                detail=f"Too many files on item {idx + 1} (max {MAX_ARTWORK_FILES})",
            )

        stored: List[Tuple[FileObject, str]] = []
        for upload in file_uploads:
            content, content_type, original_name = await _read_artwork(upload)
            fo = _store_artwork(
                content=content,
                content_type=content_type,
                original_name=original_name,
                created_by=created_by,
                db=db,
            )
            stored.append((fo, original_name))

        parsed_items.append(
            {
                "product_type": ptype,
                "title": title_s,
                "description": desc,
                "quantity": quantity,
                "width": width_f,
                "height": height_f,
                "unit": unit_s,
                "files": stored,
            }
        )

    first = parsed_items[0]
    primary_fo = first["files"][0][0] if first["files"] else None
    summary_title = first["title"]
    if len(parsed_items) > 1:
        summary_title = f"{first['title']} (+{len(parsed_items) - 1} more)"

    row = PrintShopRequest(
        request_code=_next_request_code(db),
        status=STATUS_TODO,
        product_type=first["product_type"],
        title=summary_title,
        description=first["description"],
        quantity=first["quantity"],
        width=first["width"],
        height=first["height"],
        unit=first["unit"],
        due_date=due,
        requester_name=name,
        requester_email=email,
        requested_by_user_id=user.id if user else None,
        artwork_file_id=primary_fo.id if primary_fo else None,
        notes=notes_s,
        created_at=now,
        updated_at=now,
        status_changed_at=now,
        status_changed_by=user.id if user else None,
    )
    db.add(row)
    db.flush()

    for idx, parsed in enumerate(parsed_items):
        item = PrintShopRequestItem(
            request_id=row.id,
            sort_index=idx,
            product_type=parsed["product_type"],
            title=parsed["title"],
            description=parsed["description"],
            quantity=parsed["quantity"],
            width=parsed["width"],
            height=parsed["height"],
            unit=parsed["unit"],
            created_at=now,
        )
        db.add(item)
        db.flush()
        for fidx, (fo, original_name) in enumerate(parsed["files"]):
            db.add(
                PrintShopRequestFile(
                    request_id=row.id,
                    item_id=item.id,
                    file_object_id=fo.id,
                    original_name=original_name,
                    sort_index=fidx,
                    created_at=now,
                )
            )

    db.commit()
    db.refresh(row)

    # Reload with items for email body
    row = _get_row(db, str(row.id))
    received_sent = _send_received_email(row)
    if received_sent:
        row.received_emailed_at = _utcnow()
        db.commit()
        db.refresh(row)

    return {
        "id": str(row.id),
        "request_code": row.request_code,
        "status": row.status,
        "status_label": STATUS_LABELS[row.status],
        "item_count": len(parsed_items),
        "message": "Print request submitted successfully",
        "email_sent": received_sent,
    }


@router.get("/requests")
def list_requests(
    status: Optional[str] = None,
    q: Optional[str] = None,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
    __: Any = Depends(require_permissions("print_shop:read")),
):
    query = db.query(PrintShopRequest).options(
        joinedload(PrintShopRequest.items).joinedload(PrintShopRequestItem.files).joinedload(PrintShopRequestFile.file_object),
        joinedload(PrintShopRequest.files).joinedload(PrintShopRequestFile.file_object),
        joinedload(PrintShopRequest.artwork_file),
    )
    if status:
        if status not in ALLOWED_STATUSES:
            raise HTTPException(status_code=400, detail="Invalid status filter")
        query = query.filter(PrintShopRequest.status == status)
    if q and q.strip():
        term = f"%{q.strip()}%"
        query = query.filter(
            (PrintShopRequest.request_code.ilike(term))
            | (PrintShopRequest.title.ilike(term))
            | (PrintShopRequest.requester_name.ilike(term))
            | (PrintShopRequest.requester_email.ilike(term))
        )
    rows = query.order_by(PrintShopRequest.created_at.desc()).limit(500).all()
    return {
        "items": [_serialize(r, include_internal=True) for r in rows],
        "total": len(rows),
    }


@router.get("/requests/{request_id}")
def get_request(
    request_id: str,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
    __: Any = Depends(require_permissions("print_shop:read")),
):
    row = _get_row(db, request_id)
    return _serialize(row, include_internal=True)


@router.post("/requests/{request_id}/start")
def start_production(
    request_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    __: Any = Depends(require_permissions("print_shop:write")),
):
    row = _get_row(db, request_id)
    if row.status != STATUS_TODO:
        raise HTTPException(status_code=400, detail="Only To Do requests can be started")
    _set_status(row, STATUS_IN_PRODUCTION, user)
    db.commit()
    db.refresh(row)
    return _serialize(row, include_internal=True)


@router.post("/requests/{request_id}/mark-ready")
def mark_ready(
    request_id: str,
    body: MarkReadyBody,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    __: Any = Depends(require_permissions("print_shop:write")),
):
    row = _get_row(db, request_id)
    if row.status != STATUS_IN_PRODUCTION:
        raise HTTPException(status_code=400, detail="Only In Production requests can be marked ready")

    location = (body.pickup_location or "").strip() or None
    if body.send_email and not location:
        raise HTTPException(
            status_code=400,
            detail="pickup_location is required when sending the ready email",
        )

    row.pickup_location = location
    _set_status(row, STATUS_READY, user)

    sent = False
    if body.send_email:
        sent = _send_ready_email(row)
        if sent:
            row.ready_emailed_at = _utcnow()

    db.commit()
    db.refresh(row)
    data = _serialize(row, include_internal=True)
    data["email_sent"] = sent
    data["email_skipped"] = not body.send_email
    return data


@router.post("/requests/{request_id}/send-estimate")
def send_estimate(
    request_id: str,
    body: SendEstimateBody,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    __: Any = Depends(require_permissions("print_shop:write")),
):
    """Set estimated delivery date, optional message, and email the requester."""
    row = _get_row(db, request_id)
    if row.status == STATUS_CANCELLED:
        raise HTTPException(status_code=400, detail="Cannot send estimate for a cancelled request")
    if row.status == STATUS_READY:
        raise HTTPException(status_code=400, detail="Request is already ready")

    est = _parse_due_date(body.estimated_delivery_date)
    if not est:
        raise HTTPException(status_code=400, detail="estimated_delivery_date is required (YYYY-MM-DD)")

    message = (body.message or "").strip() or None
    row.estimated_delivery_date = est
    row.estimate_message = message
    row.updated_at = _utcnow()
    # Touch status actor so the queue shows recent staff activity
    row.status_changed_by = user.id

    sent = _send_estimate_email(row)
    if sent:
        row.estimate_emailed_at = _utcnow()
    db.commit()
    db.refresh(row)
    data = _serialize(row, include_internal=True)
    data["email_sent"] = sent
    return data


@router.post("/requests/{request_id}/cancel")
def cancel_request(
    request_id: str,
    body: CancelBody = CancelBody(),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    __: Any = Depends(require_permissions("print_shop:write")),
):
    row = _get_row(db, request_id)
    if row.status in (STATUS_READY, STATUS_CANCELLED):
        raise HTTPException(status_code=400, detail="Cannot cancel a ready or already cancelled request")
    _set_status(row, STATUS_CANCELLED, user)
    reason = (body.reason or "").strip() or None
    row.cancelled_reason = reason
    db.commit()
    db.refresh(row)
    return _serialize(row, include_internal=True)


@router.patch("/requests/{request_id}")
def patch_request(
    request_id: str,
    body: PatchBody,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    __: Any = Depends(require_permissions("print_shop:write")),
):
    row = _get_row(db, request_id)
    if body.internal_notes is not None:
        row.internal_notes = body.internal_notes.strip() or None
    if body.notes is not None:
        row.notes = body.notes.strip() or None
    row.updated_at = _utcnow()
    db.commit()
    db.refresh(row)
    return _serialize(row, include_internal=True)


@router.delete("/requests/{request_id}")
def delete_request(
    request_id: str,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
    __: Any = Depends(require_permissions("print_shop:write")),
):
    """Permanently delete a print shop request and its line items / file links."""
    row = _get_row(db, request_id)
    code = row.request_code
    db.delete(row)
    db.commit()
    return {"ok": True, "id": request_id, "request_code": code}


def _get_row(db: Session, request_id: str) -> PrintShopRequest:
    try:
        rid = uuid.UUID(request_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid request id")
    row = (
        db.query(PrintShopRequest)
        .options(
            joinedload(PrintShopRequest.items).joinedload(PrintShopRequestItem.files).joinedload(PrintShopRequestFile.file_object),
            joinedload(PrintShopRequest.files).joinedload(PrintShopRequestFile.file_object),
            joinedload(PrintShopRequest.artwork_file),
        )
        .filter(PrintShopRequest.id == rid)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Print request not found")
    return row
