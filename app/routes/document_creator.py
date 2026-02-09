"""
Document Creator API: templates, user documents CRUD, export to PDF.
"""
import uuid
from typing import Optional, List, Any

from fastapi import APIRouter, Depends, HTTPException, Body
from fastapi.responses import Response
from sqlalchemy.orm import Session
from pydantic import BaseModel

from ..db import get_db
from ..models.models import DocumentTemplate, UserDocument, User, FileObject
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
    pages: Optional[List[dict]] = None  # [{ template_id, areas_content }, ...]


class DocumentUpdate(BaseModel):
    title: Optional[str] = None
    pages: Optional[List[dict]] = None


class DocumentOut(BaseModel):
    id: str
    title: str
    document_type_id: Optional[str]
    pages: Optional[list]
    created_by: Optional[str]
    created_at: str
    updated_at: Optional[str]

    class Config:
        from_attributes = True


def _template_to_out(t: DocumentTemplate) -> dict:
    return {
        "id": str(t.id),
        "name": t.name,
        "description": t.description,
        "background_file_id": str(t.background_file_id) if t.background_file_id else None,
        "areas_definition": t.areas_definition,
    }


def _doc_to_out(d: UserDocument) -> dict:
    return {
        "id": str(d.id),
        "title": d.title,
        "document_type_id": str(d.document_type_id) if d.document_type_id else None,
        "pages": d.pages,
        "created_by": str(d.created_by) if d.created_by else None,
        "created_at": d.created_at.isoformat() if d.created_at else None,
        "updated_at": d.updated_at.isoformat() if d.updated_at else None,
    }


# --- Templates ---

@router.get("/templates", response_model=List[dict])
def list_templates(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _=Depends(require_permissions("documents:access", "documents:read")),
):
    """List all document templates (name, id, thumbnail via background_file_id)."""
    templates = db.query(DocumentTemplate).order_by(DocumentTemplate.name).all()
    return [_template_to_out(t) for t in templates]


@router.get("/templates/{template_id}", response_model=dict)
def get_template(
    template_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _=Depends(require_permissions("documents:access", "documents:read")),
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


class TemplateUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    background_file_id: Optional[str] = None


@router.post("/templates", response_model=dict)
def create_template(
    body: TemplateCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _=Depends(require_permissions("documents:access", "documents:write")),
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
    _=Depends(require_permissions("documents:access", "documents:write")),
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
    db.commit()
    db.refresh(t)
    return _template_to_out(t)


@router.delete("/templates/{template_id}")
def delete_template(
    template_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _=Depends(require_permissions("documents:access", "documents:write")),
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
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _=Depends(require_permissions("documents:access", "documents:read")),
):
    """List documents created by the current user."""
    docs = (
        db.query(UserDocument)
        .filter(UserDocument.created_by == user.id)
        .order_by(UserDocument.updated_at.desc().nullslast(), UserDocument.created_at.desc())
        .all()
    )
    return [_doc_to_out(d) for d in docs]


@router.post("/documents", response_model=dict)
def create_document(
    body: DocumentCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _=Depends(require_permissions("documents:access", "documents:write")),
):
    """Create a new user document."""
    doc = UserDocument(
        title=body.title or "Sem título",
        document_type_id=uuid.UUID(body.document_type_id) if body.document_type_id else None,
        pages=body.pages if body.pages is not None else [],
        created_by=user.id,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return _doc_to_out(doc)


@router.get("/documents/{document_id}", response_model=dict)
def get_document(
    document_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _=Depends(require_permissions("documents:access", "documents:read")),
):
    """Get document by id. Only owner can access."""
    try:
        did = uuid.UUID(document_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid document id")
    doc = db.query(UserDocument).filter(UserDocument.id == did).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if doc.created_by != user.id:
        raise HTTPException(status_code=403, detail="Forbidden")
    return _doc_to_out(doc)


@router.patch("/documents/{document_id}", response_model=dict)
def update_document(
    document_id: str,
    body: DocumentUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _=Depends(require_permissions("documents:access", "documents:write")),
):
    """Update document. Only owner can update."""
    try:
        did = uuid.UUID(document_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid document id")
    doc = db.query(UserDocument).filter(UserDocument.id == did).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if doc.created_by != user.id:
        raise HTTPException(status_code=403, detail="Forbidden")
    if body.title is not None:
        doc.title = body.title
    if body.pages is not None:
        doc.pages = body.pages
    from datetime import datetime, timezone
    doc.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(doc)
    return _doc_to_out(doc)


@router.post("/documents/{document_id}/export-pdf")
def export_document_pdf(
    document_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _=Depends(require_permissions("documents:access", "documents:read")),
):
    """Generate PDF for the document and return file."""
    try:
        did = uuid.UUID(document_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid document id")
    doc = db.query(UserDocument).filter(UserDocument.id == did).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if doc.created_by != user.id:
        raise HTTPException(status_code=403, detail="Forbidden")

    try:
        from ..document_creator.pdf_builder import build_pdf_bytes
        pdf_bytes = build_pdf_bytes(db, doc)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PDF generation failed: {str(e)}")

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{doc.title or "document"}.pdf"',
        },
    )
