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
from ..models.models import FileObject, ProposalDraft, Proposal
from ..auth.security import get_current_user
from sqlalchemy.orm import Session
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


router = APIRouter(prefix="/proposals", tags=["proposals"])


# Serve proposal assets (logo, templates, etc.)
@router.get("/assets/{filename:path}")
def serve_proposal_asset(filename: str):
    """Serve static assets for proposals (logo, templates, etc.)"""
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


UPLOAD_DIR = "var/uploads/proposals"
os.makedirs(UPLOAD_DIR, exist_ok=True)


@router.post("/generate")
async def generate_proposal(
    request: Request,
    cover_title: str = Form("Proposal"),
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
    output_path = os.path.join(UPLOAD_DIR, f"proposal_{file_id}.pdf")

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

    proposal_data = {
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
    }

    await generate_pdf(proposal_data, output_path)

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

    return FileResponse(output_path, media_type="application/pdf", filename="ProjectProposal.pdf")


# ---------- Drafts ----------
@router.post("/drafts")
def create_or_update_draft(body: dict = Body(None), db: Session = Depends(get_db), user=Depends(get_current_user)):
    if body is None:
        body = {}
    draft_id = body.get('id')
    if draft_id:
        d = db.query(ProposalDraft).filter(ProposalDraft.id == draft_id).first()
        if not d:
            raise HTTPException(status_code=404, detail='Draft not found')
    else:
        d = ProposalDraft()
        db.add(d)
    d.client_id = body.get('client_id')
    d.site_id = body.get('site_id')
    d.user_id = getattr(user, 'id', None)
    d.title = body.get('title') or 'Untitled'
    d.data = body.get('data') or {}
    from datetime import datetime
    d.updated_at = datetime.utcnow()
    db.commit()
    return {"id": str(d.id), "updated_at": d.updated_at.isoformat()}


@router.get("/drafts/{draft_id}")
def get_draft(draft_id: str, db: Session = Depends(get_db)):
    d = db.query(ProposalDraft).filter(ProposalDraft.id == draft_id).first()
    if not d:
        raise HTTPException(status_code=404, detail='Not found')
    return {
        "id": str(d.id),
        "client_id": str(d.client_id) if d.client_id else None,
        "site_id": str(d.site_id) if d.site_id else None,
        "title": d.title,
        "data": d.data or {},
        "updated_at": d.updated_at.isoformat() if d.updated_at else None,
    }


@router.get("/drafts")
def list_drafts(client_id: str | None = None, site_id: str | None = None, db: Session = Depends(get_db), user=Depends(get_current_user)):
    q = db.query(ProposalDraft)
    if client_id:
        q = q.filter(ProposalDraft.client_id == client_id)
    if site_id:
        q = q.filter(ProposalDraft.site_id == site_id)
    if getattr(user, 'id', None):
        q = q.filter(ProposalDraft.user_id == user.id)
    rows = q.order_by(ProposalDraft.updated_at.desc()).limit(50).all()
    return [{"id": str(d.id), "title": d.title, "updated_at": d.updated_at.isoformat() if d.updated_at else None} for d in rows]


@router.delete("/drafts/{draft_id}")
def delete_draft(draft_id: str, db: Session = Depends(get_db), user=Depends(get_current_user)):
    d = db.query(ProposalDraft).filter(ProposalDraft.id == draft_id).first()
    if not d:
        return {"status":"ok"}
    db.delete(d)
    db.commit()
    return {"status":"ok"}


@router.get("/next-code")
def next_code(client_id: str, db: Session = Depends(get_db)):
    try:
        import uuid as _uuid
        u = _uuid.UUID(str(client_id))
        base = int.from_bytes(u.bytes[:2], byteorder='big') % 10000
    except Exception:
        base = 0
    # Next sequence per client based on persisted proposals count
    from datetime import datetime
    seq = (db.query(Proposal).filter(Proposal.client_id == client_id).count() or 0) + 1
    yy = int(datetime.utcnow().strftime("%y"))
    # Note: UI/PDF will render with the MK- prefix; here we return the internal code
    return {"order_number": f"{base:04d}-{seq:03d}-{yy:02d}"}


@router.post("")
def save_proposal(payload: dict = Body(...), db: Session = Depends(get_db)):
    pid = payload.get('id')
    title = payload.get('cover_title') or payload.get('title') or 'Proposal'
    if pid:
        p = db.query(Proposal).filter(Proposal.id == pid).first()
        if not p:
            raise HTTPException(status_code=404, detail='Proposal not found')
        # Allow updating scope relations
        p.project_id = payload.get('project_id') or p.project_id
        p.client_id = payload.get('client_id') or p.client_id
        p.site_id = payload.get('site_id') or p.site_id
        p.order_number = payload.get('order_number') or p.order_number
        p.title = title
        # Store only serializable snapshot; avoid mutable references
        try:
            import copy as _copy
            p.data = _copy.deepcopy(payload)
        except Exception:
            p.data = payload
        db.commit()
        return {"id": str(p.id)}
    else:
        p = Proposal(
            project_id=payload.get('project_id'),
            client_id=payload.get('client_id'),
            site_id=payload.get('site_id'),
            order_number=payload.get('order_number'),
            title=title,
            data=payload,
        )
        db.add(p)
        db.commit()
        return {"id": str(p.id)}


@router.get("")
def list_proposals(client_id: Optional[str] = Query(None), site_id: Optional[str] = Query(None), project_id: Optional[str] = Query(None), db: Session = Depends(get_db)):
    q = db.query(Proposal)
    if project_id:
        q = q.filter(Proposal.project_id == project_id)
    if client_id:
        q = q.filter(Proposal.client_id == client_id)
    if site_id:
        q = q.filter(Proposal.site_id == site_id)
    rows = q.order_by(Proposal.created_at.desc()).limit(100).all()
    return [{
        "id": str(r.id),
        "project_id": str(r.project_id) if getattr(r, 'project_id', None) else None,
        "client_id": str(r.client_id) if r.client_id else None,
        "site_id": str(r.site_id) if r.site_id else None,
        "order_number": r.order_number,
        "title": r.title,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    } for r in rows]


@router.get("/{proposal_id}")
def get_proposal(proposal_id: str, db: Session = Depends(get_db)):
    p = db.query(Proposal).filter(Proposal.id == proposal_id).first()
    if not p:
        raise HTTPException(status_code=404, detail='Not found')
    return {
        "id": str(p.id),
        "project_id": str(p.project_id) if getattr(p, 'project_id', None) else None,
        "client_id": str(p.client_id) if p.client_id else None,
        "site_id": str(p.site_id) if p.site_id else None,
        "order_number": p.order_number,
        "title": p.title,
        "data": p.data or {},
        "created_at": p.created_at.isoformat() if p.created_at else None,
    }


@router.delete("/{proposal_id}")
def delete_proposal(proposal_id: str, db: Session = Depends(get_db)):
    p = db.query(Proposal).filter(Proposal.id == proposal_id).first()
    if not p:
        raise HTTPException(status_code=404, detail='Proposal not found')
    db.delete(p)
    db.commit()
    return {"status": "ok"}


