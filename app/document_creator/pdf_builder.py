"""
Build PDF from UserDocument: one page per entry in pages, each with template background + areas.
"""
import io
import uuid
from typing import Optional

from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from sqlalchemy.orm import Session
import httpx

from ..models.models import DocumentTemplate, UserDocument, FileObject
from ..config import settings
from ..storage.provider import StorageProvider
from ..storage.local_provider import LocalStorageProvider
from ..storage.blob_provider import BlobStorageProvider


# Register a default font (use ReportLab built-in or proposals fonts)
def _register_fonts():
    import os
    try:
        fonts_path = os.path.join(os.path.dirname(__file__), "..", "proposals", "assets", "fonts")
        if os.path.exists(os.path.join(fonts_path, "Montserrat-Regular.ttf")):
            pdfmetrics.registerFont(TTFont("Montserrat", os.path.join(fonts_path, "Montserrat-Regular.ttf")))
            pdfmetrics.registerFont(TTFont("Montserrat-Bold", os.path.join(fonts_path, "Montserrat-Bold.ttf")))
            return "Montserrat", "Montserrat-Bold"
    except Exception:
        pass
    return "Helvetica", "Helvetica-Bold"


def _get_storage_for_file(fo: FileObject) -> StorageProvider:
    if getattr(fo, "provider", None) == "blob" and settings.azure_blob_connection and settings.azure_blob_container:
        try:
            return BlobStorageProvider()
        except Exception:
            pass
    return LocalStorageProvider()


def _read_file_bytes(db: Session, file_id: uuid.UUID) -> Optional[bytes]:
    """Read file content from storage. Returns None if not found or error."""
    fo = db.query(FileObject).filter(FileObject.id == file_id).first()
    if not fo:
        return None
    storage = _get_storage_for_file(fo)
    try:
        if isinstance(storage, LocalStorageProvider):
            path = storage._get_path(fo.key)
            if path.exists():
                with open(path, "rb") as f:
                    return f.read()
            return None
        url = storage.get_download_url(fo.key, expires_s=300)
        if not url:
            return None
        with httpx.stream("GET", url, timeout=30.0) as r:
            r.raise_for_status()
            return b"".join(r.iter_bytes())
    except Exception:
        return None


def build_pdf_bytes(db: Session, doc: UserDocument) -> bytes:
    """Generate PDF bytes for the given UserDocument."""
    font_name, font_bold = _register_fonts()
    buf = io.BytesIO()
    page_width, page_height = A4  # 595.28 x 841.89 points

    c = canvas.Canvas(buf, pagesize=A4)
    pages = doc.pages if isinstance(doc.pages, list) else []
    if not pages:
        # Single empty page
        c.setFont(font_name, 12)
        c.drawString(72, page_height - 72, doc.title or "Document")
        c.showPage()
    else:
        for page_data in pages:
            template_id = page_data.get("template_id") if isinstance(page_data, dict) else None
            areas_content = page_data.get("areas_content") if isinstance(page_data, dict) else {}
            if not isinstance(areas_content, dict):
                areas_content = {}

            template = None
            if template_id:
                try:
                    tid = uuid.UUID(template_id) if isinstance(template_id, str) else template_id
                    template = db.query(DocumentTemplate).filter(DocumentTemplate.id == tid).first()
                except (ValueError, TypeError):
                    pass

            # Draw background
            if template and template.background_file_id:
                img_bytes = _read_file_bytes(db, template.background_file_id)
                if img_bytes:
                    try:
                        from reportlab.lib.utils import ImageReader
                        from PIL import Image as PILImage
                        pil_im = PILImage.open(io.BytesIO(img_bytes))
                        if pil_im.mode in ("RGBA", "P"):
                            pil_im = pil_im.convert("RGB")
                        img_buf = io.BytesIO()
                        pil_im.save(img_buf, format="JPEG", quality=90)
                        img_buf.seek(0)
                        reader = ImageReader(img_buf)
                        c.drawImage(reader, 0, 0, width=page_width, height=page_height)
                    except Exception:
                        pass

            # Draw elements (Canva-style: text, image) or legacy areas
            elements = page_data.get("elements") if isinstance(page_data, dict) else []
            if elements and isinstance(elements, list):
                # New format: libre elements
                for el in elements:
                    if not isinstance(el, dict):
                        continue
                    el_type = el.get("type") or "text"
                    x_pct = float(el.get("x_pct", 10)) / 100.0
                    y_pct = float(el.get("y_pct", 20)) / 100.0
                    w_pct = float(el.get("width_pct", 80)) / 100.0
                    h_pct = float(el.get("height_pct", 10)) / 100.0
                    x = page_width * x_pct
                    y = page_height * (1 - y_pct - h_pct)  # y_pct = top edge
                    w = page_width * w_pct
                    h = page_height * h_pct
                    content = el.get("content") or ""
                    if el_type == "text":
                        font_size = int(el.get("font_size", 11))
                        is_bold = el.get("fontWeight") == "bold"
                        c.setFont(font_bold if is_bold else font_name, font_size)
                        c.setFillColor(colors.black)
                        text_align = el.get("textAlign") or "left"
                        lines = str(content).replace("\r\n", "\n").split("\n")
                        for i, line in enumerate(lines):
                            if i * (font_size + 2) >= h:
                                break
                            line = line[: int(w / (font_size * 0.6)) or 120]
                            line_y = y + h - (i + 1) * (font_size + 2)
                            if text_align == "center":
                                tw = c.stringWidth(line, font_bold if is_bold else font_name, font_size)
                                c.drawString(x + (w - tw) / 2, line_y, line)
                            elif text_align == "right":
                                tw = c.stringWidth(line, font_bold if is_bold else font_name, font_size)
                                c.drawString(x + w - tw, line_y, line)
                            else:
                                c.drawString(x, line_y, line)
                    elif el_type == "image" and content:
                        try:
                            fid = uuid.UUID(content) if isinstance(content, str) else None
                            if fid:
                                img_bytes = _read_file_bytes(db, fid)
                                if img_bytes:
                                    from reportlab.lib.utils import ImageReader
                                    from PIL import Image as PILImage
                                    pil_im = PILImage.open(io.BytesIO(img_bytes))
                                    if pil_im.mode in ("RGBA", "P"):
                                        pil_im = pil_im.convert("RGB")
                                    img_buf = io.BytesIO()
                                    pil_im.save(img_buf, format="JPEG", quality=90)
                                    img_buf.seek(0)
                                    reader = ImageReader(img_buf)
                                    c.drawImage(reader, x, y, width=w, height=h)
                        except Exception:
                            pass
            else:
                # Legacy: areas_definition + areas_content
                areas_def = (template.areas_definition if template and template.areas_definition else []) or []
                if isinstance(areas_def, dict):
                    areas_def = areas_def.get("areas", []) or []
                for area in areas_def:
                    if not isinstance(area, dict):
                        continue
                    area_id = area.get("id") or area.get("key")
                    text = areas_content.get(area_id) or areas_content.get(str(area_id)) or ""
                    if not str(text).strip():
                        continue
                    x_pct = float(area.get("x_pct", 10)) / 100.0
                    y_pct = float(area.get("y_pct", 80)) / 100.0
                    w_pct = float(area.get("width_pct", 80)) / 100.0
                    h_pct = float(area.get("height_pct", 10)) / 100.0
                    x = page_width * x_pct
                    y = page_height * (1 - y_pct)
                    w = page_width * w_pct
                    h = page_height * h_pct
                    font_size = int(area.get("font_size", 11))
                    c.setFont(font_bold if (area.get("type") == "title") else font_name, font_size)
                    c.setFillColor(colors.black)
                    lines = str(text).replace("\r\n", "\n").split("\n")[: int(h / (font_size + 2)) or 1]
                    for i, line in enumerate(lines):
                        if i * (font_size + 2) >= h:
                            break
                        c.drawString(x, y - i * (font_size + 2), line[: int(w / (font_size * 0.6)) or 80])

            c.showPage()

    c.save()
    buf.seek(0)
    return buf.read()
