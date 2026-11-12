"""Public MK Metals website APIs (catalog, guest estimate/order). No staff auth required."""
from __future__ import annotations

import json
import logging
import time
import uuid
from collections import defaultdict, deque
from typing import Deque, Dict, List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from sqlalchemy.orm import Session, joinedload

from ..auth.metals_portal_security import get_optional_metals_portal_user
from ..db import get_db
from ..models.models import (
    MetalsCatalogCategory,
    MetalsCatalogProduct,
    MetalsWebsiteSubmission,
    MetalsWebsiteSubmissionFile,
    MetalsWebsiteSubmissionItem,
    PortalMetalsMembership,
    PortalMetalsUser,
)
from ..services.metals_website import (
    ALLOWED_KINDS,
    KIND_ESTIMATE,
    KIND_ORDER,
    MAX_FILES,
    MAX_ITEMS,
    STATUS_NEW,
    STATUS_LABELS,
    find_or_create_metals_client,
    next_submission_code,
    read_upload,
    serialize_catalog_product,
    serialize_submission,
    store_attachment,
    utcnow,
    validate_contact,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/public/metals", tags=["public-metals"])

_RATE_LIMIT_WINDOW_S = 3600
_RATE_LIMIT_MAX = 20
_rate_hits: Dict[str, Deque[float]] = defaultdict(deque)


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


def _parse_items_json(raw: str) -> List[dict]:
    try:
        data = json.loads(raw or "[]")
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid items_json")
    if not isinstance(data, list):
        raise HTTPException(status_code=400, detail="items_json must be an array")
    if len(data) > MAX_ITEMS:
        raise HTTPException(status_code=400, detail=f"Too many items (max {MAX_ITEMS})")
    return data


def _parse_bool_pref(raw: Optional[str], default: bool = True) -> bool:
    if raw is None or str(raw).strip() == "":
        return default
    return str(raw).strip().lower() in ("1", "true", "yes", "on")


def _resolve_metals_link(
    db: Session, metals_user: Optional[PortalMetalsUser]
) -> tuple[Optional[uuid.UUID], Optional[uuid.UUID]]:
    if not metals_user:
        return None, None
    m = (
        db.query(PortalMetalsMembership)
        .filter(
            PortalMetalsMembership.metals_user_id == metals_user.id,
            PortalMetalsMembership.status == "active",
        )
        .order_by(PortalMetalsMembership.created_at.asc())
        .first()
    )
    return metals_user.id, (m.metals_client_id if m else None)


async def _create_submission(
    *,
    request: Request,
    kind: str,
    contact_name: str,
    contact_email: str,
    contact_phone: Optional[str],
    company_name: Optional[str],
    customer_type: Optional[str],
    project_po: Optional[str],
    notes: Optional[str],
    delivery_method: Optional[str],
    delivery_address: Optional[str],
    notify_email: Optional[str],
    notify_sms: Optional[str],
    items_json: str,
    files: List[UploadFile],
    db: Session,
    portal_user: Optional[PortalMetalsUser],
) -> dict:
    _check_rate_limit(_client_ip(request))
    if kind not in ALLOWED_KINDS:
        raise HTTPException(status_code=400, detail="Invalid kind")

    name, email, phone = validate_contact(contact_name, contact_email, contact_phone)
    items_raw = _parse_items_json(items_json)

    # Estimates may have zero structured items (notes + files only); orders need at least one
    if kind == KIND_ORDER and not items_raw:
        # Allow a single synthetic item from notes if provided
        if (notes or "").strip():
            items_raw = [{"description": (notes or "").strip()[:500], "quantity": 1}]
        else:
            raise HTTPException(status_code=400, detail="At least one order item is required")

    if len(files) > MAX_FILES:
        raise HTTPException(status_code=400, detail=f"Too many files (max {MAX_FILES})")

    metals_user_id, membership_client_id = _resolve_metals_link(db, portal_user)
    client = find_or_create_metals_client(
        db,
        email=email,
        company_name=company_name,
        contact_name=name,
        phone=phone,
    )
    if membership_client_id:
        client_id = membership_client_id
    else:
        client_id = client.id

    delivery = (delivery_method or "").strip().lower() or None
    if delivery and delivery not in ("pickup", "delivery"):
        raise HTTPException(status_code=400, detail="delivery_method must be pickup or delivery")

    row = MetalsWebsiteSubmission(
        submission_code=next_submission_code(db, kind),
        kind=kind,
        status=STATUS_NEW,
        contact_name=name,
        contact_email=email,
        contact_phone=phone,
        company_name=(company_name or "").strip() or None,
        customer_type=(customer_type or "").strip() or None,
        project_po=(project_po or "").strip() or None,
        notes=(notes or "").strip() or None,
        delivery_method=delivery,
        delivery_address=(delivery_address or "").strip() or None,
        notification_prefs={
            "email": _parse_bool_pref(notify_email, True),
            "sms": _parse_bool_pref(notify_sms, False),
        },
        metals_client_id=client_id,
        metals_user_id=metals_user_id,
        source="website",
        created_at=utcnow(),
        status_updated_at=utcnow(),
    )
    db.add(row)
    db.flush()

    for idx, raw in enumerate(items_raw):
        if not isinstance(raw, dict):
            raise HTTPException(status_code=400, detail="Each item must be an object")
        desc = str(raw.get("description") or raw.get("name") or "").strip()
        if not desc:
            raise HTTPException(status_code=400, detail=f"Item {idx + 1}: description is required")
        qty = raw.get("quantity", 1)
        try:
            qty_i = int(qty)
        except Exception:
            raise HTTPException(status_code=400, detail=f"Item {idx + 1}: invalid quantity")
        if qty_i < 1:
            qty_i = 1
        catalog_product_id = None
        cpid = raw.get("catalog_product_id")
        if cpid:
            try:
                catalog_product_id = uuid.UUID(str(cpid))
            except Exception:
                raise HTTPException(status_code=400, detail=f"Item {idx + 1}: invalid catalog_product_id")
            prod = db.query(MetalsCatalogProduct).filter(MetalsCatalogProduct.id == catalog_product_id).first()
            if not prod:
                catalog_product_id = None
        db.add(
            MetalsWebsiteSubmissionItem(
                submission_id=row.id,
                sort_index=idx,
                catalog_product_id=catalog_product_id,
                description=desc[:500],
                gauge=(str(raw.get("gauge") or "").strip() or None),
                colour=(str(raw.get("colour") or raw.get("color") or "").strip() or None),
                quantity=qty_i,
                notes=(str(raw.get("notes") or "").strip() or None),
            )
        )

    for fidx, upload in enumerate(files):
        if not upload or not (upload.filename or "").strip():
            continue
        content, content_type, original_name = await read_upload(upload)
        fo = store_attachment(
            content=content,
            content_type=content_type,
            original_name=original_name,
            created_by=None,
            db=db,
        )
        db.add(
            MetalsWebsiteSubmissionFile(
                submission_id=row.id,
                file_object_id=fo.id,
                original_name=original_name,
                sort_index=fidx,
                created_at=utcnow(),
            )
        )

    db.commit()
    db.refresh(row)
    # Reload relationships
    row = (
        db.query(MetalsWebsiteSubmission)
        .options(
            joinedload(MetalsWebsiteSubmission.items),
            joinedload(MetalsWebsiteSubmission.files),
        )
        .filter(MetalsWebsiteSubmission.id == row.id)
        .first()
    )
    logger.info("Metals website %s submitted: %s", kind, row.submission_code)
    return {
        **serialize_submission(row),
        "message": "Submitted successfully",
        "status_label": STATUS_LABELS.get(row.status, row.status),
    }


@router.get("/meta")
def public_meta():
    return {
        "kinds": [{"value": KIND_ESTIMATE, "label": "Estimate"}, {"value": KIND_ORDER, "label": "Order"}],
        "statuses": [{"value": k, "label": v} for k, v in STATUS_LABELS.items()],
        "max_file_mb": 25,
        "max_files": MAX_FILES,
        "max_items": MAX_ITEMS,
        "allowed_file_types": ["application/pdf", "image/png", "image/jpeg", "dwg", "dxf"],
        "delivery_methods": [
            {"value": "pickup", "label": "Pick up"},
            {"value": "delivery", "label": "Delivery"},
        ],
        "customer_types": [
            {"value": "siding", "label": "Siding / exterior contractor"},
            {"value": "roofing", "label": "Roofing contractor"},
            {"value": "general", "label": "General contractor"},
            {"value": "architect", "label": "Architect / designer"},
            {"value": "homeowner", "label": "Homeowner"},
            {"value": "other", "label": "Other"},
        ],
    }


@router.get("/catalog")
def list_catalog(
    q: Optional[str] = None,
    category: Optional[str] = None,
    db: Session = Depends(get_db),
):
    query = (
        db.query(MetalsCatalogProduct)
        .options(joinedload(MetalsCatalogProduct.category))
        .filter(MetalsCatalogProduct.is_published.is_(True))
    )
    if category:
        slug = category.strip().lower()
        query = query.join(MetalsCatalogCategory).filter(
            MetalsCatalogCategory.slug == slug,
            MetalsCatalogCategory.is_published.is_(True),
        )
    if q and q.strip():
        term = f"%{q.strip()}%"
        query = query.filter(
            (MetalsCatalogProduct.name.ilike(term))
            | (MetalsCatalogProduct.short_description.ilike(term))
            | (MetalsCatalogProduct.description.ilike(term))
        )
    products = query.order_by(MetalsCatalogProduct.sort_index.asc(), MetalsCatalogProduct.name.asc()).all()
    categories = (
        db.query(MetalsCatalogCategory)
        .filter(MetalsCatalogCategory.is_published.is_(True))
        .order_by(MetalsCatalogCategory.sort_index.asc(), MetalsCatalogCategory.name.asc())
        .all()
    )
    return {
        "categories": [
            {
                "id": str(c.id),
                "slug": c.slug,
                "name": c.name,
                "description": c.description,
            }
            for c in categories
        ],
        "items": [serialize_catalog_product(p) for p in products],
        "total": len(products),
    }


@router.get("/catalog/{slug}")
def get_catalog_product(slug: str, db: Session = Depends(get_db)):
    p = (
        db.query(MetalsCatalogProduct)
        .options(joinedload(MetalsCatalogProduct.category))
        .filter(
            MetalsCatalogProduct.slug == slug.strip().lower(),
            MetalsCatalogProduct.is_published.is_(True),
        )
        .first()
    )
    if not p:
        raise HTTPException(status_code=404, detail="Product not found")
    return serialize_catalog_product(p)


@router.post("/estimates")
async def create_estimate(
    request: Request,
    contact_name: str = Form(...),
    contact_email: str = Form(...),
    contact_phone: Optional[str] = Form(None),
    company_name: Optional[str] = Form(None),
    customer_type: Optional[str] = Form(None),
    project_po: Optional[str] = Form(None),
    notes: Optional[str] = Form(None),
    notify_email: Optional[str] = Form("true"),
    notify_sms: Optional[str] = Form("false"),
    items_json: str = Form("[]"),
    files: List[UploadFile] = File(default=[]),
    db: Session = Depends(get_db),
    portal_user: Optional[PortalMetalsUser] = Depends(get_optional_metals_portal_user),
):
    # Collect all files under field name "files"
    form = await request.form()
    upload_files: List[UploadFile] = []
    for key, val in form.multi_items():
        if key == "files" and hasattr(val, "filename"):
            upload_files.append(val)  # type: ignore[arg-type]
    if not upload_files and files:
        upload_files = [f for f in files if f and (f.filename or "").strip()]

    return await _create_submission(
        request=request,
        kind=KIND_ESTIMATE,
        contact_name=contact_name,
        contact_email=contact_email,
        contact_phone=contact_phone,
        company_name=company_name,
        customer_type=customer_type,
        project_po=project_po,
        notes=notes,
        delivery_method=None,
        delivery_address=None,
        notify_email=notify_email,
        notify_sms=notify_sms,
        items_json=items_json,
        files=upload_files,
        db=db,
        portal_user=portal_user,
    )


@router.post("/orders")
async def create_order(
    request: Request,
    contact_name: str = Form(...),
    contact_email: str = Form(...),
    contact_phone: Optional[str] = Form(None),
    company_name: Optional[str] = Form(None),
    customer_type: Optional[str] = Form(None),
    project_po: Optional[str] = Form(None),
    notes: Optional[str] = Form(None),
    delivery_method: Optional[str] = Form("pickup"),
    delivery_address: Optional[str] = Form(None),
    notify_email: Optional[str] = Form("true"),
    notify_sms: Optional[str] = Form("false"),
    items_json: str = Form("[]"),
    files: List[UploadFile] = File(default=[]),
    db: Session = Depends(get_db),
    portal_user: Optional[PortalMetalsUser] = Depends(get_optional_metals_portal_user),
):
    form = await request.form()
    upload_files: List[UploadFile] = []
    for key, val in form.multi_items():
        if key == "files" and hasattr(val, "filename"):
            upload_files.append(val)  # type: ignore[arg-type]
    if not upload_files and files:
        upload_files = [f for f in files if f and (f.filename or "").strip()]

    return await _create_submission(
        request=request,
        kind=KIND_ORDER,
        contact_name=contact_name,
        contact_email=contact_email,
        contact_phone=contact_phone,
        company_name=company_name,
        customer_type=customer_type,
        project_po=project_po,
        notes=notes,
        delivery_method=delivery_method,
        delivery_address=delivery_address,
        notify_email=notify_email,
        notify_sms=notify_sms,
        items_json=items_json,
        files=upload_files,
        db=db,
        portal_user=portal_user,
    )
