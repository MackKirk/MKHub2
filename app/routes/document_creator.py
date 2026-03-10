"""
Document Creator API: templates, user documents CRUD, export to PDF.
"""
import copy
import uuid
from typing import Optional, List, Any

from fastapi import APIRouter, Depends, HTTPException, Body
from fastapi.responses import Response
from sqlalchemy.orm import Session
from pydantic import BaseModel

from ..db import get_db
from ..models.models import DocumentTemplate, DocumentType, UserDocument, User, FileObject
from ..auth.security import get_current_user, require_permissions


router = APIRouter(prefix="/document-creator", tags=["document-creator"])


# --- Schemas ---

class TemplateOut(BaseModel):
    id: str
    name: str
    description: Optional[str]
    background_file_id: Optional[str]
    areas_definition: Optional[dict]

    class Config:
        from_attributes = True


class TemplateDetailOut(TemplateOut):
    pass


class DocumentPage(BaseModel):
    template_id: Optional[str] = None
    areas_content: Optional[dict] = None


class DocumentCreate(BaseModel):
    title: str
    document_type_id: Optional[str] = None
    project_id: Optional[str] = None
    pages: Optional[List[dict]] = None  # [{ template_id, areas_content }, ...]


class DocumentUpdate(BaseModel):
    title: Optional[str] = None
    project_id: Optional[str] = None  # set to "" to unlink from project
    pages: Optional[List[dict]] = None


class DocumentOut(BaseModel):
    id: str
    title: str
    document_type_id: Optional[str]
    project_id: Optional[str]
    pages: Optional[list]
    created_by: Optional[str]
    created_at: str
    updated_at: Optional[str]

    class Config:
        from_attributes = True


class ExportPdfOptions(BaseModel):
    canvas_width_px: Optional[float] = None


def _template_to_out(t: DocumentTemplate) -> dict:
    return {
        "id": str(t.id),
        "name": t.name,
        "description": t.description,
        "background_file_id": str(t.background_file_id) if t.background_file_id else None,
        "areas_definition": getattr(t, "areas_definition", None),
        "margins": getattr(t, "margins", None),
        "default_elements": getattr(t, "default_elements", None),
    }


def _doc_to_out(d: UserDocument) -> dict:
    return {
        "id": str(d.id),
        "title": d.title,
        "document_type_id": str(d.document_type_id) if d.document_type_id else None,
        "project_id": str(d.project_id) if d.project_id else None,
        "pages": d.pages,
        "created_by": str(d.created_by) if d.created_by else None,
        "created_at": d.created_at.isoformat() if d.created_at else None,
        "updated_at": d.updated_at.isoformat() if d.updated_at else None,
    }


def _clone_elements_with_new_ids(elements: Optional[list], prefix: str) -> list:
    """Clone default_elements and assign new ids so they are unique per page."""
    if not elements or not isinstance(elements, list):
        return []
    import time
    base = str(int(time.time() * 1000))
    out = []
    for i, el in enumerate(elements):
        if not isinstance(el, dict):
            continue
        copy = dict(el)
        copy["id"] = f"{prefix}-{base}-{i}-{uuid.uuid4().hex[:8]}"
        out.append(copy)
    return out


# --- Document types (preset page sequences) ---

@router.get("/document-types", response_model=List[dict])
def list_document_types(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _=Depends(require_permissions("documents:access", "documents:read", "business:projects:documents:read")),
):
    """List document type presets (e.g. cover + back cover + content page)."""
    types = db.query(DocumentType).order_by(DocumentType.category or "", DocumentType.name).all()
    return [
        {
            "id": str(t.id),
            "name": t.name,
            "description": t.description,
            "category": getattr(t, "category", None),
            "page_templates": t.page_templates or [],
            "created_at": t.created_at.isoformat() if t.created_at else None,
        }
        for t in types
    ]


class DocumentTypeCreate(BaseModel):
    name: str
    description: Optional[str] = None
    category: Optional[str] = None
    page_templates: Optional[List[dict]] = None  # [{ "template_id": "uuid", "label": "Cover", "margins?", "elements?" }]


class DocumentTypeUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    page_templates: Optional[List[dict]] = None


@router.post("/document-types", response_model=dict)
def create_document_type(
    body: DocumentTypeCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _=Depends(require_permissions("documents:access", "documents:write", "business:projects:documents:write")),
):
    """Create a document type preset (ordered list of page templates)."""
    doc_type = DocumentType(
        name=body.name or "Unnamed",
        description=body.description,
        category=body.category,
        page_templates=body.page_templates if body.page_templates is not None else [],
    )
    db.add(doc_type)
    db.commit()
    db.refresh(doc_type)
    return {
        "id": str(doc_type.id),
        "name": doc_type.name,
        "description": doc_type.description,
        "category": doc_type.category,
        "page_templates": doc_type.page_templates or [],
        "created_at": doc_type.created_at.isoformat() if doc_type.created_at else None,
    }


@router.patch("/document-types/{document_type_id}", response_model=dict)
def update_document_type(
    document_type_id: str,
    body: DocumentTypeUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _=Depends(require_permissions("documents:access", "documents:write", "business:projects:documents:write")),
):
    """Update a document type preset."""
    try:
        dtid = uuid.UUID(document_type_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid document type id")
    doc_type = db.query(DocumentType).filter(DocumentType.id == dtid).first()
    if not doc_type:
        raise HTTPException(status_code=404, detail="Document type not found")
    if body.name is not None:
        doc_type.name = body.name
    if body.description is not None:
        doc_type.description = body.description
    if body.category is not None:
        doc_type.category = body.category
    if body.page_templates is not None:
        doc_type.page_templates = body.page_templates
    db.commit()
    db.refresh(doc_type)
    return {
        "id": str(doc_type.id),
        "name": doc_type.name,
        "description": doc_type.description,
        "category": doc_type.category,
        "page_templates": doc_type.page_templates or [],
        "created_at": doc_type.created_at.isoformat() if doc_type.created_at else None,
    }


@router.delete("/document-types/{document_type_id}")
def delete_document_type(
    document_type_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _=Depends(require_permissions("documents:access", "documents:write", "business:projects:documents:write")),
):
    """Delete a document type preset."""
    try:
        dtid = uuid.UUID(document_type_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid document type id")
    doc_type = db.query(DocumentType).filter(DocumentType.id == dtid).first()
    if not doc_type:
        raise HTTPException(status_code=404, detail="Document type not found")
    db.delete(doc_type)
    db.commit()
    return {"ok": True}


@router.post("/document-types/{document_type_id}/duplicate", response_model=dict)
def duplicate_document_type(
    document_type_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _=Depends(require_permissions("documents:access", "documents:write", "business:projects:documents:write")),
):
    """Duplicate a document type preset. Creates a new one with name + ' (copy)' and same category, description, page_templates."""
    try:
        dtid = uuid.UUID(document_type_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid document type id")
    doc_type = db.query(DocumentType).filter(DocumentType.id == dtid).first()
    if not doc_type:
        raise HTTPException(status_code=404, detail="Document type not found")
    copy_name = (doc_type.name or "Template").strip() + " (copy)"
    page_templates = doc_type.page_templates
    if isinstance(page_templates, list):
        page_templates = copy.deepcopy(page_templates)
    new_type = DocumentType(
        name=copy_name,
        description=doc_type.description,
        category=doc_type.category,
        page_templates=page_templates or [],
    )
    db.add(new_type)
    db.commit()
    db.refresh(new_type)
    return {
        "id": str(new_type.id),
        "name": new_type.name,
        "description": new_type.description,
        "category": new_type.category,
        "page_templates": new_type.page_templates or [],
        "created_at": new_type.created_at.isoformat() if new_type.created_at else None,
    }


@router.get("/document-types/{document_type_id}/expand-pages", response_model=List[dict])
def expand_document_type_pages(
    document_type_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _=Depends(require_permissions("documents:access", "documents:read", "business:projects:documents:read")),
):
    """Expand a document type into a list of pages (template_id, margins, elements) with cloned element ids.
    Use when adding pages from a template to an existing document. Uses template default_elements when entry has no elements."""
    try:
        dtid = uuid.UUID(document_type_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid document type id")
    doc_type = db.query(DocumentType).filter(DocumentType.id == dtid).first()
    if not doc_type:
        raise HTTPException(status_code=404, detail="Document type not found")
    pt_list = doc_type.page_templates or []
    if not isinstance(pt_list, list):
        pt_list = []
    pages: List[dict] = []
    for idx, entry in enumerate(pt_list):
        if not isinstance(entry, dict):
            pages.append({"template_id": None, "margins": None, "elements": []})
            continue
        tid = entry.get("template_id")
        if not tid:
            pages.append({
                "template_id": None,
                "margins": entry.get("margins"),
                "elements": _clone_elements_with_new_ids(entry.get("elements") if isinstance(entry.get("elements"), list) else [], f"p{idx}"),
            })
            continue
        try:
            tuid = uuid.UUID(tid) if isinstance(tid, str) else tid
        except (ValueError, TypeError):
            pages.append({"template_id": None, "margins": entry.get("margins"), "elements": []})
            continue
        template = db.query(DocumentTemplate).filter(DocumentTemplate.id == tuid).first()
        if not template:
            pages.append({"template_id": str(tuid), "margins": entry.get("margins"), "elements": []})
            continue
        entry_margins = entry.get("margins")
        entry_elements = entry.get("elements") if isinstance(entry.get("elements"), list) else None
        if entry_elements:
            elements = _clone_elements_with_new_ids(entry_elements, f"p{idx}")
        else:
            elements = _clone_elements_with_new_ids(
                template.default_elements if isinstance(template.default_elements, list) else [],
                f"p{idx}",
            )
        margins = entry_margins if entry_margins is not None else getattr(template, "margins", None)
        pages.append({"template_id": str(tuid), "margins": margins, "elements": elements})
    return pages


# --- Templates ---

@router.get("/templates", response_model=List[dict])
def list_templates(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _=Depends(require_permissions("documents:access", "documents:read", "business:projects:documents:read")),
):
    """List all document templates (name, id, thumbnail via background_file_id)."""
    templates = db.query(DocumentTemplate).order_by(DocumentTemplate.name).all()
    return [_template_to_out(t) for t in templates]


@router.get("/templates/{template_id}", response_model=dict)
def get_template(
    template_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _=Depends(require_permissions("documents:access", "documents:read", "business:projects:documents:read")),
):
    """Get template by id including areas_definition."""
    try:
        tid = uuid.UUID(template_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid template id")
    t = db.query(DocumentTemplate).filter(DocumentTemplate.id == tid).first()
    if not t:
        raise HTTPException(status_code=404, detail="Template not found")
    return _template_to_out(t)


class TemplateCreate(BaseModel):
    name: str
    description: Optional[str] = None
    background_file_id: Optional[str] = None
    margins: Optional[dict] = None  # { left_pct, right_pct, top_pct, bottom_pct }
    default_elements: Optional[List[dict]] = None  # list of DocElement-shaped dicts


class TemplateUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    background_file_id: Optional[str] = None
    margins: Optional[dict] = None
    default_elements: Optional[List[dict]] = None


@router.post("/templates", response_model=dict)
def create_template(
    body: TemplateCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _=Depends(require_permissions("documents:access", "documents:write", "business:projects:documents:write")),
):
    """Create a new document template (background)."""
    bg_id = None
    if body.background_file_id:
        try:
            bg_id = uuid.UUID(body.background_file_id)
            fo = db.query(FileObject).filter(FileObject.id == bg_id).first()
            if not fo:
                raise HTTPException(status_code=400, detail="File not found")
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid background_file_id")
    t = DocumentTemplate(
        name=body.name or "Sem nome",
        description=body.description,
        background_file_id=bg_id,
        margins=body.margins,
        default_elements=body.default_elements,
    )
    db.add(t)
    db.commit()
    db.refresh(t)
    return _template_to_out(t)


@router.patch("/templates/{template_id}", response_model=dict)
def update_template(
    template_id: str,
    body: TemplateUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _=Depends(require_permissions("documents:access", "documents:write", "business:projects:documents:write")),
):
    """Update template name, description or background."""
    try:
        tid = uuid.UUID(template_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid template id")
    t = db.query(DocumentTemplate).filter(DocumentTemplate.id == tid).first()
    if not t:
        raise HTTPException(status_code=404, detail="Template not found")
    if body.name is not None:
        t.name = body.name
    if body.description is not None:
        t.description = body.description
    if body.background_file_id is not None:
        if body.background_file_id == "":
            t.background_file_id = None
        else:
            try:
                t.background_file_id = uuid.UUID(body.background_file_id)
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid background_file_id")
    if body.margins is not None:
        t.margins = body.margins
    if body.default_elements is not None:
        t.default_elements = body.default_elements
    db.commit()
    db.refresh(t)
    return _template_to_out(t)


@router.delete("/templates/{template_id}")
def delete_template(
    template_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _=Depends(require_permissions("documents:access", "documents:write", "business:projects:documents:write")),
):
    """Delete a template."""
    try:
        tid = uuid.UUID(template_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid template id")
    t = db.query(DocumentTemplate).filter(DocumentTemplate.id == tid).first()
    if not t:
        raise HTTPException(status_code=404, detail="Template not found")
    db.delete(t)
    db.commit()
    return {"ok": True}


# --- Documents ---

@router.get("/documents", response_model=List[dict])
def list_documents(
    project_id: Optional[str] = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _=Depends(require_permissions("documents:access", "documents:read", "business:projects:documents:read")),
):
    """List documents. Optionally filter by project_id. With project docs permission, list all docs for that project."""
    from ..auth.security import _has_permission
    has_project_docs = _has_permission(user, "business:projects:documents:read") or _has_permission(user, "business:projects:documents:write")
    if project_id and has_project_docs:
        try:
            pid = uuid.UUID(project_id)
            q = db.query(UserDocument).filter(UserDocument.project_id == pid)
        except ValueError:
            q = db.query(UserDocument).filter(UserDocument.created_by == user.id)
    else:
        q = db.query(UserDocument).filter(UserDocument.created_by == user.id)
        if project_id:
            try:
                pid = uuid.UUID(project_id)
                q = q.filter(UserDocument.project_id == pid)
            except ValueError:
                pass
    docs = q.order_by(
        UserDocument.updated_at.desc().nullslast(), UserDocument.created_at.desc()
    ).all()
    return [_doc_to_out(d) for d in docs]


@router.post("/documents", response_model=dict)
def create_document(
    body: DocumentCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _=Depends(require_permissions("documents:access", "documents:write", "business:projects:documents:write")),
):
    """Create a new user document. If document_type_id is set, pages are built from that preset."""
    pages = body.pages if body.pages is not None else []
    dtype_id = None
    if body.document_type_id:
        try:
            dtype_id = uuid.UUID(body.document_type_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid document_type_id")
        doc_type = db.query(DocumentType).filter(DocumentType.id == dtype_id).first()
        if not doc_type:
            raise HTTPException(status_code=404, detail="Document type not found")
        pt_list = doc_type.page_templates or []
        if not isinstance(pt_list, list):
            pt_list = []
        pages = []
        for idx, entry in enumerate(pt_list):
            if not isinstance(entry, dict):
                pages.append({"template_id": None, "elements": []})
                continue
            tid = entry.get("template_id")
            if not tid:
                pages.append({"template_id": None, "elements": [], "margins": entry.get("margins")})
                continue
            try:
                tuid = uuid.UUID(tid) if isinstance(tid, str) else tid
            except (ValueError, TypeError):
                pages.append({"template_id": None, "elements": [], "margins": entry.get("margins")})
                continue
            template = db.query(DocumentTemplate).filter(DocumentTemplate.id == tuid).first()
            if not template:
                pages.append({"template_id": str(tuid), "elements": [], "margins": entry.get("margins")})
                continue
            entry_margins = entry.get("margins")
            entry_elements = entry.get("elements") if isinstance(entry.get("elements"), list) else []
            elements = _clone_elements_with_new_ids(entry_elements, f"p{idx}") if entry_elements else []
            pages.append({"template_id": str(tuid), "margins": entry_margins, "elements": elements})
    doc = UserDocument(
        title=body.title or "Sem título",
        document_type_id=dtype_id,
        project_id=uuid.UUID(body.project_id) if body.project_id else None,
        pages=pages,
        created_by=user.id,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return _doc_to_out(doc)


def _can_access_document(user: User, doc: UserDocument, require_write: bool = False) -> bool:
    """True if user can access (read or write) this document."""
    from ..auth.security import _has_permission
    if doc.created_by == user.id:
        return True
    if not doc.project_id:
        return False
    if require_write:
        return _has_permission(user, "business:projects:documents:write")
    return _has_permission(user, "business:projects:documents:read") or _has_permission(user, "business:projects:documents:write")


@router.get("/documents/{document_id}", response_model=dict)
def get_document(
    document_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _=Depends(require_permissions("documents:access", "documents:read", "business:projects:documents:read")),
):
    """Get document by id. Owner or user with project documents permission can access."""
    try:
        did = uuid.UUID(document_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid document id")
    doc = db.query(UserDocument).filter(UserDocument.id == did).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if not _can_access_document(user, doc, require_write=False):
        raise HTTPException(status_code=403, detail="Forbidden")
    return _doc_to_out(doc)


@router.patch("/documents/{document_id}", response_model=dict)
def update_document(
    document_id: str,
    body: DocumentUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _=Depends(require_permissions("documents:access", "documents:write", "business:projects:documents:write")),
):
    """Update document. Owner or user with project documents write permission can update."""
    try:
        did = uuid.UUID(document_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid document id")
    doc = db.query(UserDocument).filter(UserDocument.id == did).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if not _can_access_document(user, doc, require_write=True):
        raise HTTPException(status_code=403, detail="Forbidden")
    if body.title is not None:
        doc.title = body.title
    if body.project_id is not None:
        doc.project_id = uuid.UUID(body.project_id) if body.project_id else None
    if body.pages is not None:
        doc.pages = body.pages
    from datetime import datetime, timezone
    doc.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(doc)
    return _doc_to_out(doc)


@router.delete("/documents/{document_id}")
def delete_document(
    document_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _=Depends(require_permissions("documents:access", "documents:write", "business:projects:documents:write")),
):
    """Delete a document. Owner or user with project documents write permission can delete."""
    try:
        did = uuid.UUID(document_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid document id")
    doc = db.query(UserDocument).filter(UserDocument.id == did).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if not _can_access_document(user, doc, require_write=True):
        raise HTTPException(status_code=403, detail="Forbidden")
    db.delete(doc)
    db.commit()
    return {"ok": True}


@router.post("/documents/{document_id}/export-pdf")
def export_document_pdf(
    document_id: str,
    body: Optional[ExportPdfOptions] = Body(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _=Depends(require_permissions("documents:access", "documents:read", "business:projects:documents:read")),
):
    """Generate PDF for the document and return file."""
    try:
        did = uuid.UUID(document_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid document id")
    doc = db.query(UserDocument).filter(UserDocument.id == did).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if not _can_access_document(user, doc, require_write=False):
        raise HTTPException(status_code=403, detail="Forbidden")

    try:
        from ..document_creator.pdf_builder import build_pdf_bytes
        pdf_bytes = build_pdf_bytes(db, doc, canvas_width_px=(body.canvas_width_px if body else None))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PDF generation failed: {str(e)}")

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{doc.title or "document"}.pdf"',
        },
    )
