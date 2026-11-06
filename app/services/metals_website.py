"""Shared helpers for MK Metals public website submissions and catalog."""
from __future__ import annotations

import io
import logging
import os
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import HTTPException, UploadFile
from slugify import slugify
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from ..config import settings
from ..models.models import (
    FileObject,
    MetalsCatalogProduct,
    MetalsClient,
    MetalsClientContact,
    MetalsWebsiteSubmission,
    MetalsWebsiteSubmissionFile,
    MetalsWebsiteSubmissionItem,
    PortalHubUser,
    PortalMetalsMembership,
    Quote,
)
from ..routes.files import get_storage, unique_upload_key
from ..storage.blob_provider import BlobStorageProvider
from ..storage.local_provider import LocalStorageProvider

logger = logging.getLogger(__name__)

KIND_ESTIMATE = "estimate"
KIND_ORDER = "order"
ALLOWED_KINDS = {KIND_ESTIMATE, KIND_ORDER}

STATUS_NEW = "new"
STATUS_IN_REVIEW = "in_review"
STATUS_QUOTED = "quoted"
STATUS_CONFIRMED = "confirmed"
STATUS_IN_PRODUCTION = "in_production"
STATUS_READY = "ready"
STATUS_SHIPPED = "shipped"
STATUS_CANCELLED = "cancelled"

STATUS_LABELS = {
    STATUS_NEW: "New",
    STATUS_IN_REVIEW: "In review",
    STATUS_QUOTED: "Quoted",
    STATUS_CONFIRMED: "Confirmed",
    STATUS_IN_PRODUCTION: "In production",
    STATUS_READY: "Ready",
    STATUS_SHIPPED: "Shipped",
    STATUS_CANCELLED: "Cancelled",
}
ALLOWED_STATUSES = set(STATUS_LABELS.keys())

ALLOWED_EXTENSIONS = {".pdf", ".jpg", ".jpeg", ".png", ".dwg", ".dxf"}
ALLOWED_CONTENT_TYPES = {
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/jpg",
    "application/acad",
    "application/x-acad",
    "application/dxf",
    "image/vnd.dwg",
    "application/octet-stream",
}
MAX_FILE_BYTES = 25 * 1024 * 1024
MAX_FILES = 10
MAX_ITEMS = 30


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def normalize_email(email: str) -> str:
    return (email or "").strip().lower()


def next_submission_code(db: Session, kind: str) -> str:
    year = utcnow().year
    prefix = "MKE" if kind == KIND_ESTIMATE else "MKO"
    full_prefix = f"{prefix}-{year}-"
    last = (
        db.query(MetalsWebsiteSubmission)
        .filter(MetalsWebsiteSubmission.submission_code.like(f"{full_prefix}%"))
        .order_by(MetalsWebsiteSubmission.submission_code.desc())
        .first()
    )
    n = 1
    if last and last.submission_code:
        try:
            n = int(str(last.submission_code).rsplit("-", 1)[-1]) + 1
        except Exception:
            n = 1
    return f"{full_prefix}{n:05d}"


def _attachment_key(original_name: str) -> str:
    today = utcnow().strftime("%Y-%m-%d")
    year = utcnow().strftime("%Y")
    safe_name = slugify(os.path.splitext(original_name)[0]) or "attachment"
    ext = os.path.splitext(original_name)[1].lower()
    if ext == ".jpeg":
        ext = ".jpg"
    base = f"/org/{year}/metals-website/{today}_{safe_name}{ext}"
    return unique_upload_key(base)


def store_attachment(
    *,
    content: bytes,
    content_type: str,
    original_name: str,
    created_by: Optional[uuid.UUID],
    db: Session,
) -> FileObject:
    storage = get_storage()
    key = _attachment_key(original_name)
    try:
        storage.copy_in(io.BytesIO(content), key)
    except Exception as e:
        logger.exception("Failed to store metals website attachment")
        raise HTTPException(status_code=500, detail=f"Failed to store file: {e}") from e

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
        source_ref="metals-website",
        tags={"original_name": original_name, "scope": "metals-website"},
    )
    db.add(fo)
    db.flush()
    return fo


async def read_upload(file: UploadFile) -> tuple[bytes, str, str]:
    original_name = (file.filename or "attachment").strip() or "attachment"
    ext = os.path.splitext(original_name)[1].lower()
    content_type = (file.content_type or "").strip().lower() or "application/octet-stream"

    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail="Files must be PDF, JPG, PNG, DWG, or DXF",
        )
    if ext == ".pdf":
        content_type = "application/pdf"
    elif ext == ".png":
        content_type = "image/png"
    elif ext in {".jpg", ".jpeg"}:
        content_type = "image/jpeg"
    elif ext == ".dwg":
        content_type = "application/acad"
    elif ext == ".dxf":
        content_type = "application/dxf"

    chunks: list[bytes] = []
    total = 0
    while True:
        chunk = await file.read(1024 * 1024)
        if not chunk:
            break
        total += len(chunk)
        if total > MAX_FILE_BYTES:
            raise HTTPException(status_code=413, detail="File too large (max 25 MB)")
        chunks.append(chunk)
    content = b"".join(chunks)
    if not content:
        raise HTTPException(status_code=400, detail="File is empty")
    return content, content_type, original_name


def find_or_create_metals_client(
    db: Session,
    *,
    email: str,
    company_name: Optional[str],
    contact_name: str,
    phone: Optional[str],
) -> MetalsClient:
    email_n = normalize_email(email)
    # Prefer matching an existing contact email
    contact = (
        db.query(MetalsClientContact)
        .filter(func.lower(MetalsClientContact.email) == email_n)
        .first()
    )
    if contact:
        client = (
            db.query(MetalsClient)
            .filter(MetalsClient.id == contact.client_id, MetalsClient.deleted_at.is_(None))
            .first()
        )
        if client:
            return client

    # Match by billing_email
    client = (
        db.query(MetalsClient)
        .filter(
            MetalsClient.deleted_at.is_(None),
            func.lower(MetalsClient.billing_email) == email_n,
        )
        .first()
    )
    if client:
        return client

    name = (company_name or "").strip() or contact_name.strip() or email_n
    client = MetalsClient(
        name=name,
        display_name=name,
        billing_email=email_n,
        client_status="lead",
        lead_source="website",
        created_at=utcnow(),
    )
    db.add(client)
    db.flush()
    db.add(
        MetalsClientContact(
            client_id=client.id,
            name=contact_name.strip() or name,
            email=email_n,
            phone=(phone or "").strip() or None,
            is_primary=True,
            sort_index=0,
        )
    )
    db.flush()
    return client


def active_metals_client_ids(db: Session, user: PortalHubUser) -> list[uuid.UUID]:
    rows = (
        db.query(PortalMetalsMembership.metals_client_id)
        .filter(
            PortalMetalsMembership.portal_user_id == user.id,
            PortalMetalsMembership.status == "active",
        )
        .all()
    )
    return [r[0] for r in rows]


def metals_client_display_name(db: Session, client_id: uuid.UUID) -> Optional[str]:
    c = db.query(MetalsClient).filter(MetalsClient.id == client_id).first()
    if not c:
        return None
    return c.display_name or c.name


def claim_submissions_for_user(db: Session, user: PortalHubUser, metals_client_id: uuid.UUID) -> int:
    email = normalize_email(user.email)
    rows = (
        db.query(MetalsWebsiteSubmission)
        .filter(
            func.lower(MetalsWebsiteSubmission.contact_email) == email,
            MetalsWebsiteSubmission.portal_user_id.is_(None),
        )
        .all()
    )
    n = 0
    for row in rows:
        row.portal_user_id = user.id
        if row.metals_client_id is None:
            row.metals_client_id = metals_client_id
        n += 1
    return n


def serialize_catalog_product(p: MetalsCatalogProduct, *, include_unpublished: bool = False) -> dict[str, Any]:
    cat = p.category
    return {
        "id": str(p.id),
        "slug": p.slug,
        "name": p.name,
        "short_description": p.short_description,
        "description": p.description,
        "specs": p.specs or {},
        "image_url": p.image_url,
        "is_published": bool(p.is_published),
        "sort_index": p.sort_index,
        "category": (
            {
                "id": str(cat.id),
                "slug": cat.slug,
                "name": cat.name,
            }
            if cat
            else None
        ),
    }


def serialize_submission(row: MetalsWebsiteSubmission, *, include_internal: bool = False) -> dict[str, Any]:
    items = []
    for it in row.items or []:
        items.append(
            {
                "id": str(it.id),
                "sort_index": it.sort_index,
                "catalog_product_id": str(it.catalog_product_id) if it.catalog_product_id else None,
                "description": it.description,
                "gauge": it.gauge,
                "colour": it.colour,
                "quantity": it.quantity,
                "notes": it.notes,
            }
        )
    files = []
    for f in row.files or []:
        files.append(
            {
                "id": str(f.id),
                "file_object_id": str(f.file_object_id),
                "original_name": f.original_name,
                "sort_index": f.sort_index,
                "item_id": str(f.item_id) if f.item_id else None,
            }
        )
    data: dict[str, Any] = {
        "id": str(row.id),
        "submission_code": row.submission_code,
        "kind": row.kind,
        "status": row.status,
        "status_label": STATUS_LABELS.get(row.status, row.status),
        "contact_name": row.contact_name,
        "contact_email": row.contact_email,
        "contact_phone": row.contact_phone,
        "company_name": row.company_name,
        "customer_type": row.customer_type,
        "project_po": row.project_po,
        "notes": row.notes,
        "delivery_method": row.delivery_method,
        "delivery_address": row.delivery_address,
        "notification_prefs": row.notification_prefs or {},
        "metals_client_id": str(row.metals_client_id) if row.metals_client_id else None,
        "portal_user_id": str(row.portal_user_id) if row.portal_user_id else None,
        "converted_quote_id": str(row.converted_quote_id) if row.converted_quote_id else None,
        "source": row.source,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
        "status_updated_at": row.status_updated_at.isoformat() if row.status_updated_at else None,
        "items": items,
        "files": files,
    }
    if include_internal:
        data["internal_notes"] = row.internal_notes
    return data


def submission_query(db: Session):
    return db.query(MetalsWebsiteSubmission).options(
        joinedload(MetalsWebsiteSubmission.items),
        joinedload(MetalsWebsiteSubmission.files),
    )


def convert_estimate_to_quote(db: Session, row: MetalsWebsiteSubmission, *, estimator_id: Optional[uuid.UUID]) -> Quote:
    if row.kind != KIND_ESTIMATE:
        raise HTTPException(status_code=400, detail="Only estimates can be converted to quotes")
    if not row.metals_client_id:
        raise HTTPException(status_code=400, detail="Submission has no metals client")
    if row.converted_quote_id:
        existing = db.query(Quote).filter(Quote.id == row.converted_quote_id).first()
        if existing:
            return existing

    client = (
        db.query(MetalsClient)
        .filter(MetalsClient.id == row.metals_client_id, MetalsClient.deleted_at.is_(None))
        .first()
    )
    if not client:
        raise HTTPException(status_code=404, detail="Metals client not found")

    # Generate a simple website-sourced code; staff can edit later in quote UI
    year = utcnow().year
    seq = db.query(func.count(Quote.id)).filter(Quote.deleted_at.is_(None)).scalar() or 0
    seq += 1
    client_code = (client.code or "00000").strip() or "00000"
    code = f"MKS-{seq:05d}/{client_code}-{year}"
    while db.query(Quote).filter(Quote.code == code, Quote.deleted_at.is_(None)).first():
        seq += 1
        code = f"MKS-{seq:05d}/{client_code}-{year}"

    line_notes = []
    for it in row.items or []:
        parts = [it.description]
        if it.gauge:
            parts.append(f"gauge={it.gauge}")
        if it.colour:
            parts.append(f"colour={it.colour}")
        parts.append(f"qty={it.quantity}")
        line_notes.append(" | ".join(parts))

    payload = {
        "cover_title": "Quotation",
        "title": f"Website estimate {row.submission_code}",
        "client_id": str(client.id),
        "code": code,
        "order_number": code,
        "name": row.company_name or row.contact_name,
        "source": "website",
        "website_submission_id": str(row.id),
        "website_submission_code": row.submission_code,
        "notes": row.notes,
        "line_summary": line_notes,
        "contact": {
            "name": row.contact_name,
            "email": row.contact_email,
            "phone": row.contact_phone,
        },
    }
    q = Quote(
        client_id=client.id,
        code=code,
        name=payload["name"],
        estimator_id=estimator_id,
        order_number=code,
        title=payload["title"],
        data=payload,
        created_at=utcnow(),
        updated_at=utcnow(),
        customer_visible=False,
        outcome_status="pending",
    )
    db.add(q)
    db.flush()
    row.converted_quote_id = q.id
    row.status = STATUS_QUOTED
    row.status_updated_at = utcnow()
    row.updated_at = utcnow()
    return q


_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def validate_contact(name: str, email: str, phone: Optional[str] = None) -> tuple[str, str, Optional[str]]:
    n = (name or "").strip()
    e = normalize_email(email)
    p = (phone or "").strip() or None
    if not n:
        raise HTTPException(status_code=400, detail="Name is required")
    if not e or not _EMAIL_RE.match(e):
        raise HTTPException(status_code=400, detail="Valid email is required")
    return n, e, p
