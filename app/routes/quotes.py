import os
import uuid
import shutil
import json
import mimetypes
from typing import Optional

from fastapi import APIRouter, UploadFile, Form, Request, Depends, HTTPException, Body, Query
from fastapi.responses import FileResponse

from ..config import settings
from ..logging import RequestIdMiddleware
from ..db import get_db
from ..models.models import FileObject, Quote, Client
from ..auth.security import get_current_user
from sqlalchemy.orm import Session
from sqlalchemy import or_, cast, String, Date, func
import uuid
from ..storage.provider import StorageProvider
from ..storage.blob_provider import BlobStorageProvider
from ..storage.hybrid_provider import HybridStorageProvider
from ..storage.provider import StorageProvider
from ..models import models
from ..schemas import files as file_schemas

from ..proposals.pdf_merge import generate_pdf
import httpx
from PIL import Image as PILImage
try:
    from pillow_heif import register_heif_opener
    register_heif_opener()
except Exception:
    pass


router = APIRouter(prefix="/quotes", tags=["quotes"])


# Serve quote assets (logo, templates, etc.) - reuse proposal assets
@router.get("/assets/{filename:path}")
def serve_quote_asset(filename: str):
    """Serve static assets for quotes (logo, templates, etc.)"""
    assets_dir = os.path.join("app", "proposals", "assets")
    file_path = os.path.join(assets_dir, filename)
    
    # Security: prevent directory traversal
    if not os.path.abspath(file_path).startswith(os.path.abspath(assets_dir)):
        raise HTTPException(status_code=403, detail="Forbidden")
    
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")
    
    # Determine content type
    content_type, _ = mimetypes.guess_type(file_path)
    if not content_type:
        content_type = "application/octet-stream"
    
    return FileResponse(file_path, media_type=content_type)


UPLOAD_DIR = "var/uploads/quotes"
os.makedirs(UPLOAD_DIR, exist_ok=True)


@router.post("/generate")
async def generate_quote(
    request: Request,
    cover_title: str = Form("Quote"),
    template_style: str = Form("Mack Kirk"),
    order_number: str = Form(""),
    company_name: str = Form(""),
    company_address: str = Form(""),
    date: str = Form(""),
    project_name_description: str = Form(""),
    project_name: str = Form(""),
    site_address: str = Form(""),
    client_name: str = Form(""),
    proposal_created_for: str = Form(""),
    primary_contact_name: str = Form(""),
    primary_contact_phone: str = Form(""),
    primary_contact_email: str = Form(""),
    type_of_project: str = Form(""),
    other_notes: str = Form(""),
    project_description: str = Form(""),
    additional_project_notes: str = Form(""),
    bid_price: float = Form(0.0),
    total: float = Form(0.0),
    show_total_in_pdf: str = Form("true"),
    show_pst_in_pdf: str = Form("true"),
    show_gst_in_pdf: str = Form("true"),
    pst_value: float = Form(0.0),
    gst_value: float = Form(0.0),
    estimate_total_estimate: float = Form(0.0),
    pricing_type: str = Form("pricing"),
    terms_text: str = Form(""),
    additional_costs: str = Form("[]"),
    optional_services: str = Form("[]"),
    cover_image: UploadFile = None,
    page2_image: UploadFile = None,
    sections: str = Form("[]"),
    cover_file_object_id: Optional[str] = Form(None),
    page2_file_object_id: Optional[str] = Form(None),
    db: Session = Depends(get_db),
):
    file_id = str(uuid.uuid4())
    output_path = os.path.join(UPLOAD_DIR, f"quote_{file_id}.pdf")

    cover_path, page2_path = None, None

    if cover_image and getattr(cover_image, "filename", ""):
        # Normalize to PNG using PIL (handles HEIC via pillow-heif)
        tmp_ext = mimetypes.guess_extension(getattr(cover_image, "content_type", "") or "") or ".bin"
        tmp_in = os.path.join(UPLOAD_DIR, f"cover_in_{file_id}{tmp_ext}")
        with open(tmp_in, "wb") as buffer:
            shutil.copyfileobj(cover_image.file, buffer)
        try:
            # Skip empty uploads
            if os.path.getsize(tmp_in) > 0:
                with PILImage.open(tmp_in) as im:
                    im = im.convert("RGB")
                    cover_path = os.path.join(UPLOAD_DIR, f"cover_{file_id}.png")
                    im.save(cover_path, format="PNG", optimize=True)
        except Exception:
            # Ignore invalid image; proceed without cover
            cover_path = None
        finally:
            try:
                if os.path.exists(tmp_in):
                    os.remove(tmp_in)
            except Exception:
                pass

    if page2_image and getattr(page2_image, "filename", ""):
        tmp_ext = mimetypes.guess_extension(getattr(page2_image, "content_type", "") or "") or ".bin"
        tmp_in = os.path.join(UPLOAD_DIR, f"page2_in_{file_id}{tmp_ext}")
        with open(tmp_in, "wb") as buffer:
            shutil.copyfileobj(page2_image.file, buffer)
        try:
            if os.path.getsize(tmp_in) > 0:
                with PILImage.open(tmp_in) as im:
                    im = im.convert("RGB")
                    page2_path = os.path.join(UPLOAD_DIR, f"page2_{file_id}.png")
                    im.save(page2_path, format="PNG", optimize=True)
        except Exception:
            page2_path = None
        finally:
            try:
                if os.path.exists(tmp_in):
                    os.remove(tmp_in)
            except Exception:
                pass

    # If no direct upload, but a file_object_id is provided, download the image from storage
    storage: StorageProvider = BlobStorageProvider()
    async def _download_fileobject_to_tmp(file_object_id: str, prefix: str) -> Optional[str]:
        try:
            fo = db.query(FileObject).filter(FileObject.id == file_object_id).first()
            if not fo:
                return None
            url = storage.get_download_url(fo.key, expires_s=300)
            if not url:
                return None
            # Download original then normalize to PNG
            in_ext = mimetypes.guess_extension(fo.content_type or "") or ".bin"
            tmp_in = os.path.join(UPLOAD_DIR, f"{prefix}_in_{file_id}{in_ext}")
            tmp_path = os.path.join(UPLOAD_DIR, f"{prefix}_{file_id}.png")
            async with httpx.AsyncClient(timeout=30.0) as client:
                async with client.stream("GET", url) as r:
                    r.raise_for_status()
                    with open(tmp_in, "wb") as out:
                        async for chunk in r.aiter_bytes():
                            out.write(chunk)
            # Convert to PNG for consistent downstream handling
            try:
                with PILImage.open(tmp_in) as im:
                    im = im.convert("RGB")
                    im.save(tmp_path, format="PNG", optimize=True)
            finally:
                try:
                    os.remove(tmp_in)
                except Exception:
                    pass
            return tmp_path
        except Exception:
            return None

    if (not cover_path) and cover_file_object_id:
        cover_path = await _download_fileobject_to_tmp(cover_file_object_id, "cover")
    if (not page2_path) and page2_file_object_id:
        page2_path = await _download_fileobject_to_tmp(page2_file_object_id, "page2")

    try:
        parsed_costs = json.loads(additional_costs)
    except Exception:
        parsed_costs = []

    try:
        parsed_optional_services = json.loads(optional_services)
    except Exception:
        parsed_optional_services = []

    try:
        parsed_sections = json.loads(sections)
    except Exception:
        parsed_sections = []

    form_data = await request.form()

    def _is_upload(v):
        return hasattr(v, "file") and hasattr(v, "filename")

    for sec in parsed_sections:
        if sec.get("type") == "images":
            for img in sec.get("images", []):
                # Prefer site-linked file object if present; fallback to uploaded field
                if img.get("file_object_id"):
                    tmp = await _download_fileobject_to_tmp(img["file_object_id"], f"secimg_{uuid.uuid4().hex}")
                    if tmp:
                        img["path"] = tmp
                else:
                    field_name = img.get("file_field")
                    found = None
                    for key, value in form_data.items():
                        if key == field_name and _is_upload(value):
                            found = value
                            break
                    if found:
                        in_ext = mimetypes.guess_extension(getattr(found, "content_type", "") or "") or ".bin"
                        tmp_in = os.path.join(UPLOAD_DIR, f"{field_name}_{uuid.uuid4()}{in_ext}")
                        with open(tmp_in, "wb") as buffer:
                            shutil.copyfileobj(found.file, buffer)
                        try:
                            with PILImage.open(tmp_in) as im:
                                im = im.convert("RGB")
                                tmp_out = os.path.join(UPLOAD_DIR, f"{field_name}_{uuid.uuid4()}.png")
                                im.save(tmp_out, format="PNG", optimize=True)
                                img["path"] = tmp_out
                        finally:
                            try:
                                os.remove(tmp_in)
                            except Exception:
                                pass

    quote_data = {
        "company_name": company_name,
        "company_address": company_address,
        "cover_title": cover_title,
        "template_style": template_style,
        "order_number": order_number,
        "date": date,
        "project_name_description": project_name_description,
        "project_name": project_name,
        "site_address": site_address,
        "client_name": client_name,
        "proposal_created_for": proposal_created_for,
        "primary_contact_name": primary_contact_name,
        "primary_contact_phone": primary_contact_phone,
        "primary_contact_email": primary_contact_email,
        "type_of_project": type_of_project,
        "other_notes": other_notes,
        "project_description": project_description,
        "additional_project_notes": additional_project_notes,
        "bid_price": bid_price,
        "total": total,
        "show_total_in_pdf": show_total_in_pdf.lower() == "true",
        "show_pst_in_pdf": show_pst_in_pdf.lower() == "true",
        "show_gst_in_pdf": show_gst_in_pdf.lower() == "true",
        "pst_value": pst_value,
        "gst_value": gst_value,
        "estimate_total_estimate": estimate_total_estimate,
        "pricing_type": pricing_type,
        "terms_text": terms_text,
        "cover_image": cover_path,
        "page2_image": page2_path,
        "additional_costs": parsed_costs,
        "optional_services": parsed_optional_services,
        "sections": parsed_sections,
        "is_quote": True,  # Flag to identify quotes vs proposals
    }

    await generate_pdf(quote_data, output_path)

    if cover_path and os.path.exists(cover_path):
        try:
            os.remove(cover_path)
        except Exception:
            pass
    if page2_path and os.path.exists(page2_path):
        try:
            os.remove(page2_path)
        except Exception:
            pass

    return FileResponse(output_path, media_type="application/pdf", filename="Quote.pdf")


@router.get("/next-code")
def next_code(client_id: str, db: Session = Depends(get_db)):
    # Get client to retrieve its code
    try:
        client_uuid = uuid.UUID(str(client_id))
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid client_id format")
    
    client = db.query(Client).filter(Client.id == client_uuid).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    if not client.code:
        raise HTTPException(status_code=400, detail="Client must have a code. Please update the client first.")
    
    client_code = client.code  # Should be 5-digit number (00001, 00002, etc.)
    
    from datetime import datetime as _dt
    from sqlalchemy import func
    year = _dt.utcnow().year
    
    # Get sequence number (5 digits: 00001, 00002, etc.) - global sequence like projects
    seq = db.query(func.count(Quote.id)).scalar() or 0
    seq += 1
    
    # Format: MKS-<seq>/<client_code>-<year> (different prefix from projects)
    # Example: MKS-00001/00001-2025
    code = f"MKS-{seq:05d}/{client_code}-{year}"
    
    # Ensure uniqueness
    while db.query(Quote).filter(Quote.code == code).first():
        seq += 1
        code = f"MKS-{seq:05d}/{client_code}-{year}"
    
    return {"order_number": code}


@router.post("")
def save_quote(payload: dict = Body(...), db: Session = Depends(get_db), user=Depends(get_current_user)):
    pid = payload.get('id')
    title = payload.get('cover_title') or payload.get('title') or 'Quotation'
    client_id = payload.get('client_id')
    if not client_id:
        raise HTTPException(status_code=400, detail='client_id is required')
    
    # Auto-generate code if not provided (same format as projects)
    if not payload.get('code'):
        try:
            client_uuid = uuid.UUID(str(client_id))
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid client_id format")
        
        client = db.query(Client).filter(Client.id == client_uuid).first()
        if not client:
            raise HTTPException(status_code=404, detail="Client not found")
        
        if not client.code:
            raise HTTPException(status_code=400, detail="Client must have a code. Please update the client first.")
        
        client_code = client.code  # Should be 5-digit number (00001, 00002, etc.)
        
        from datetime import datetime as _dt
        from sqlalchemy import func
        year = _dt.utcnow().year
        
        # Get sequence number (5 digits: 00001, 00002, etc.) - global sequence like projects
        seq = db.query(func.count(Quote.id)).scalar() or 0
        seq += 1
        
        # Format: MKS-<seq>/<client_code>-<year> (different prefix from projects)
        # Example: MKS-00001/00001-2025
        code = f"MKS-{seq:05d}/{client_code}-{year}"
        
        # Ensure uniqueness
        while db.query(Quote).filter(Quote.code == code).first():
            seq += 1
            code = f"MKS-{seq:05d}/{client_code}-{year}"
        
        payload['code'] = code
        if not payload.get('order_number'):
            payload['order_number'] = code
    
    if pid:
        q = db.query(Quote).filter(Quote.id == pid).first()
        if not q:
            raise HTTPException(status_code=404, detail='Quote not found')
        q.client_id = payload.get('client_id') or q.client_id
        q.code = payload.get('code') or q.code
        q.name = payload.get('name') or q.name
        q.estimator_id = getattr(user, 'id', None) if not payload.get('estimator_id') else payload.get('estimator_id')
        q.project_division_ids = payload.get('project_division_ids') or q.project_division_ids
        q.order_number = payload.get('order_number') or q.order_number
        q.title = title
        # Store only serializable snapshot; avoid mutable references
        try:
            import copy as _copy
            q.data = _copy.deepcopy(payload)
        except Exception:
            q.data = payload
        from datetime import datetime
        q.updated_at = datetime.utcnow()
        db.commit()
        return {"id": str(q.id)}
    else:
        # Ensure data has cover_title set to 'Quotation' by default if not provided
        quote_data = dict(payload) if payload else {}
        if 'cover_title' not in quote_data:
            quote_data['cover_title'] = title  # Use the title we determined (defaults to 'Quotation')
        
        q = Quote(
            client_id=client_id,
            code=payload.get('code'),
            name=payload.get('name'),
            estimator_id=getattr(user, 'id', None),  # Auto-set to current user
            project_division_ids=payload.get('project_division_ids'),
            order_number=payload.get('order_number') or payload.get('code'),
            title=title,
            data=quote_data,
        )
        db.add(q)
        db.commit()
        return {"id": str(q.id)}


@router.get("")
def list_quotes(
    client_id: Optional[str] = Query(None),
    division_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    min_value: Optional[str] = Query(None),
    q: Optional[str] = Query(None),
    date_start: Optional[str] = Query(None),
    date_end: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    from ..models.models import Client
    from sqlalchemy import or_, cast, String, Date, func
    
    query = db.query(Quote)
    
    if client_id:
        try:
            client_uuid = uuid.UUID(client_id)
            query = query.filter(Quote.client_id == client_uuid)
        except ValueError:
            pass
    
    # Filter by project division
    if division_id:
        try:
            div_uuid = uuid.UUID(division_id)
            query = query.filter(
                cast(Quote.project_division_ids, String).like(f'%{division_id}%')
            )
        except ValueError:
            pass
    
    # Filter by date range
    if date_start:
        try:
            from datetime import datetime
            start_d = datetime.strptime(date_start, "%Y-%m-%d").date()
            effective_start_dt = func.coalesce(Quote.created_at, Quote.updated_at)
            query = query.filter(cast(effective_start_dt, Date) >= start_d)
        except Exception:
            pass

    if date_end:
        try:
            from datetime import datetime
            end_d = datetime.strptime(date_end, "%Y-%m-%d").date()
            effective_start_dt = func.coalesce(Quote.created_at, Quote.updated_at)
            query = query.filter(cast(effective_start_dt, Date) <= end_d)
        except Exception:
            pass
    
    # Search - include client name if client relation exists
    if q:
        query = query.outerjoin(Client, Quote.client_id == Client.id)
        query = query.filter(
            or_(
                Quote.name.ilike(f"%{q}%"),
                Quote.code.ilike(f"%{q}%"),
                Quote.order_number.ilike(f"%{q}%"),
                Client.display_name.ilike(f"%{q}%"),
                Client.name.ilike(f"%{q}%")
            )
        )
    
    rows = query.order_by(Quote.created_at.desc()).limit(500).all()
    
    # Fetch client information in one query
    client_ids = list(set([r.client_id for r in rows if r.client_id]))
    clients_map = {}
    if client_ids:
        clients = db.query(Client).filter(Client.id.in_(client_ids)).all()
        for client in clients:
            clients_map[str(client.id)] = {
                "id": str(client.id),
                "name": client.name,
                "display_name": client.display_name,
            }
    
    result = []
    def _num(v) -> float:
        try:
            if v is None:
                return 0.0
            # Handle strings like "$1,234.56"
            if isinstance(v, str):
                vv = v.replace("$", "").replace(",", "").strip()
                if vv == "":
                    return 0.0
                return float(vv)
            return float(v)
        except Exception:
            return 0.0

    min_value_num = _num(min_value)
    if min_value_num <= 0:
        min_value_num = 0.0

    def _compute_estimated_value(data: dict) -> float:
        """
        Compute the same "Total" shown in QuoteForm -> Pricing (displayTotal / grandTotal).
        Mirrors frontend logic:
          totalNum = sum(additional_costs values) (stored as data.total)
          pst = sum(pst-marked items) * pst_rate/100
          gst = sum(gst-marked items) * gst_rate/100
          grandTotal = totalNum + pst + gst
        """
        if not data:
            return 0.0

        # Prefer explicit display_total if present (newer saves)
        display_total = _num(data.get("display_total"))
        if display_total > 0:
            return display_total

        total_num = _num(data.get("total"))
        pst_rate = _num(data.get("pst_rate"))
        gst_rate = _num(data.get("gst_rate"))

        additional_costs = data.get("additional_costs") or []
        if isinstance(additional_costs, str):
            try:
                import json as _json
                additional_costs = _json.loads(additional_costs) or []
            except Exception:
                additional_costs = []

        if not isinstance(additional_costs, list):
            additional_costs = []

        total_for_pst = 0.0
        total_for_gst = 0.0
        for item in additional_costs:
            if not isinstance(item, dict):
                continue
            val = _num(item.get("value"))
            if item.get("pst") is True:
                total_for_pst += val
            if item.get("gst") is True:
                total_for_gst += val

        pst_val = total_for_pst * (pst_rate / 100.0)
        gst_val = total_for_gst * (gst_rate / 100.0)
        grand_total = total_num + pst_val + gst_val
        if grand_total > 0:
            return grand_total
        return total_num

    for r in rows:
        data = r.data or {}
        # "Document Type" displayed on cover page; stored as cover_title in data
        document_type = (data.get("cover_title") or r.title or "Quotation")
        estimated_value = _compute_estimated_value(data)
        if min_value_num and estimated_value < min_value_num:
            continue

        quote_dict = {
            "id": str(r.id),
            "client_id": str(r.client_id) if r.client_id else None,
            "code": r.code,
            "name": r.name,
            "estimator_id": str(r.estimator_id) if r.estimator_id else None,
            "project_division_ids": r.project_division_ids or [],
            "order_number": r.order_number,
            "title": r.title,
            "document_type": document_type,
            "estimated_value": estimated_value,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "updated_at": r.updated_at.isoformat() if r.updated_at else None,
            "client_name": None,
            "client_display_name": None,
        }
        
        # Add client information if found
        client_id_str = str(r.client_id) if r.client_id else None
        if client_id_str and client_id_str in clients_map:
            client_info = clients_map[client_id_str]
            quote_dict["client_name"] = client_info.get("name")
            quote_dict["client_display_name"] = client_info.get("display_name")
        
        result.append(quote_dict)
    
    return result


@router.get("/{quote_id}")
def get_quote(quote_id: str, db: Session = Depends(get_db)):
    q = db.query(Quote).filter(Quote.id == quote_id).first()
    if not q:
        raise HTTPException(status_code=404, detail='Not found')
    return {
        "id": str(q.id),
        "client_id": str(q.client_id) if q.client_id else None,
        "code": q.code,
        "name": q.name,
        "estimator_id": str(q.estimator_id) if q.estimator_id else None,
        "project_division_ids": q.project_division_ids or [],
        "order_number": q.order_number,
        "title": q.title,
        "data": q.data or {},
        "created_at": q.created_at.isoformat() if q.created_at else None,
        "updated_at": q.updated_at.isoformat() if q.updated_at else None,
    }


@router.patch("/{quote_id}")
def update_quote(quote_id: str, payload: dict = Body(...), db: Session = Depends(get_db), user=Depends(get_current_user)):
    q = db.query(Quote).filter(Quote.id == quote_id).first()
    if not q:
        raise HTTPException(status_code=404, detail='Quote not found')
    
    # Update only provided fields
    if 'name' in payload:
        q.name = payload['name']
    if 'client_id' in payload:
        q.client_id = payload['client_id']
    if 'code' in payload:
        q.code = payload['code']
    if 'project_division_ids' in payload:
        q.project_division_ids = payload['project_division_ids']
    if 'order_number' in payload:
        q.order_number = payload['order_number']
    if 'title' in payload:
        q.title = payload['title']
    if 'estimator_id' in payload:
        q.estimator_id = payload['estimator_id']
    if 'data' in payload:
        try:
            import copy as _copy
            q.data = _copy.deepcopy(payload['data'])
        except Exception:
            q.data = payload['data']
    
    from datetime import datetime
    q.updated_at = datetime.utcnow()
    db.commit()
    return {"id": str(q.id)}


@router.delete("/{quote_id}")
def delete_quote(quote_id: str, db: Session = Depends(get_db)):
    q = db.query(Quote).filter(Quote.id == quote_id).first()
    if not q:
        raise HTTPException(status_code=404, detail='Quote not found')
    db.delete(q)
    db.commit()
    return {"status": "ok"}
