"""Print shop supply catalog, stock, and supplier orders."""
from __future__ import annotations

import io
import logging
import os
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field
from slugify import slugify
from sqlalchemy.orm import Session, joinedload

from ..auth.security import get_current_user, require_permissions
from ..config import settings
from ..db import get_db
from ..models.models import (
    FileObject,
    PrintShopSupplyOrder,
    PrintShopSupplyOrderFile,
    PrintShopSupplyOrderItem,
    PrintShopSupplyProduct,
    Supplier,
    SupplierContact,
    User,
)
from ..routes.files import get_storage, unique_upload_key
from ..storage.blob_provider import BlobStorageProvider
from ..storage.local_provider import LocalStorageProvider

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/print-shop/supplies", tags=["print-shop-supplies"])

STATUS_DRAFT = "draft"
STATUS_ORDERED = "ordered"
STATUS_RECEIVED = "received"
STATUS_CANCELLED = "cancelled"

STATUS_LABELS = {
    STATUS_DRAFT: "Draft",
    STATUS_ORDERED: "Ordered",
    STATUS_RECEIVED: "Received",
    STATUS_CANCELLED: "Cancelled",
}

FILE_KIND_SUPPLIER_ORDER = "supplier_order"
FILE_KIND_PACKING_SLIP = "packing_slip"
FILE_KIND_OTHER = "other"
ALLOWED_FILE_KINDS = {FILE_KIND_SUPPLIER_ORDER, FILE_KIND_PACKING_SLIP, FILE_KIND_OTHER}

ALLOWED_CONTENT_TYPES = {
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/jpg",
    "image/webp",
    "image/heic",
    "image/heif",
}
ALLOWED_EXTENSIONS = {".pdf", ".png", ".jpg", ".jpeg", ".webp", ".heic", ".heif"}
MAX_FILE_BYTES = 20 * 1024 * 1024


# ---------- schemas ----------


class StockAdjustBody(BaseModel):
    delta: int
    note: Optional[str] = None


class ProductPatchBody(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    unit: Optional[str] = None
    list_price_note: Optional[str] = None
    notes: Optional[str] = None
    manufacturer: Optional[str] = None
    supplier_id: Optional[uuid.UUID] = None
    reorder_point: Optional[int] = None
    is_active: Optional[bool] = None
    sort_index: Optional[int] = None


class ProductCreateBody(BaseModel):
    name: str
    category: str
    unit: str = "ea"
    list_price_note: Optional[str] = None
    notes: Optional[str] = None
    manufacturer: Optional[str] = None
    supplier_id: Optional[uuid.UUID] = None
    reorder_point: int = 0
    stock_quantity: int = 0


class OrderItemIn(BaseModel):
    product_id: uuid.UUID
    quantity: int = Field(ge=1, le=100_000)


class CreateOrderBody(BaseModel):
    supplier_id: uuid.UUID
    contact_id: Optional[uuid.UUID] = None
    items: List[OrderItemIn]
    notes: Optional[str] = None
    contact_greeting_name: Optional[str] = None


class PatchOrderBody(BaseModel):
    supplier_id: Optional[uuid.UUID] = None
    contact_id: Optional[uuid.UUID] = None
    items: Optional[List[OrderItemIn]] = None
    notes: Optional[str] = None
    email_to: Optional[str] = None
    email_subject: Optional[str] = None
    email_body: Optional[str] = None
    contact_greeting_name: Optional[str] = None


# ---------- helpers ----------


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _clean_name(raw: str) -> str:
    s = (raw or "").replace("\xa0", " ").replace("\u2002", " ")
    s = re.sub(r"^1x\s+", "", s, flags=re.IGNORECASE)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def _next_order_code(db: Session) -> str:
    year = _utcnow().year
    prefix = f"PSO-{year}-"
    last = (
        db.query(PrintShopSupplyOrder)
        .filter(PrintShopSupplyOrder.order_code.like(f"{prefix}%"))
        .order_by(PrintShopSupplyOrder.order_code.desc())
        .first()
    )
    n = 1
    if last and last.order_code:
        try:
            n = int(str(last.order_code).rsplit("-", 1)[-1]) + 1
        except Exception:
            n = 1
    return f"{prefix}{n:05d}"


def _serialize_file(pf: PrintShopSupplyOrderFile) -> Dict[str, Any]:
    fo = pf.file_object
    return {
        "id": str(pf.id),
        "kind": pf.kind,
        "file_object_id": str(pf.file_object_id),
        "original_name": pf.original_name
        or (fo.tags.get("original_name") if fo and isinstance(fo.tags, dict) else None),
        "content_type": fo.content_type if fo else None,
        "size_bytes": fo.size_bytes if fo else None,
        "url": f"/files/{pf.file_object_id}",
        "created_at": pf.created_at.isoformat() if pf.created_at else None,
    }


def _serialize_product(p: PrintShopSupplyProduct) -> Dict[str, Any]:
    supplier = getattr(p, "supplier", None)
    return {
        "id": str(p.id),
        "name": p.name,
        "category": p.category,
        "unit": p.unit,
        "list_price_note": p.list_price_note,
        "notes": p.notes,
        "manufacturer": p.manufacturer,
        "supplier_id": str(p.supplier_id) if p.supplier_id else None,
        "supplier_name": supplier.name if supplier else None,
        "stock_quantity": p.stock_quantity,
        "reorder_point": p.reorder_point,
        "sort_index": p.sort_index,
        "is_active": p.is_active,
        "low_stock": (p.stock_quantity or 0) <= (p.reorder_point or 0),
        "updated_at": p.updated_at.isoformat() if p.updated_at else None,
    }


def _build_email(
    *,
    greeting_name: str,
    items: List[Tuple[str, int]],
) -> Tuple[str, str]:
    who = (greeting_name or "there").strip() or "there"
    lines = [f"{qty}x {name}" for name, qty in items]
    body = (
        f"Hello {who}, how are you?\n\n"
        f"Could you please place the following order for us:\n\n"
        + "\n".join(lines)
        + "\n\nThank you.\n"
    )
    subject = "Print shop supply order"
    return subject, body


def _greeting_from_contact(contact: Optional[SupplierContact], override: Optional[str]) -> str:
    if override and override.strip():
        return override.strip()
    if contact and contact.name:
        first = contact.name.strip().split()[0]
        return first
    return "there"


def _serialize_order(row: PrintShopSupplyOrder, *, include_email: bool = True) -> Dict[str, Any]:
    supplier = row.supplier
    contact = row.contact
    items_out = [
        {
            "id": str(it.id),
            "product_id": str(it.product_id) if it.product_id else None,
            "product_name": it.product_name,
            "quantity": it.quantity,
            "sort_index": it.sort_index,
        }
        for it in list(row.items or [])
    ]
    files_out = [_serialize_file(f) for f in list(row.files or [])]
    out: Dict[str, Any] = {
        "id": str(row.id),
        "order_code": row.order_code,
        "status": row.status,
        "status_label": STATUS_LABELS.get(row.status, row.status),
        "supplier_id": str(row.supplier_id),
        "supplier_name": supplier.name if supplier else None,
        "supplier_email": supplier.email if supplier else None,
        "contact_id": str(row.contact_id) if row.contact_id else None,
        "contact_name": contact.name if contact else None,
        "contact_email": contact.email if contact else None,
        "notes": row.notes,
        "items": items_out,
        "files": files_out,
        "supplier_order_files": [f for f in files_out if f["kind"] == FILE_KIND_SUPPLIER_ORDER],
        "packing_slip_files": [f for f in files_out if f["kind"] == FILE_KIND_PACKING_SLIP],
        "ordered_at": row.ordered_at.isoformat() if row.ordered_at else None,
        "received_at": row.received_at.isoformat() if row.received_at else None,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }
    if include_email:
        out["email_to"] = row.email_to
        out["email_subject"] = row.email_subject
        out["email_body"] = row.email_body
    return out


def _get_order(db: Session, order_id: str) -> PrintShopSupplyOrder:
    try:
        oid = uuid.UUID(order_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid order id")
    row = (
        db.query(PrintShopSupplyOrder)
        .options(
            joinedload(PrintShopSupplyOrder.items),
            joinedload(PrintShopSupplyOrder.files).joinedload(PrintShopSupplyOrderFile.file_object),
            joinedload(PrintShopSupplyOrder.supplier),
            joinedload(PrintShopSupplyOrder.contact),
        )
        .filter(PrintShopSupplyOrder.id == oid)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Supply order not found")
    return row


def _replace_items(db: Session, row: PrintShopSupplyOrder, items: List[OrderItemIn]) -> None:
    if not items:
        raise HTTPException(status_code=400, detail="At least one item is required")
    row.items.clear()
    db.flush()
    for idx, raw in enumerate(items):
        prod = db.query(PrintShopSupplyProduct).filter(PrintShopSupplyProduct.id == raw.product_id).first()
        if not prod or not prod.is_active:
            raise HTTPException(status_code=400, detail=f"Invalid product: {raw.product_id}")
        row.items.append(
            PrintShopSupplyOrderItem(
                product_id=prod.id,
                product_name=prod.name,
                quantity=raw.quantity,
                sort_index=idx,
            )
        )


def _resolve_email_to(
    supplier: Supplier,
    contact: Optional[SupplierContact],
    explicit: Optional[str],
) -> Optional[str]:
    if explicit and explicit.strip():
        return explicit.strip()
    if contact and contact.email:
        return contact.email.strip()
    if supplier.email:
        return supplier.email.strip()
    return None


def _store_upload(
    *,
    content: bytes,
    content_type: str,
    original_name: str,
    created_by: Optional[uuid.UUID],
    db: Session,
) -> FileObject:
    storage = get_storage()
    today = _utcnow().strftime("%Y-%m-%d")
    year = _utcnow().strftime("%Y")
    safe_name = slugify(os.path.splitext(original_name)[0]) or "attachment"
    ext = os.path.splitext(original_name)[1].lower()
    if ext == ".jpeg":
        ext = ".jpg"
    base = f"/org/{year}/print-shop/supplies/{today}_{safe_name}{ext}"
    key = unique_upload_key(base)
    try:
        storage.copy_in(io.BytesIO(content), key)
    except Exception as e:
        logger.exception("Failed to store print-shop supply file")
        raise HTTPException(status_code=500, detail=f"Failed to store file: {e}") from e

    if isinstance(storage, LocalStorageProvider):
        provider, container = "local", "local"
    elif isinstance(storage, BlobStorageProvider):
        provider, container = "blob", (settings.azure_blob_container or "")
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
        source_ref="print-shop-supplies",
        tags={"original_name": original_name, "scope": "print-shop-supplies"},
    )
    db.add(fo)
    db.flush()
    return fo


async def _read_upload(file: UploadFile) -> Tuple[bytes, str, str]:
    original_name = (file.filename or "file").strip() or "file"
    ext = os.path.splitext(original_name)[1].lower()
    content_type = (file.content_type or "").strip().lower() or "application/octet-stream"

    if ext not in ALLOWED_EXTENSIONS and content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(status_code=400, detail="File must be PDF or image")
    if ext and ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="File must be PDF or image")

    chunks: List[bytes] = []
    total = 0
    while True:
        chunk = await file.read(1024 * 1024)
        if not chunk:
            break
        total += len(chunk)
        if total > MAX_FILE_BYTES:
            raise HTTPException(status_code=413, detail="File too large (max 20 MB)")
        chunks.append(chunk)
    content = b"".join(chunks)
    if not content:
        raise HTTPException(status_code=400, detail="File is empty")
    return content, content_type, original_name


# ---------- suppliers (for print shop users) ----------


@router.get("/suppliers")
def list_suppliers_for_orders(
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
    __: Any = Depends(require_permissions("print_shop:read")),
):
    rows = (
        db.query(Supplier)
        .options(joinedload(Supplier.contacts))
        .filter(Supplier.is_active.is_(True))
        .order_by(Supplier.name.asc())
        .limit(500)
        .all()
    )
    return {
        "items": [
            {
                "id": str(s.id),
                "name": s.name,
                "email": s.email,
                "contacts": [
                    {
                        "id": str(c.id),
                        "name": c.name,
                        "email": c.email,
                        "title": c.title,
                    }
                    for c in list(s.contacts or [])
                ],
            }
            for s in rows
        ]
    }


# ---------- products / stock ----------


@router.get("/products")
def list_products(
    q: Optional[str] = None,
    category: Optional[str] = None,
    active_only: bool = True,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
    __: Any = Depends(require_permissions("print_shop:read")),
):
    query = db.query(PrintShopSupplyProduct).options(joinedload(PrintShopSupplyProduct.supplier))
    if active_only:
        query = query.filter(PrintShopSupplyProduct.is_active.is_(True))
    if category:
        query = query.filter(PrintShopSupplyProduct.category == category)
    if q and q.strip():
        term = f"%{q.strip()}%"
        query = query.filter(
            (PrintShopSupplyProduct.name.ilike(term))
            | (PrintShopSupplyProduct.manufacturer.ilike(term))
            | (PrintShopSupplyProduct.category.ilike(term))
        )
    rows = query.order_by(
        PrintShopSupplyProduct.category.asc(),
        PrintShopSupplyProduct.sort_index.asc(),
        PrintShopSupplyProduct.name.asc(),
    ).all()
    cats = sorted({r.category for r in rows})
    return {
        "items": [_serialize_product(r) for r in rows],
        "categories": cats,
        "total": len(rows),
    }


@router.post("/products")
def create_product(
    body: ProductCreateBody,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
    __: Any = Depends(require_permissions("print_shop:write")),
):
    name = _clean_name(body.name)
    category = (body.category or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="name is required")
    if not category:
        raise HTTPException(status_code=400, detail="category is required")
    supplier_id = body.supplier_id
    if supplier_id:
        if not db.query(Supplier).filter(Supplier.id == supplier_id).first():
            raise HTTPException(status_code=400, detail="Supplier not found")
    now = _utcnow()
    row = PrintShopSupplyProduct(
        name=name,
        category=category,
        unit=(body.unit or "ea").strip() or "ea",
        list_price_note=(body.list_price_note or "").strip() or None,
        notes=(body.notes or "").strip() or None,
        manufacturer=(body.manufacturer or "").strip() or None,
        supplier_id=supplier_id,
        stock_quantity=max(0, body.stock_quantity or 0),
        reorder_point=max(0, body.reorder_point or 0),
        is_active=True,
        created_at=now,
        updated_at=now,
    )
    db.add(row)
    db.commit()
    row = (
        db.query(PrintShopSupplyProduct)
        .options(joinedload(PrintShopSupplyProduct.supplier))
        .filter(PrintShopSupplyProduct.id == row.id)
        .first()
    )
    return _serialize_product(row)


@router.patch("/products/{product_id}")
def patch_product(
    product_id: str,
    body: ProductPatchBody,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
    __: Any = Depends(require_permissions("print_shop:write")),
):
    try:
        pid = uuid.UUID(product_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid product id")
    row = (
        db.query(PrintShopSupplyProduct)
        .options(joinedload(PrintShopSupplyProduct.supplier))
        .filter(PrintShopSupplyProduct.id == pid)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Product not found")
    fields = body.model_fields_set
    if "name" in fields and body.name is not None:
        row.name = _clean_name(body.name) or row.name
    if "category" in fields and body.category is not None:
        row.category = body.category.strip() or row.category
    if "unit" in fields and body.unit is not None:
        row.unit = body.unit.strip() or row.unit
    if "list_price_note" in fields:
        row.list_price_note = (body.list_price_note or "").strip() or None
    if "notes" in fields:
        row.notes = (body.notes or "").strip() or None
    if "manufacturer" in fields:
        row.manufacturer = (body.manufacturer or "").strip() or None
    if "supplier_id" in fields:
        if body.supplier_id is None:
            row.supplier_id = None
        else:
            if not db.query(Supplier).filter(Supplier.id == body.supplier_id).first():
                raise HTTPException(status_code=400, detail="Supplier not found")
            row.supplier_id = body.supplier_id
    if "reorder_point" in fields and body.reorder_point is not None:
        row.reorder_point = max(0, body.reorder_point)
    if "is_active" in fields and body.is_active is not None:
        row.is_active = body.is_active
    if "sort_index" in fields and body.sort_index is not None:
        row.sort_index = body.sort_index
    row.updated_at = _utcnow()
    db.commit()
    row = (
        db.query(PrintShopSupplyProduct)
        .options(joinedload(PrintShopSupplyProduct.supplier))
        .filter(PrintShopSupplyProduct.id == pid)
        .first()
    )
    return _serialize_product(row)


@router.post("/products/{product_id}/adjust-stock")
def adjust_stock(
    product_id: str,
    body: StockAdjustBody,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
    __: Any = Depends(require_permissions("print_shop:write")),
):
    """Manual stock up/down (usage is tracked manually — no auto-consume)."""
    try:
        pid = uuid.UUID(product_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid product id")
    if body.delta == 0:
        raise HTTPException(status_code=400, detail="delta cannot be 0")
    row = db.query(PrintShopSupplyProduct).filter(PrintShopSupplyProduct.id == pid).first()
    if not row:
        raise HTTPException(status_code=404, detail="Product not found")
    new_qty = (row.stock_quantity or 0) + body.delta
    if new_qty < 0:
        raise HTTPException(status_code=400, detail="Stock cannot go below 0")
    row.stock_quantity = new_qty
    row.updated_at = _utcnow()
    if body.note:
        existing = row.notes or ""
        stamp = _utcnow().strftime("%Y-%m-%d")
        line = f"[{stamp}] stock {body.delta:+d}: {body.note.strip()}"
        row.notes = f"{existing}\n{line}".strip() if existing else line
    db.commit()
    db.refresh(row)
    return _serialize_product(row)


# ---------- orders ----------


@router.get("/orders")
def list_orders(
    status: Optional[str] = None,
    q: Optional[str] = None,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
    __: Any = Depends(require_permissions("print_shop:read")),
):
    query = db.query(PrintShopSupplyOrder).options(
        joinedload(PrintShopSupplyOrder.items),
        joinedload(PrintShopSupplyOrder.files).joinedload(PrintShopSupplyOrderFile.file_object),
        joinedload(PrintShopSupplyOrder.supplier),
        joinedload(PrintShopSupplyOrder.contact),
    )
    if status:
        if status not in STATUS_LABELS:
            raise HTTPException(status_code=400, detail="Invalid status")
        query = query.filter(PrintShopSupplyOrder.status == status)
    if q and q.strip():
        term = f"%{q.strip()}%"
        query = query.filter(
            (PrintShopSupplyOrder.order_code.ilike(term))
            | (PrintShopSupplyOrder.notes.ilike(term))
        )
    rows = query.order_by(PrintShopSupplyOrder.created_at.desc()).limit(500).all()
    return {
        "items": [_serialize_order(r) for r in rows],
        "total": len(rows),
    }


@router.get("/orders/{order_id}")
def get_order(
    order_id: str,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
    __: Any = Depends(require_permissions("print_shop:read")),
):
    return _serialize_order(_get_order(db, order_id))


@router.post("/orders")
def create_order(
    body: CreateOrderBody,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    __: Any = Depends(require_permissions("print_shop:write")),
):
    supplier = db.query(Supplier).filter(Supplier.id == body.supplier_id).first()
    if not supplier:
        raise HTTPException(status_code=400, detail="Supplier not found")
    contact = None
    if body.contact_id:
        contact = (
            db.query(SupplierContact)
            .filter(
                SupplierContact.id == body.contact_id,
                SupplierContact.supplier_id == supplier.id,
            )
            .first()
        )
        if not contact:
            raise HTTPException(status_code=400, detail="Contact not found for supplier")

    now = _utcnow()
    greeting = _greeting_from_contact(contact, body.contact_greeting_name)
    row = PrintShopSupplyOrder(
        order_code=_next_order_code(db),
        status=STATUS_DRAFT,
        supplier_id=supplier.id,
        contact_id=contact.id if contact else None,
        notes=(body.notes or "").strip() or None,
        created_by=user.id,
        created_at=now,
        updated_at=now,
    )
    db.add(row)
    db.flush()
    _replace_items(db, row, body.items)

    item_pairs = [(it.product_name, it.quantity) for it in row.items]
    subject, email_body = _build_email(greeting_name=greeting, items=item_pairs)
    row.email_to = _resolve_email_to(supplier, contact, None)
    row.email_subject = subject
    row.email_body = email_body

    db.commit()
    return _serialize_order(_get_order(db, str(row.id)))


@router.patch("/orders/{order_id}")
def patch_order(
    order_id: str,
    body: PatchOrderBody,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
    __: Any = Depends(require_permissions("print_shop:write")),
):
    row = _get_order(db, order_id)
    if row.status in (STATUS_RECEIVED, STATUS_CANCELLED):
        raise HTTPException(status_code=400, detail="Cannot edit a received or cancelled order")

    supplier = row.supplier
    contact = row.contact
    rebuild_email = False

    if body.supplier_id is not None:
        supplier = db.query(Supplier).filter(Supplier.id == body.supplier_id).first()
        if not supplier:
            raise HTTPException(status_code=400, detail="Supplier not found")
        row.supplier_id = supplier.id
        if body.contact_id is None:
            row.contact_id = None
            contact = None
        rebuild_email = True

    if body.contact_id is not None:
        if body.contact_id:
            contact = (
                db.query(SupplierContact)
                .filter(
                    SupplierContact.id == body.contact_id,
                    SupplierContact.supplier_id == row.supplier_id,
                )
                .first()
            )
            if not contact:
                raise HTTPException(status_code=400, detail="Contact not found for supplier")
            row.contact_id = contact.id
        else:
            row.contact_id = None
            contact = None
        rebuild_email = True

    if body.items is not None:
        if row.status != STATUS_DRAFT:
            raise HTTPException(status_code=400, detail="Items can only change while draft")
        _replace_items(db, row, body.items)
        rebuild_email = True

    if body.notes is not None:
        row.notes = body.notes.strip() or None

    if body.email_to is not None:
        row.email_to = body.email_to.strip() or None
    if body.email_subject is not None:
        row.email_subject = body.email_subject.strip() or None
    if body.email_body is not None:
        row.email_body = body.email_body
        rebuild_email = False

    if rebuild_email and body.email_body is None:
        greeting = _greeting_from_contact(contact, body.contact_greeting_name)
        item_pairs = [(it.product_name, it.quantity) for it in row.items]
        subject, email_body = _build_email(greeting_name=greeting, items=item_pairs)
        if body.email_subject is None:
            row.email_subject = subject
        row.email_body = email_body
        if body.email_to is None:
            row.email_to = _resolve_email_to(supplier, contact, None)

    row.updated_at = _utcnow()
    db.commit()
    return _serialize_order(_get_order(db, order_id))


@router.post("/orders/{order_id}/mark-ordered")
def mark_ordered(
    order_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    __: Any = Depends(require_permissions("print_shop:write")),
):
    row = _get_order(db, order_id)
    if row.status != STATUS_DRAFT:
        raise HTTPException(status_code=400, detail="Only draft orders can be marked ordered")
    if not row.items:
        raise HTTPException(status_code=400, detail="Order has no items")
    row.status = STATUS_ORDERED
    row.ordered_at = _utcnow()
    row.ordered_by = user.id
    row.updated_at = _utcnow()
    db.commit()
    return _serialize_order(_get_order(db, order_id))


@router.post("/orders/{order_id}/receive")
def receive_order(
    order_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    __: Any = Depends(require_permissions("print_shop:write")),
):
    """Confirm receipt: status → received and increase stock by ordered quantities."""
    row = _get_order(db, order_id)
    if row.status not in (STATUS_DRAFT, STATUS_ORDERED):
        raise HTTPException(status_code=400, detail="Only draft/ordered can be received")
    if not row.items:
        raise HTTPException(status_code=400, detail="Order has no items")

    for it in row.items:
        if not it.product_id:
            continue
        prod = db.query(PrintShopSupplyProduct).filter(PrintShopSupplyProduct.id == it.product_id).first()
        if prod:
            prod.stock_quantity = (prod.stock_quantity or 0) + it.quantity
            prod.updated_at = _utcnow()

    row.status = STATUS_RECEIVED
    row.received_at = _utcnow()
    row.received_by = user.id
    if not row.ordered_at:
        row.ordered_at = row.received_at
        row.ordered_by = user.id
    row.updated_at = _utcnow()
    db.commit()
    return _serialize_order(_get_order(db, order_id))


@router.post("/orders/{order_id}/cancel")
def cancel_order(
    order_id: str,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
    __: Any = Depends(require_permissions("print_shop:write")),
):
    row = _get_order(db, order_id)
    if row.status == STATUS_RECEIVED:
        raise HTTPException(status_code=400, detail="Cannot cancel a received order")
    if row.status == STATUS_CANCELLED:
        raise HTTPException(status_code=400, detail="Already cancelled")
    row.status = STATUS_CANCELLED
    row.updated_at = _utcnow()
    db.commit()
    return _serialize_order(_get_order(db, order_id))


@router.delete("/orders/{order_id}")
def delete_order(
    order_id: str,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
    __: Any = Depends(require_permissions("print_shop:write")),
):
    row = _get_order(db, order_id)
    code = row.order_code
    db.delete(row)
    db.commit()
    return {"ok": True, "id": order_id, "order_code": code}


@router.post("/orders/{order_id}/files")
async def upload_order_file(
    order_id: str,
    kind: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    __: Any = Depends(require_permissions("print_shop:write")),
):
    row = _get_order(db, order_id)
    kind_s = (kind or "").strip().lower()
    if kind_s not in ALLOWED_FILE_KINDS:
        raise HTTPException(status_code=400, detail="Invalid file kind")
    if row.status == STATUS_CANCELLED:
        raise HTTPException(status_code=400, detail="Cannot attach files to a cancelled order")

    content, content_type, original_name = await _read_upload(file)
    fo = _store_upload(
        content=content,
        content_type=content_type,
        original_name=original_name,
        created_by=user.id,
        db=db,
    )
    pf = PrintShopSupplyOrderFile(
        order_id=row.id,
        kind=kind_s,
        file_object_id=fo.id,
        original_name=original_name,
        created_at=_utcnow(),
        created_by=user.id,
    )
    db.add(pf)
    row.updated_at = _utcnow()
    db.commit()
    return _serialize_order(_get_order(db, order_id))


@router.delete("/orders/{order_id}/files/{file_id}")
def delete_order_file(
    order_id: str,
    file_id: str,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
    __: Any = Depends(require_permissions("print_shop:write")),
):
    row = _get_order(db, order_id)
    try:
        fid = uuid.UUID(file_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid file id")
    pf = next((f for f in row.files if f.id == fid), None)
    if not pf:
        raise HTTPException(status_code=404, detail="File not found")
    db.delete(pf)
    row.updated_at = _utcnow()
    db.commit()
    return _serialize_order(_get_order(db, order_id))
