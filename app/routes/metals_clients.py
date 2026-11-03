"""Mack Kirk Metals CRM API (distinct from Hub /clients)."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from sqlalchemy import func, literal, or_
from sqlalchemy.orm import Session

from ..auth.mass_assignment import sanitize_orm_patch
from ..auth.security import (
    assert_metals_customer_tab,
    can_read_metals_client_for_quotes,
    get_current_user,
    require_permissions,
    require_roles,
    User,
)
from ..db import get_db
from ..models.models import (
    ClientFile,
    FileObject,
    MetalsClient,
    MetalsClientContact,
    MetalsClientDocument,
    MetalsClientFile,
    MetalsClientFolder,
    MetalsClientNote,
    MetalsClientSite,
    WorkOrderFile,
)
from ..schemas.clients import (
    ClientContactCreate,
    ClientContactResponse,
    ClientCreate,
    ClientResponse,
    ClientSiteCreate,
    ClientSiteResponse,
)
from ..services.client_notes import resolve_user_display_names, serialize_client_note
from ..services.client_product_scope import (
    assert_can_view_metals_client,
    can_list_metals_customers,
    can_read_metals_customers,
    can_write_metals_customers,
)
from ..services.standard_file_categories import get_categories_for_client_api, get_default_folder_rows

router = APIRouter(prefix="/metals/clients", tags=["metals-clients"])

def _assert_metals_tab_read(user: User, tab: str, *, allow_quote: bool = False) -> None:
    if allow_quote and can_read_metals_client_for_quotes(user):
        return
    assert_metals_customer_tab(user, tab, "read")


def _parse_client_uuid(client_id: str) -> uuid.UUID:
    try:
        return uuid.UUID(str(client_id))
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Invalid client id")


def _get_metals_client(db: Session, client_id: str, *, include_deleted: bool = False) -> MetalsClient:
    cid = _parse_client_uuid(client_id)
    q = db.query(MetalsClient).filter(MetalsClient.id == cid)
    if not include_deleted:
        q = q.filter(MetalsClient.deleted_at.is_(None))
    c = q.first()
    if not c:
        raise HTTPException(status_code=404, detail="Not found")
    return c


def _sort_clause(sort: Optional[str], asc: bool):
    s = (sort or "").strip().lower()
    if s in ("name", "customer"):
        t = func.lower(func.coalesce(MetalsClient.display_name, MetalsClient.name, literal("")))
        return (t.asc().nulls_last(),) if asc else (t.desc().nulls_last(),)
    if s == "code":
        t = func.lower(func.coalesce(MetalsClient.code, literal("")))
        return (t.asc().nulls_last(),) if asc else (t.desc().nulls_last(),)
    if s == "city":
        t = func.lower(func.coalesce(MetalsClient.city, literal("")))
        return (t.asc().nulls_last(),) if asc else (t.desc().nulls_last(),)
    return (MetalsClient.created_at.desc(),)


def _logo_url_from_metals_file(cf: MetalsClientFile, *, width: int = 96) -> str:
    timestamp = cf.uploaded_at.isoformat() if cf.uploaded_at else None
    timestamp_param = f"&t={timestamp}" if timestamp else ""
    return f"/files/{cf.file_object_id}/thumbnail?w={width}{timestamp_param}"


def _metals_logo_files_by_client_id(
    db: Session, client_ids: list[uuid.UUID]
) -> dict[uuid.UUID, MetalsClientFile]:
    """Latest client-logo-derived file per metals client (no site)."""
    logo_files: dict[uuid.UUID, MetalsClientFile] = {}
    if not client_ids:
        return logo_files
    logo_rows = (
        db.query(MetalsClientFile)
        .filter(
            MetalsClientFile.client_id.in_(client_ids),
            MetalsClientFile.site_id.is_(None),
            MetalsClientFile.category.ilike("client-logo-derived"),
            MetalsClientFile.deleted_at.is_(None),
        )
        .order_by(MetalsClientFile.uploaded_at.desc().nullslast())
        .all()
    )
    for cf in logo_rows:
        if cf.client_id not in logo_files:
            logo_files[cf.client_id] = cf
    return logo_files


def _serialize_metals_client(
    client: MetalsClient,
    logo_file: Optional[MetalsClientFile] = None,
) -> dict:
    return {
        "id": client.id,
        "code": client.code,
        "name": client.name,
        "legal_name": client.legal_name,
        "display_name": client.display_name,
        "client_type": client.client_type,
        "client_status": client.client_status,
        "lead_source": client.lead_source,
        "estimator_id": client.estimator_id,
        "description": client.description,
        "address_line1": client.address_line1,
        "address_line2": client.address_line2,
        "city": client.city,
        "province": client.province,
        "postal_code": client.postal_code,
        "country": client.country,
        "billing_address_line1": client.billing_address_line1,
        "billing_address_line2": client.billing_address_line2,
        "billing_city": client.billing_city,
        "billing_province": client.billing_province,
        "billing_postal_code": client.billing_postal_code,
        "billing_country": client.billing_country,
        "billing_same_as_address": client.billing_same_as_address,
        "billing_email": client.billing_email,
        "po_required": client.po_required,
        "tax_number": client.tax_number,
        "preferred_language": client.preferred_language,
        "preferred_channels": client.preferred_channels,
        "marketing_opt_in": client.marketing_opt_in,
        "invoice_delivery_method": client.invoice_delivery_method,
        "statement_delivery_method": client.statement_delivery_method,
        "cc_emails_for_invoices": client.cc_emails_for_invoices,
        "cc_emails_for_estimates": client.cc_emails_for_estimates,
        "do_not_contact": client.do_not_contact,
        "do_not_contact_reason": client.do_not_contact_reason,
        "created_at": client.created_at,
        "logo_url": _logo_url_from_metals_file(logo_file) if logo_file else None,
    }


def _allocate_metals_client_code(db: Session) -> str:
    existing = db.query(MetalsClient.code).filter(MetalsClient.code.isnot(None)).all()
    numeric_codes: list[int] = []
    for row in existing:
        code_value = row[0] if isinstance(row, (tuple, list)) else row
        if code_value and isinstance(code_value, str) and code_value.isdigit() and len(code_value) == 5:
            try:
                numeric_codes.append(int(code_value))
            except ValueError:
                pass
    next_code = (max(numeric_codes) if numeric_codes else 0) + 1
    code = f"{next_code:05d}"
    while db.query(MetalsClient).filter(MetalsClient.code == code, MetalsClient.deleted_at.is_(None)).first():
        next_code += 1
        code = f"{next_code:05d}"
    return code


def _try_remove_orphan_file_object(db: Session, file_object_id: uuid.UUID) -> None:
    if db.query(MetalsClientFile).filter(MetalsClientFile.file_object_id == file_object_id).count() > 0:
        return
    if db.query(ClientFile).filter(ClientFile.file_object_id == file_object_id).count() > 0:
        return
    if db.query(WorkOrderFile).filter(WorkOrderFile.file_object_id == file_object_id).count() > 0:
        return
    fo = db.query(FileObject).filter(FileObject.id == file_object_id).first()
    if not fo:
        return
    try:
        from ..routes.files import get_storage_for_file
        from ..services.document_display_image import delete_display_copies

        storage = get_storage_for_file(fo)
        storage.delete(fo.key)
        delete_display_copies(storage, str(fo.id))
    except Exception:
        pass
    db.delete(fo)


def _file_is_image(name: str, content_type: Optional[str]) -> bool:
    ext = (name.rsplit(".", 1)[-1] if "." in name else "").lower()
    is_img_ext = ext in {"png", "jpg", "jpeg", "webp", "gif", "bmp", "heic", "heif"}
    return (content_type or "").startswith("image/") or is_img_ext


def _serialize_metals_file_row(db: Session, cf: MetalsClientFile, client_id: str) -> dict:
    fo = db.query(FileObject).filter(FileObject.id == cf.file_object_id).first()
    ct = getattr(fo, "content_type", None) if fo else None
    name = cf.original_name or cf.key or ""
    sort_index = 0
    try:
        if fo and getattr(fo, "tags", None):
            client_sort = (fo.tags or {}).get("client_sort") or {}
            sort_index = int(client_sort.get(str(client_id), 0) or 0)
    except Exception:
        sort_index = 0
    return {
        "id": str(cf.id),
        "file_object_id": str(cf.file_object_id),
        "category": cf.category,
        "key": cf.key,
        "original_name": cf.original_name,
        "site_id": str(cf.site_id) if getattr(cf, "site_id", None) else None,
        "folder_id": str(cf.folder_id) if getattr(cf, "folder_id", None) else None,
        "project_id": None,
        "project": None,
        "uploaded_at": cf.uploaded_at.isoformat() if cf.uploaded_at else None,
        "uploaded_by": str(cf.uploaded_by) if cf.uploaded_by else None,
        "content_type": ct,
        "is_image": _file_is_image(name, ct),
        "sort_index": sort_index,
        "customer_visible": bool(getattr(cf, "customer_visible", False)),
        "notes": getattr(cf, "notes", None),
    }


def create_default_folders_for_metals_client(
    db: Session,
    client_id: uuid.UUID | str,
    parent_folder_id: Optional[uuid.UUID],
) -> list[MetalsClientFolder]:
    if isinstance(client_id, str):
        client_uuid = uuid.UUID(str(client_id))
    else:
        client_uuid = client_id
    created: list[MetalsClientFolder] = []
    for folder_def in get_default_folder_rows(db):
        existing = (
            db.query(MetalsClientFolder)
            .filter(
                MetalsClientFolder.client_id == client_uuid,
                MetalsClientFolder.name == folder_def["name"],
                MetalsClientFolder.parent_id == parent_folder_id,
            )
            .first()
        )
        if existing:
            continue
        folder = MetalsClientFolder(
            client_id=client_uuid,
            name=folder_def["name"],
            parent_id=parent_folder_id,
            sort_index=folder_def["sort_index"],
        )
        db.add(folder)
        created.append(folder)
    if created:
        db.commit()
        for folder in created:
            db.refresh(folder)
    return created


# ----- Collection routes (before /{client_id}) -----


@router.get("")
def list_metals_clients(
    q: Optional[str] = None,
    city: Optional[str] = None,
    city_not: Optional[str] = None,
    status: Optional[str] = None,
    status_not: Optional[str] = None,
    type: Optional[str] = None,
    type_not: Optional[str] = None,
    page: int = 1,
    limit: int = 10,
    sort: Optional[str] = None,
    sort_dir: Optional[str] = Query("asc", alias="dir"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # List: main customers read, any tab grant, or quotations read (quote client picker/logos)
    if not (
        can_list_metals_customers(user)
        or can_read_metals_customers(user)
        or can_read_metals_client_for_quotes(user)
    ):
        raise HTTPException(status_code=403, detail="Forbidden")
    page = max(1, page)
    limit = max(1, min(100, limit))
    offset = (page - 1) * limit
    base_query = db.query(MetalsClient).filter(
        MetalsClient.is_system == False,
        MetalsClient.deleted_at.is_(None),
    )
    if city:
        base_query = base_query.filter(MetalsClient.city == city)
    if city_not:
        base_query = base_query.filter(MetalsClient.city != city_not)
    if status:
        base_query = base_query.filter(MetalsClient.client_status == status)
    if status_not:
        base_query = base_query.filter(MetalsClient.client_status != status_not)
    if type:
        base_query = base_query.filter(MetalsClient.client_type == type)
    if type_not:
        base_query = base_query.filter(MetalsClient.client_type != type_not)
    if q:
        like = f"%{q.strip()}%"
        base_query = base_query.filter(
            or_(
                MetalsClient.name.ilike(like),
                MetalsClient.display_name.ilike(like),
                MetalsClient.code.ilike(like),
                MetalsClient.city.ilike(like),
            )
        )
    total = base_query.count()
    asc = (sort_dir or "asc").lower() != "desc"
    rows = base_query.order_by(*_sort_clause(sort, asc)).offset(offset).limit(limit).all()
    logo_files = _metals_logo_files_by_client_id(db, [c.id for c in rows])
    items = [_serialize_metals_client(c, logo_files.get(c.id)) for c in rows]
    total_pages = (total + limit - 1) // limit if limit else 1
    return {"items": items, "total": total, "page": page, "limit": limit, "total_pages": total_pages}


@router.post("", response_model=ClientResponse)
def create_metals_client(
    payload: ClientCreate,
    create_default_folders: bool = False,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _=Depends(require_permissions("metals:customers:write")),
):
    if not can_write_metals_customers(user):
        raise HTTPException(status_code=403, detail="Forbidden")
    try:
        data = payload.dict(exclude_unset=True)
        data = {k: v for k, v in data.items() if v is not None}
        data.pop("serves_hub", None)
        data.pop("serves_metals", None)
        if not data.get("name"):
            data["name"] = data.get("display_name") or "client"
        if not data.get("code"):
            data["code"] = _allocate_metals_client_code(db)
        data["created_by"] = user.id
        c = MetalsClient(**data)
        db.add(c)
        db.commit()
        db.refresh(c)
        if create_default_folders:
            try:
                create_default_folders_for_metals_client(db, c.id, None)
            except Exception:
                pass
        return c
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/locations")
def get_metals_client_locations(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not (
        can_list_metals_customers(user)
        or can_read_metals_customers(user)
        or can_read_metals_client_for_quotes(user)
    ):
        raise HTTPException(status_code=403, detail="Forbidden")
    locations = (
        db.query(MetalsClient.country, MetalsClient.province, MetalsClient.city)
        .filter(
            MetalsClient.is_system == False,
            MetalsClient.deleted_at.is_(None),
            MetalsClient.country.isnot(None),
            MetalsClient.province.isnot(None),
            MetalsClient.city.isnot(None),
        )
        .distinct()
        .order_by(MetalsClient.country.asc(), MetalsClient.province.asc(), MetalsClient.city.asc())
        .all()
    )
    result: dict = {}
    for country, province, city in locations:
        if not country or not province or not city:
            continue
        result.setdefault(country, {}).setdefault(province, [])
        if city not in result[country][province]:
            result[country][province].append(city)
    for country in result:
        for province in result[country]:
            result[country][province].sort()
    return result


@router.get("/file-categories")
def list_metals_file_categories(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _assert_metals_tab_read(user, "files")
    return get_categories_for_client_api(db)


# ----- Client CRUD -----


@router.get("/{client_id}", response_model=ClientResponse)
def get_metals_client(
    client_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    c = _get_metals_client(db, client_id)
    assert_can_view_metals_client(user, c)
    logos = _metals_logo_files_by_client_id(db, [c.id])
    return _serialize_metals_client(c, logos.get(c.id))


@router.get("/{client_id}/project-participations")
def get_metals_client_project_participations(
    client_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    limit: int = Query(400, ge=1, le=500),
):
    """Hub-shaped stub: Metals CRM has no Hub project graph yet."""
    _assert_metals_tab_read(user, "overview")
    c = _get_metals_client(db, client_id)
    assert_can_view_metals_client(user, c)
    _ = limit
    return {"rollup": [], "related_memberships": []}


@router.get("/{client_id}/insights")
def get_metals_client_insights(
    client_id: str,
    from_: str = Query(..., alias="from"),
    to: str = Query(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Hub-shaped overview payload; empty until Metals has its own project/opportunity graph."""
    _assert_metals_tab_read(user, "overview")
    c = _get_metals_client(db, client_id)
    assert_can_view_metals_client(user, c)
    from ..services.customer_insights import build_customer_insights_payload

    client_uuid = _parse_client_uuid(client_id)
    client_created = c.created_at.isoformat() if getattr(c, "created_at", None) else None
    try:
        return build_customer_insights_payload(db, client_uuid, user, from_, to, client_created)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.patch("/{client_id}")
def update_metals_client(
    client_id: str,
    payload: dict,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    assert_metals_customer_tab(user, "general", "write")
    c = _get_metals_client(db, client_id)
    payload = sanitize_orm_patch(payload, extra_blocked=("serves_hub", "serves_metals"))
    for k, v in payload.items():
        if hasattr(MetalsClient, k):
            setattr(c, k, v)
    c.updated_at = datetime.now(timezone.utc)
    c.updated_by = user.id
    db.commit()
    return {"status": "ok"}


@router.delete("/{client_id}")
def delete_metals_client(
    client_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin")),
):
    c = _get_metals_client(db, client_id)
    if not c:
        return {"status": "ok"}
    c.deleted_at = datetime.now(timezone.utc)
    c.deleted_by_id = user.id
    db.commit()
    return {"status": "ok"}


@router.post("/{client_id}/restore")
def restore_metals_client(
    client_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _=Depends(require_permissions("metals:customers:write")),
):
    if not can_write_metals_customers(user):
        raise HTTPException(status_code=403, detail="Forbidden")
    c = _get_metals_client(db, client_id, include_deleted=True)
    if getattr(c, "deleted_at", None) is None:
        return {"status": "ok", "message": "Client is not deleted"}
    c.deleted_at = None
    c.deleted_by_id = None
    db.commit()
    return {"status": "ok", "message": "Client restored"}


# ----- Contacts -----


@router.post("/{client_id}/contacts", response_model=ClientContactResponse)
def add_metals_contact(
    client_id: str,
    payload: ClientContactCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    assert_metals_customer_tab(user, "contacts", "write")
    client_uuid = _parse_client_uuid(client_id)
    _get_metals_client(db, client_id)
    contact = MetalsClientContact(client_id=client_uuid, **payload.dict(exclude_unset=True))
    db.add(contact)
    db.commit()
    db.refresh(contact)
    return contact


@router.get("/{client_id}/contacts", response_model=List[ClientContactResponse])
def list_metals_contacts(
    client_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _assert_metals_tab_read(user, "contacts", allow_quote=True)
    _get_metals_client(db, client_id)
    return (
        db.query(MetalsClientContact)
        .filter(MetalsClientContact.client_id == client_id)
        .order_by(MetalsClientContact.sort_index.asc())
        .all()
    )


@router.patch("/{client_id}/contacts/{contact_id}")
def update_metals_contact(
    client_id: str,
    contact_id: str,
    payload: dict,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    assert_metals_customer_tab(user, "contacts", "write")
    c = (
        db.query(MetalsClientContact)
        .filter(MetalsClientContact.id == contact_id, MetalsClientContact.client_id == client_id)
        .first()
    )
    if not c:
        raise HTTPException(status_code=404, detail="Not found")
    payload = sanitize_orm_patch(payload)
    for k, v in payload.items():
        setattr(c, k, v)
    db.commit()
    return {"status": "ok"}


@router.delete("/{client_id}/contacts/{contact_id}")
def delete_metals_contact(
    client_id: str,
    contact_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    assert_metals_customer_tab(user, "contacts", "write")
    c = (
        db.query(MetalsClientContact)
        .filter(MetalsClientContact.id == contact_id, MetalsClientContact.client_id == client_id)
        .first()
    )
    if not c:
        return {"status": "ok"}
    db.delete(c)
    db.commit()
    return {"status": "ok"}


@router.post("/{client_id}/contacts/reorder")
def reorder_metals_contacts(
    client_id: str,
    order: list[str],
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    assert_metals_customer_tab(user, "contacts", "write")
    _get_metals_client(db, client_id)
    contacts = db.query(MetalsClientContact).filter(MetalsClientContact.client_id == client_id).all()
    index = {cid: i for i, cid in enumerate(order)}
    for c in contacts:
        c.sort_index = index.get(str(c.id), c.sort_index)
    db.commit()
    return {"status": "ok"}


# ----- Sites -----


@router.get("/{client_id}/sites", response_model=List[ClientSiteResponse])
def list_metals_sites(
    client_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _assert_metals_tab_read(user, "sites")
    _get_metals_client(db, client_id)
    return (
        db.query(MetalsClientSite)
        .filter(MetalsClientSite.client_id == client_id)
        .order_by(MetalsClientSite.sort_index.asc())
        .all()
    )


@router.post("/{client_id}/sites", response_model=ClientSiteResponse)
def create_metals_site(
    client_id: str,
    payload: ClientSiteCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    assert_metals_customer_tab(user, "sites", "write")
    _get_metals_client(db, client_id)
    row = MetalsClientSite(client_id=client_id, **payload.dict(exclude_unset=True))
    db.add(row)
    db.commit()
    db.refresh(row)
    try:
        name = (row.site_name or row.site_address_line1 or str(row.id) or "site").strip()
        if name:
            exists = (
                db.query(MetalsClientFolder)
                .filter(
                    MetalsClientFolder.client_id == client_id,
                    MetalsClientFolder.name == name,
                    MetalsClientFolder.parent_id.is_(None),
                )
                .first()
            )
            if not exists:
                db.add(MetalsClientFolder(client_id=client_id, name=name))
                db.commit()
    except Exception:
        db.rollback()
    return row


@router.patch("/{client_id}/sites/{site_id}")
def update_metals_site(
    client_id: str,
    site_id: str,
    payload: dict,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    assert_metals_customer_tab(user, "sites", "write")
    row = (
        db.query(MetalsClientSite)
        .filter(MetalsClientSite.id == site_id, MetalsClientSite.client_id == client_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Not found")
    payload = sanitize_orm_patch(payload)
    for k, v in payload.items():
        setattr(row, k, v)
    db.commit()
    return {"status": "ok"}


@router.delete("/{client_id}/sites/{site_id}")
def delete_metals_site(
    client_id: str,
    site_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    assert_metals_customer_tab(user, "sites", "write")
    row = (
        db.query(MetalsClientSite)
        .filter(MetalsClientSite.id == site_id, MetalsClientSite.client_id == client_id)
        .first()
    )
    if not row:
        return {"status": "ok"}
    db.delete(row)
    db.commit()
    return {"status": "ok"}


# ----- Files -----


@router.get("/{client_id}/files")
def list_metals_files(
    client_id: str,
    site_id: Optional[str] = None,
    category: Optional[str] = None,
    limit: Optional[int] = None,
    offset: Optional[int] = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _assert_metals_tab_read(user, "files", allow_quote=True)
    _get_metals_client(db, client_id)
    q = db.query(MetalsClientFile).filter(
        MetalsClientFile.client_id == client_id,
        MetalsClientFile.deleted_at.is_(None),
    )
    if site_id:
        q = q.filter(MetalsClientFile.site_id == site_id)
    if category:
        q = q.filter(MetalsClientFile.category == category)
    q = q.order_by(MetalsClientFile.uploaded_at.desc())
    if offset is not None and offset >= 0:
        q = q.offset(int(offset))
    if limit is not None and limit > 0:
        q = q.limit(int(limit))
    out = [_serialize_metals_file_row(db, cf, client_id) for cf in q.all()]
    try:
        out.sort(key=lambda x: (int(x.get("sort_index") or 0), x.get("uploaded_at") or ""))
        out.sort(key=lambda x: x.get("uploaded_at") or "", reverse=True)
    except Exception:
        pass
    return out


@router.get("/{client_id}/files/deleted")
def list_deleted_metals_files(
    client_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin")),
):
    _get_metals_client(db, client_id)
    rows = (
        db.query(MetalsClientFile)
        .filter(MetalsClientFile.client_id == client_id, MetalsClientFile.deleted_at.isnot(None))
        .order_by(MetalsClientFile.deleted_at.desc())
        .all()
    )
    out = []
    for cf in rows:
        fo = db.query(FileObject).filter(FileObject.id == cf.file_object_id).first()
        ct = getattr(fo, "content_type", None) if fo else None
        name = cf.original_name or cf.key or ""
        out.append(
            {
                "id": str(cf.id),
                "file_object_id": str(cf.file_object_id),
                "category": cf.category,
                "key": cf.key,
                "original_name": cf.original_name,
                "site_id": str(cf.site_id) if getattr(cf, "site_id", None) else None,
                "uploaded_at": cf.uploaded_at.isoformat() if cf.uploaded_at else None,
                "deleted_at": cf.deleted_at.isoformat() if cf.deleted_at else None,
                "deleted_by_id": str(cf.deleted_by_id) if getattr(cf, "deleted_by_id", None) else None,
                "content_type": ct,
                "is_image": _file_is_image(name, ct),
            }
        )
    return out


@router.put("/{client_id}/files/{client_file_id}")
def update_metals_client_file(
    client_id: str,
    client_file_id: str,
    payload: dict,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    assert_metals_customer_tab(user, "files", "write")
    try:
        fuid = uuid.UUID(str(client_file_id))
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid file id")
    row = (
        db.query(MetalsClientFile)
        .filter(MetalsClientFile.id == fuid, MetalsClientFile.client_id == client_id)
        .first()
    )
    if not row or row.deleted_at is not None:
        raise HTTPException(status_code=404, detail="File not found")
    if "category" in payload:
        row.category = payload["category"]
    if "original_name" in payload:
        row.original_name = payload["original_name"]
    if "folder_id" in payload:
        fid = payload.get("folder_id")
        row.folder_id = uuid.UUID(str(fid)) if fid else None
    if "customer_visible" in payload:
        row.customer_visible = bool(payload["customer_visible"])
    if "notes" in payload:
        row.notes = payload["notes"]
    db.commit()
    return {"status": "ok"}


@router.delete("/{client_id}/files/{client_file_id}")
def delete_metals_client_file(
    client_id: str,
    client_file_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    assert_metals_customer_tab(user, "files", "write")
    try:
        fid = uuid.UUID(str(client_file_id))
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid file id")
    row = (
        db.query(MetalsClientFile)
        .filter(MetalsClientFile.id == fid, MetalsClientFile.client_id == client_id)
        .first()
    )
    if not row or row.deleted_at is not None:
        return {"status": "ok"}
    row.deleted_at = datetime.now(timezone.utc)
    row.deleted_by_id = user.id
    db.commit()
    return {"status": "ok"}


@router.post("/{client_id}/files/deleted/{file_id}/restore")
def restore_deleted_metals_file(
    client_id: str,
    file_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin")),
):
    _get_metals_client(db, client_id)
    try:
        fid = uuid.UUID(str(file_id))
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid file id")
    cf = (
        db.query(MetalsClientFile)
        .filter(MetalsClientFile.id == fid, MetalsClientFile.client_id == client_id)
        .first()
    )
    if not cf or cf.deleted_at is None:
        raise HTTPException(status_code=404, detail="Deleted file not found")
    cf.deleted_at = None
    cf.deleted_by_id = None
    db.commit()
    return {"status": "ok", "id": str(cf.id)}


@router.delete("/{client_id}/files/deleted/{file_id}")
def permanently_delete_metals_file(
    client_id: str,
    file_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin")),
):
    _get_metals_client(db, client_id)
    try:
        fid = uuid.UUID(str(file_id))
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid file id")
    cf = (
        db.query(MetalsClientFile)
        .filter(MetalsClientFile.id == fid, MetalsClientFile.client_id == client_id)
        .first()
    )
    if not cf or cf.deleted_at is None:
        raise HTTPException(status_code=404, detail="Deleted file not found")
    fo_id = cf.file_object_id
    db.delete(cf)
    db.flush()
    _try_remove_orphan_file_object(db, fo_id)
    db.commit()
    return {"status": "ok"}


@router.post("/{client_id}/files/reorder")
def reorder_metals_files(
    client_id: str,
    order: list[str],
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    assert_metals_customer_tab(user, "files", "write")
    _get_metals_client(db, client_id)
    cfiles = (
        db.query(MetalsClientFile)
        .filter(MetalsClientFile.client_id == client_id, MetalsClientFile.deleted_at.is_(None))
        .all()
    )
    index = {str(cid): i for i, cid in enumerate(order or [])}
    for cf in cfiles:
        idx = index.get(str(cf.id))
        if idx is None:
            continue
        fo = db.query(FileObject).filter(FileObject.id == cf.file_object_id).first()
        if not fo:
            continue
        tags = dict(getattr(fo, "tags", None) or {})
        client_sort = dict(tags.get("client_sort") or {})
        client_sort[str(client_id)] = int(idx)
        tags["client_sort"] = client_sort
        fo.tags = tags
    db.commit()
    return {"status": "ok"}


@router.post("/{client_id}/files")
def attach_metals_file(
    client_id: str,
    file_object_id: str,
    category: Optional[str] = None,
    original_name: Optional[str] = None,
    site_id: Optional[str] = None,
    folder_id: Optional[str] = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    assert_metals_customer_tab(user, "files", "write")
    _get_metals_client(db, client_id)
    fo = db.query(FileObject).filter(FileObject.id == file_object_id).first()
    if not fo:
        raise HTTPException(status_code=404, detail="File not found")
    site_uuid = None
    if site_id:
        try:
            site_uuid = uuid.UUID(str(site_id))
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid site id")
    folder_uuid = None
    if folder_id:
        try:
            folder_uuid = uuid.UUID(str(folder_id))
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid folder id")
    row = MetalsClientFile(
        client_id=client_id,
        site_id=site_uuid,
        folder_id=folder_uuid,
        file_object_id=fo.id,
        category=category,
        key=fo.key,
        original_name=original_name,
        uploaded_by=user.id,
    )
    db.add(row)
    db.commit()
    return {"id": str(row.id)}


# ----- Folders -----


@router.get("/{client_id}/folders")
def list_metals_folders(
    client_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _assert_metals_tab_read(user, "files")
    _get_metals_client(db, client_id)
    rows = (
        db.query(MetalsClientFolder)
        .filter(MetalsClientFolder.client_id == client_id)
        .order_by(MetalsClientFolder.sort_index.asc(), MetalsClientFolder.name.asc())
        .all()
    )
    return [
        {
            "id": str(f.id),
            "name": f.name,
            "parent_id": str(f.parent_id) if getattr(f, "parent_id", None) else None,
            "sort_index": f.sort_index,
        }
        for f in rows
    ]


@router.post("/{client_id}/folders")
def create_metals_folder(
    client_id: str,
    name: str = Body(...),
    parent_id: Optional[str] = Body(None),
    create_default_subfolders: bool = Body(False),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    assert_metals_customer_tab(user, "files", "write")
    _get_metals_client(db, client_id)
    pid = None
    if parent_id:
        try:
            pid = uuid.UUID(str(parent_id))
        except ValueError:
            pid = None
    f = MetalsClientFolder(client_id=client_id, name=(name or "").strip(), parent_id=pid, created_by=user.id)
    if not f.name:
        raise HTTPException(status_code=400, detail="Folder name required")
    db.add(f)
    db.commit()
    db.refresh(f)
    if create_default_subfolders:
        try:
            create_default_folders_for_metals_client(db, client_id, f.id)
        except Exception:
            pass
    return {"id": str(f.id)}


@router.post("/{client_id}/folders/initialize-defaults")
def initialize_metals_default_folders(
    client_id: str,
    parent_folder_id: Optional[str] = Body(None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    assert_metals_customer_tab(user, "files", "write")
    _get_metals_client(db, client_id)
    parent_id = None
    if parent_folder_id:
        try:
            parent_id = uuid.UUID(str(parent_folder_id))
        except ValueError:
            parent_id = None
    created = create_default_folders_for_metals_client(db, client_id, parent_id)
    return {
        "status": "ok",
        "created_count": len(created),
        "folders": [{"id": str(f.id), "name": f.name} for f in created],
    }


@router.put("/{client_id}/folders/{folder_id}")
def update_metals_folder(
    client_id: str,
    folder_id: str,
    name: Optional[str] = Body(None),
    parent_id: Optional[str] = Body(None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    assert_metals_customer_tab(user, "files", "write")
    try:
        fid = uuid.UUID(str(folder_id))
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid folder")
    f = (
        db.query(MetalsClientFolder)
        .filter(MetalsClientFolder.client_id == client_id, MetalsClientFolder.id == fid)
        .first()
    )
    if not f:
        raise HTTPException(status_code=404, detail="Not found")
    if name is not None:
        f.name = (name or "").strip()
        if not f.name:
            raise HTTPException(status_code=400, detail="Folder name required")
    if parent_id is not None:
        try:
            f.parent_id = uuid.UUID(str(parent_id)) if parent_id else None
        except ValueError:
            f.parent_id = None
    db.commit()
    return {"status": "ok"}


@router.delete("/{client_id}/folders/{folder_id}")
def delete_metals_folder(
    client_id: str,
    folder_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    assert_metals_customer_tab(user, "files", "write")
    try:
        fid = uuid.UUID(str(folder_id))
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid folder")
    tag = f"folder:{folder_id}"
    has_docs = (
        db.query(MetalsClientDocument)
        .filter(MetalsClientDocument.client_id == client_id, MetalsClientDocument.doc_type == tag)
        .first()
    )
    if has_docs:
        raise HTTPException(status_code=400, detail="Folder not empty")
    db.query(MetalsClientFolder).filter(
        MetalsClientFolder.client_id == client_id,
        MetalsClientFolder.id == fid,
    ).delete()
    db.commit()
    return {"status": "ok"}


# ----- Documents -----


@router.get("/{client_id}/documents")
def list_metals_documents(
    client_id: str,
    folder_id: Optional[str] = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _assert_metals_tab_read(user, "files")
    _get_metals_client(db, client_id)
    q = db.query(MetalsClientDocument).filter(
        MetalsClientDocument.client_id == client_id,
        MetalsClientDocument.deleted_at.is_(None),
    )
    if folder_id:
        q = q.filter(MetalsClientDocument.doc_type == f"folder:{folder_id}")
    rows = q.order_by(MetalsClientDocument.created_at.desc()).all()
    out = []
    for d in rows:
        fid = None
        if (d.doc_type or "").startswith("folder:"):
            try:
                fid = d.doc_type.split(":", 1)[1]
            except Exception:
                fid = None
        out.append(
            {
                "id": str(d.id),
                "folder_id": fid,
                "title": d.title,
                "notes": d.notes,
                "file_id": str(d.file_id) if getattr(d, "file_id", None) else None,
                "created_at": d.created_at.isoformat() if getattr(d, "created_at", None) else None,
            }
        )
    return out


@router.post("/{client_id}/documents")
def create_metals_document(
    client_id: str,
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    assert_metals_customer_tab(user, "files", "write")
    _get_metals_client(db, client_id)
    folder_id = payload.get("folder_id")
    d = MetalsClientDocument(
        client_id=client_id,
        doc_type=(f"folder:{folder_id}" if folder_id else (payload.get("doc_type") or "other")),
        title=payload.get("title"),
        notes=payload.get("notes"),
        file_id=payload.get("file_id"),
        created_by=user.id,
    )
    db.add(d)
    db.commit()
    return {"id": str(d.id)}


@router.put("/{client_id}/documents/{doc_id}")
def update_metals_document(
    client_id: str,
    doc_id: str,
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    assert_metals_customer_tab(user, "files", "write")
    d = (
        db.query(MetalsClientDocument)
        .filter(MetalsClientDocument.client_id == client_id, MetalsClientDocument.id == doc_id)
        .first()
    )
    if not d:
        raise HTTPException(status_code=404, detail="Not found")
    if "folder_id" in payload:
        fid = payload.get("folder_id")
        d.doc_type = f"folder:{fid}" if fid else (d.doc_type or None)
    if "title" in payload:
        d.title = payload.get("title")
    if "notes" in payload:
        d.notes = payload.get("notes")
    d.updated_at = datetime.now(timezone.utc)
    d.updated_by = user.id
    db.commit()
    return {"status": "ok"}


@router.delete("/{client_id}/documents/{doc_id}")
def delete_metals_document(
    client_id: str,
    doc_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    assert_metals_customer_tab(user, "files", "write")
    d = (
        db.query(MetalsClientDocument)
        .filter(MetalsClientDocument.client_id == client_id, MetalsClientDocument.id == doc_id)
        .first()
    )
    if not d:
        return {"status": "ok"}
    d.deleted_at = datetime.now(timezone.utc)
    d.deleted_by = user.id
    db.commit()
    return {"status": "ok"}


# ----- Notes -----


@router.get("/{client_id}/notes")
def list_metals_notes(
    client_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _assert_metals_tab_read(user, "notes")
    _get_metals_client(db, client_id)
    rows = (
        db.query(MetalsClientNote)
        .filter(MetalsClientNote.client_id == client_id)
        .order_by(MetalsClientNote.created_at.desc())
        .all()
    )
    names_by_id = resolve_user_display_names(db, [getattr(r, "created_by", None) for r in rows])
    return [
        serialize_client_note(r, names_by_id=names_by_id, include_project_fields=False)
        for r in rows
    ]


@router.post("/{client_id}/notes")
def create_metals_note(
    client_id: str,
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    assert_metals_customer_tab(user, "notes", "write")
    _get_metals_client(db, client_id)
    row = MetalsClientNote(
        client_id=client_id,
        title=payload.get("title"),
        category_id=payload.get("category_id"),
        description=payload.get("description"),
        images=payload.get("images"),
        status=payload.get("status"),
        created_by=user.id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return {"id": str(row.id), "source": "client_note"}


@router.patch("/{client_id}/notes/{note_id}")
def update_metals_note(
    client_id: str,
    note_id: str,
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    assert_metals_customer_tab(user, "notes", "write")
    _get_metals_client(db, client_id)
    row = (
        db.query(MetalsClientNote)
        .filter(MetalsClientNote.id == note_id, MetalsClientNote.client_id == client_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Not found")
    if "title" in payload:
        row.title = payload.get("title")
    if "category_id" in payload:
        row.category_id = payload.get("category_id")
    if "description" in payload:
        row.description = payload.get("description")
    if "status" in payload:
        row.status = payload.get("status")
    if "images" in payload:
        incoming = payload.get("images")
        if isinstance(incoming, dict):
            existing = row.images if isinstance(row.images, dict) else {}
            row.images = {**(existing or {}), **incoming}
        else:
            row.images = incoming
    row.updated_at = datetime.now(timezone.utc)
    row.updated_by = user.id
    db.commit()
    return {"id": str(row.id), "source": "client_note"}


@router.delete("/{client_id}/notes/{note_id}")
def delete_metals_note(
    client_id: str,
    note_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    assert_metals_customer_tab(user, "notes", "write")
    _get_metals_client(db, client_id)
    row = (
        db.query(MetalsClientNote)
        .filter(MetalsClientNote.id == note_id, MetalsClientNote.client_id == client_id)
        .first()
    )
    if not row:
        return {"status": "ok"}
    db.delete(row)
    db.commit()
    return {"status": "ok"}
