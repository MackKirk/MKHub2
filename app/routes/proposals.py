import os
import uuid
import shutil
import json
import mimetypes
from typing import Optional

from fastapi import APIRouter, UploadFile, Form, Request
from fastapi.responses import FileResponse

from ..config import settings
from ..logging import RequestIdMiddleware
from ..db import get_db
from ..models.models import FileObject
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


