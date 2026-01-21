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
from ..proposals.pdf_image_optimizer import optimize_image_bytes
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
    project_id: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    file_id = str(uuid.uuid4())
    output_path = os.path.join(UPLOAD_DIR, f"proposal_{file_id}.pdf")

    cover_path, page2_path = None, None

    if cover_image and getattr(cover_image, "filename", ""):
        # Normalize and optimize image using PIL (handles HEIC via pillow-heif)
        tmp_ext = mimetypes.guess_extension(getattr(cover_image, "content_type", "") or "") or ".bin"
        tmp_in = os.path.join(UPLOAD_DIR, f"cover_in_{file_id}{tmp_ext}")
        with open(tmp_in, "wb") as buffer:
            shutil.copyfileobj(cover_image.file, buffer)
        try:
            # Skip empty uploads
            if os.path.getsize(tmp_in) > 0:
                # Read image bytes and optimize
                with open(tmp_in, "rb") as f:
                    image_bytes = f.read()
                
                # Optimize image before saving
                optimized_bytes = optimize_image_bytes(image_bytes, preset="cover")
                
                # Save optimized image as JPEG (optimizer already converted to JPEG)
                cover_path = os.path.join(UPLOAD_DIR, f"cover_{file_id}.jpg")
                with open(cover_path, "wb") as f:
                    f.write(optimized_bytes)
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
                # Read image bytes and optimize
                with open(tmp_in, "rb") as f:
                    image_bytes = f.read()
                
                # Optimize image before saving
                optimized_bytes = optimize_image_bytes(image_bytes, preset="section")
                
                # Save optimized image as JPEG (optimizer already converted to JPEG)
                page2_path = os.path.join(UPLOAD_DIR, f"page2_{file_id}.jpg")
                with open(page2_path, "wb") as f:
                    f.write(optimized_bytes)
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
            # Download original then optimize
            in_ext = mimetypes.guess_extension(fo.content_type or "") or ".bin"
            tmp_in = os.path.join(UPLOAD_DIR, f"{prefix}_in_{file_id}{in_ext}")
            tmp_path = os.path.join(UPLOAD_DIR, f"{prefix}_{file_id}.jpg")
            async with httpx.AsyncClient(timeout=30.0) as client:
                async with client.stream("GET", url) as r:
                    r.raise_for_status()
                    with open(tmp_in, "wb") as out:
                        async for chunk in r.aiter_bytes():
                            out.write(chunk)
            # Optimize image before saving
            try:
                with open(tmp_in, "rb") as f:
                    image_bytes = f.read()
                
                # Determine preset based on prefix
                preset = "cover" if prefix == "cover" else "section"
                optimized_bytes = optimize_image_bytes(image_bytes, preset=preset)
                
                # Save optimized image as JPEG (optimizer already converted to JPEG)
                with open(tmp_path, "wb") as f:
                    f.write(optimized_bytes)
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
                            # Read image bytes and optimize
                            with open(tmp_in, "rb") as f:
                                image_bytes = f.read()
                            
                            # Optimize image before saving
                            optimized_bytes = optimize_image_bytes(image_bytes, preset="section")
                            
                            # Save optimized image as JPEG (optimizer already converted to JPEG)
                            tmp_out = os.path.join(UPLOAD_DIR, f"{field_name}_{uuid.uuid4()}.jpg")
                            with open(tmp_out, "wb") as f:
                                f.write(optimized_bytes)
                            img["path"] = tmp_out
                        finally:
                            try:
                                os.remove(tmp_in)
                            except Exception:
                                pass

    # Check if this is an opportunity (bidding project) or regular project
    project_id_clean = (project_id or "").strip()
    is_bidding = False
    # True if this is for an opportunity or project (not a standalone quote)
    # Use project_id presence as the source of truth (DB lookup is best-effort).
    is_project = bool(project_id_clean)
    if project_id_clean:
        from ..models.models import Project
        project = db.query(Project).filter(Project.id == project_id_clean).first()
        if project:
            is_bidding = getattr(project, 'is_bidding', False) or False
    
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
        "project_id": project_id_clean or None,
        "is_bidding": is_bidding,  # Pass is_bidding flag to PDF
        "is_project": is_project,  # Pass is_project flag to PDF (True for both opportunities and projects)
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

    # Create audit log for PDF generation
    try:
        from ..services.audit import create_audit_log
        create_audit_log(
            db=db,
            entity_type="proposal",
            entity_id=file_id,
            action="GENERATE_PDF",
            actor_id=str(user.id) if user else None,
            actor_role="user",
            source="api",
            changes_json={
                "cover_title": cover_title,
                "order_number": order_number,
                "project_name": project_name,
                "client_name": client_name,
                "total": total,
                "template_style": template_style,
            },
            context={
                "project_id": project_id,
                "proposal_created_for": proposal_created_for,
            }
        )
    except Exception:
        pass

    return FileResponse(output_path, media_type="application/pdf", filename="ProjectProposal.pdf")


# ---------- Drafts ----------
@router.post("/drafts")
def create_or_update_draft(body: dict = Body(None), db: Session = Depends(get_db), user=Depends(get_current_user)):
    if body is None:
        body = {}
    draft_id = body.get('id')
    is_new = False
    if draft_id:
        d = db.query(ProposalDraft).filter(ProposalDraft.id == draft_id).first()
        if not d:
            raise HTTPException(status_code=404, detail='Draft not found')
    else:
        d = ProposalDraft()
        db.add(d)
        is_new = True
    d.client_id = body.get('client_id')
    d.site_id = body.get('site_id')
    d.user_id = getattr(user, 'id', None)
    d.title = body.get('title') or 'Untitled'
    d.data = body.get('data') or {}
    from datetime import datetime
    d.updated_at = datetime.utcnow()
    db.commit()
    
    # Create audit log for proposal draft
    try:
        from ..services.audit import create_audit_log
        # Get project_id from data if available
        project_id = (body.get('data') or {}).get('project_id')
        create_audit_log(
            db=db,
            entity_type="proposal_draft",
            entity_id=str(d.id),
            action="CREATE" if is_new else "UPDATE",
            actor_id=str(user.id) if user else None,
            actor_role="user",
            source="api",
            changes_json={
                "title": d.title,
                "is_new": is_new,
            },
            context={
                "project_id": str(project_id) if project_id else None,
                "client_id": str(d.client_id) if d.client_id else None,
            }
        )
    except Exception:
        pass
    
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
    
    # Capture draft info before deletion for audit log
    draft_info = {
        "title": d.title,
        "client_id": str(d.client_id) if d.client_id else None,
    }
    project_id = (d.data or {}).get('project_id') if d.data else None
    
    db.delete(d)
    db.commit()
    
    # Create audit log for draft deletion
    try:
        from ..services.audit import create_audit_log
        create_audit_log(
            db=db,
            entity_type="proposal_draft",
            entity_id=draft_id,
            action="DELETE",
            actor_id=str(user.id) if user else None,
            actor_role="user",
            source="api",
            changes_json={"deleted_draft": draft_info},
            context={
                "project_id": str(project_id) if project_id else None,
            }
        )
    except Exception:
        pass
    
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
def save_proposal(payload: dict = Body(...), db: Session = Depends(get_db), user=Depends(get_current_user)):
    pid = payload.get('id')
    title = payload.get('cover_title') or payload.get('title') or 'Proposal'
    is_new = False
    is_change_order = payload.get('is_change_order', False)
    
    if pid:
        p = db.query(Proposal).filter(Proposal.id == pid).first()
        if not p:
            raise HTTPException(status_code=404, detail='Proposal not found')
        
        # Prevent editing approved Change Orders
        if p.is_change_order and p.approved_report_id:
            raise HTTPException(status_code=400, detail='Cannot edit approved Change Order')
        
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
        
        # Sync cover image to project if project_id exists and user hasn't manually set it
        if p.project_id:
            from ..models.models import Project
            project = db.query(Project).filter(Project.id == p.project_id).first()
            if project and not getattr(project, 'image_manually_set', False):
                cover_file_object_id = payload.get('cover_file_object_id')
                if cover_file_object_id:
                    project.image_file_object_id = cover_file_object_id
                    # Don't set image_manually_set to True here - it stays False so it can be auto-updated
        
        db.commit()
    else:
        is_new = True
        
        # Handle Change Order creation
        if is_change_order:
            project_id = payload.get('project_id')
            if not project_id:
                raise HTTPException(status_code=400, detail='project_id is required for Change Orders')
            
            # Find the original proposal
            original_proposal = db.query(Proposal).filter(
                Proposal.project_id == project_id,
                Proposal.is_change_order == False
            ).order_by(Proposal.created_at.asc()).first()
            
            if not original_proposal:
                raise HTTPException(status_code=404, detail='Original proposal not found. Please create a Proposal first.')
            
            # Get the next change order number
            latest_change_order = db.query(Proposal).filter(
                Proposal.project_id == project_id,
                Proposal.is_change_order == True
            ).order_by(Proposal.change_order_number.desc()).first()
            
            next_change_order_number = payload.get('change_order_number')
            if not next_change_order_number:
                if latest_change_order and latest_change_order.change_order_number:
                    next_change_order_number = latest_change_order.change_order_number + 1
                else:
                    next_change_order_number = 1
            
            # Copy General Information from original proposal
            original_data = original_proposal.data or {}
            change_order_data = {}
            
            # Copy General Information fields
            general_info_fields = [
                'cover_title', 'date', 'proposal_created_for', 'primary_contact_name',
                'primary_contact_phone', 'primary_contact_email', 'type_of_project',
                'other_notes', 'cover_file_object_id', 'page2_file_object_id'
            ]
            for field in general_info_fields:
                if field in original_data:
                    change_order_data[field] = original_data[field]
            
            # Merge with payload data (payload can override General Information if needed)
            change_order_data.update(payload)
            
            # Ensure Sections and Pricing are empty for new Change Orders
            if 'sections' not in change_order_data:
                change_order_data['sections'] = []
            if 'pricing_items' not in change_order_data:
                change_order_data['pricing_items'] = []
            if 'optional_services' not in change_order_data:
                change_order_data['optional_services'] = []
            
            p = Proposal(
                project_id=project_id,
                client_id=payload.get('client_id') or original_proposal.client_id,
                site_id=payload.get('site_id') or original_proposal.site_id,
                order_number=payload.get('order_number') or original_proposal.order_number,
                title=title or f"Change Order {next_change_order_number}",
                data=change_order_data,
                is_change_order=True,
                change_order_number=next_change_order_number,
                parent_proposal_id=original_proposal.id,
            )
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
        db.flush()  # Flush to get the ID
        
        # Sync cover image to project if project_id exists and user hasn't manually set it
        if p.project_id:
            from ..models.models import Project
            project = db.query(Project).filter(Project.id == p.project_id).first()
            if project and not getattr(project, 'image_manually_set', False):
                cover_file_object_id = payload.get('cover_file_object_id')
                if cover_file_object_id:
                    project.image_file_object_id = cover_file_object_id
                    # Don't set image_manually_set to True here - it stays False so it can be auto-updated
        
        db.commit()
    
    # Create audit log for proposal save
    try:
        from ..services.audit import create_audit_log
        create_audit_log(
            db=db,
            entity_type="proposal",
            entity_id=str(p.id),
            action="CREATE" if is_new else "UPDATE",
            actor_id=str(user.id) if user else None,
            actor_role="user",
            source="api",
            changes_json={
                "title": title,
                "order_number": p.order_number,
                "is_new": is_new,
            },
            context={
                "project_id": str(p.project_id) if p.project_id else None,
                "client_id": str(p.client_id) if p.client_id else None,
            }
        )
    except Exception:
        pass
    
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
        "data": r.data if r.data else {},
        "is_change_order": getattr(r, 'is_change_order', False),
        "change_order_number": getattr(r, 'change_order_number', None),
        "parent_proposal_id": str(getattr(r, 'parent_proposal_id', None)) if getattr(r, 'parent_proposal_id', None) else None,
        "approved_report_id": str(getattr(r, 'approved_report_id', None)) if getattr(r, 'approved_report_id', None) else None,
        "approval_status": getattr(r, 'approval_status', None) or ('approved' if getattr(r, 'approved_report_id', None) else None),
    } for r in rows]


@router.get("/latest-approved")
def get_latest_approved_proposal(project_id: Optional[str] = Query(None), db: Session = Depends(get_db)):
    """Get the latest approved proposal for a project (last Change Order or original if no Change Orders)"""
    if not project_id:
        raise HTTPException(status_code=400, detail="project_id is required")
    
    # First, try to find the latest approved Change Order
    # Change Orders must have is_change_order=True and approved_report_id set (indicating they were approved)
    latest_change_order = db.query(Proposal).filter(
        Proposal.project_id == project_id,
        Proposal.is_change_order == True,
        Proposal.approved_report_id.isnot(None)
    ).order_by(Proposal.change_order_number.desc()).first()
    
    if latest_change_order:
        return {
            "id": str(latest_change_order.id),
            "project_id": str(latest_change_order.project_id) if getattr(latest_change_order, 'project_id', None) else None,
            "client_id": str(latest_change_order.client_id) if latest_change_order.client_id else None,
            "site_id": str(latest_change_order.site_id) if latest_change_order.site_id else None,
            "order_number": latest_change_order.order_number,
            "title": latest_change_order.title,
            "data": latest_change_order.data or {},
            "created_at": latest_change_order.created_at.isoformat() if latest_change_order.created_at else None,
            "is_change_order": latest_change_order.is_change_order,
            "change_order_number": latest_change_order.change_order_number,
            "parent_proposal_id": str(latest_change_order.parent_proposal_id) if latest_change_order.parent_proposal_id else None,
        }
    
    # If no Change Orders, return the original proposal (is_change_order=False or None)
    original_proposal = db.query(Proposal).filter(
        Proposal.project_id == project_id,
        Proposal.is_change_order == False
    ).order_by(Proposal.created_at.asc()).first()
    
    if original_proposal:
        return {
            "id": str(original_proposal.id),
            "project_id": str(original_proposal.project_id) if getattr(original_proposal, 'project_id', None) else None,
            "client_id": str(original_proposal.client_id) if original_proposal.client_id else None,
            "site_id": str(original_proposal.site_id) if original_proposal.site_id else None,
            "order_number": original_proposal.order_number,
            "title": original_proposal.title,
            "data": original_proposal.data or {},
            "created_at": original_proposal.created_at.isoformat() if original_proposal.created_at else None,
            "is_change_order": False,
            "change_order_number": None,
            "parent_proposal_id": None,
        }
    
    # If no proposals found at all, return None
    raise HTTPException(status_code=404, detail="No proposals found for this project")


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
        "is_change_order": getattr(p, 'is_change_order', False),
        "change_order_number": getattr(p, 'change_order_number', None),
        "parent_proposal_id": str(getattr(p, 'parent_proposal_id', None)) if getattr(p, 'parent_proposal_id', None) else None,
        "approved_report_id": str(getattr(p, 'approved_report_id', None)) if getattr(p, 'approved_report_id', None) else None,
        "approval_status": getattr(p, 'approval_status', None) or ('approved' if getattr(p, 'approved_report_id', None) else None),
    }


@router.post("/{proposal_id}/submit-for-approval")
def submit_proposal_for_approval(proposal_id: str, db: Session = Depends(get_db), user=Depends(get_current_user)):
    """Submit a Change Order for approval by creating a report"""
    from datetime import datetime, timezone
    from ..models.models import ProjectReport
    
    p = db.query(Proposal).filter(Proposal.id == proposal_id).first()
    if not p:
        raise HTTPException(status_code=404, detail='Proposal not found')
    
    if not p.is_change_order:
        raise HTTPException(status_code=400, detail='Only Change Orders can be submitted for approval')
    
    if p.approved_report_id:
        raise HTTPException(status_code=400, detail='Change Order has already been submitted for approval')
    
    # Create a report for this Change Order
    report = ProjectReport(
        project_id=p.project_id,
        title=f"Change Order {p.change_order_number} - Approval Request",
        category_id='estimate-changes',
        description=f"Change Order {p.change_order_number} submitted for approval",
        financial_type='estimate-changes',
        approval_status='pending',
        created_by=user.id if user else None,
        estimate_data={
            'proposal_data': p.data or {}
        }
    )
    db.add(report)
    db.flush()
    
    # Update proposal with approval status and report ID
    p.approval_status = 'pending'
    p.approved_report_id = report.id
    db.commit()
    
    return {"status": "ok", "report_id": str(report.id)}


@router.delete("/{proposal_id}")
def delete_proposal(proposal_id: str, db: Session = Depends(get_db)):
    p = db.query(Proposal).filter(Proposal.id == proposal_id).first()
    if not p:
        raise HTTPException(status_code=404, detail='Proposal not found')
    db.delete(p)
    db.commit()
    return {"status": "ok"}


