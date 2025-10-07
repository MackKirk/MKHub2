import os
import uuid
import shutil
import json
import mimetypes
from typing import Optional

from fastapi import APIRouter, UploadFile, Form, Request, Depends, HTTPException, Body
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


router = APIRouter(prefix="/proposals", tags=["proposals"])


UPLOAD_DIR = "var/uploads/proposals"
os.makedirs(UPLOAD_DIR, exist_ok=True)


@router.post("/generate")
async def generate_proposal(
    request: Request,
    cover_title: str = Form(...),
    order_number: str = Form(...),
    company_name: str = Form(...),
    company_address: str = Form(...),
    date: str = Form(...),
    project_name_description: str = Form(""),
    proposal_created_for: str = Form(...),
    primary_contact_name: str = Form(...),
    primary_contact_phone: str = Form(...),
    primary_contact_email: str = Form(...),
    type_of_project: str = Form(...),
    other_notes: str = Form(""),
    project_description: str = Form(""),
    additional_project_notes: str = Form(""),
    bid_price: float = Form(...),
    total: float = Form(...),
    terms_text: str = Form(""),
    additional_costs: str = Form("[]"),
    cover_image: UploadFile = None,
    page2_image: UploadFile = None,
    sections: str = Form("[]"),
    db: Session = Depends(get_db),
):
    file_id = str(uuid.uuid4())
    output_path = os.path.join(UPLOAD_DIR, f"proposal_{file_id}.pdf")

    cover_path, page2_path = None, None

    if cover_image:
        cover_path = os.path.join(UPLOAD_DIR, f"cover_{file_id}.png")
        with open(cover_path, "wb") as buffer:
            shutil.copyfileobj(cover_image.file, buffer)

    if page2_image:
        page2_path = os.path.join(UPLOAD_DIR, f"page2_{file_id}.png")
        with open(page2_path, "wb") as buffer:
            shutil.copyfileobj(page2_image.file, buffer)

    try:
        parsed_costs = json.loads(additional_costs)
    except Exception:
        parsed_costs = []

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
                    fo = db.query(FileObject).filter(FileObject.id == img["file_object_id"]).first()
                    if fo:
                        # For file objects, use the storage key directly (downloader will fetch; pdf generator opens via blob fetch done earlier if needed)
                        # For simplicity, leave path empty; pdf_dynamic will skip if path missing. Optionally could download to temp.
                        pass
                else:
                    field_name = img.get("file_field")
                    found = None
                    for key, value in form_data.items():
                        if key == field_name and _is_upload(value):
                            found = value
                            break
                    if found:
                        ext = mimetypes.guess_extension(getattr(found, "content_type", "") or "") or ".png"
                        tmp_path = os.path.join(UPLOAD_DIR, f"{field_name}_{uuid.uuid4()}{ext}")
                        with open(tmp_path, "wb") as buffer:
                            shutil.copyfileobj(found.file, buffer)
                        img["path"] = tmp_path

    proposal_data = {
        "company_name": company_name,
        "company_address": company_address,
        "cover_title": cover_title,
        "order_number": order_number,
        "date": date,
        "project_name_description": project_name_description,
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
        "terms_text": terms_text,
        "cover_image": cover_path,
        "page2_image": page2_path,
        "additional_costs": parsed_costs,
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
    seq = (db.query(Proposal).filter(Proposal.client_id == client_id).count() or 0) + 1
    return {"order_number": f"{base:04d}-{seq:03d}"}


@router.post("")
def save_proposal(payload: dict, db: Session = Depends(get_db)):
    p = Proposal(
        client_id=payload.get('client_id'),
        site_id=payload.get('site_id'),
        order_number=payload.get('order_number'),
        title=payload.get('cover_title') or payload.get('title') or 'Proposal',
        data=payload,
    )
    db.add(p)
    db.commit()
    return {"id": str(p.id)}


