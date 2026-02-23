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


# In the editor, fontSize is CSS px inside a scaled A4 canvas. We map px->pt so PDF matches visual size.
# 1200 made font too small; 96dpi (72/96≈0.75) was too big. Use a middle reference so export looks right.
# ~910px reference gives factor ~0.65 (595.28/910).
CANVAS_REFERENCE_WIDTH_PX = 910.0


# Register document editor fonts (Montserrat, Open Sans). Returns dict: font_family_key -> (regular_name, bold_name)
def _register_fonts():
    import os
    result = {}
    fonts_path = os.path.join(os.path.dirname(__file__), "..", "proposals", "assets", "fonts")
    try:
        if os.path.exists(os.path.join(fonts_path, "Montserrat-Regular.ttf")):
            pdfmetrics.registerFont(TTFont("Montserrat", os.path.join(fonts_path, "Montserrat-Regular.ttf")))
            pdfmetrics.registerFont(TTFont("Montserrat-Bold", os.path.join(fonts_path, "Montserrat-Bold.ttf")))
            result["Montserrat"] = ("Montserrat", "Montserrat-Bold")
    except Exception:
        pass
    try:
        open_sans_reg = os.path.join(fonts_path, "OpenSans-Regular.ttf")
        open_sans_bold = os.path.join(fonts_path, "OpenSans-Bold.ttf")
        if os.path.exists(open_sans_reg):
            pdfmetrics.registerFont(TTFont("OpenSans", open_sans_reg))
            if os.path.exists(open_sans_bold):
                pdfmetrics.registerFont(TTFont("OpenSans-Bold", open_sans_bold))
                result["Open Sans"] = ("OpenSans", "OpenSans-Bold")
            else:
                result["Open Sans"] = ("OpenSans", "OpenSans")
        else:
            result["Open Sans"] = ("Helvetica", "Helvetica-Bold")
    except Exception:
        result["Open Sans"] = ("Helvetica", "Helvetica-Bold")
    if "Montserrat" not in result:
        result["Montserrat"] = ("Helvetica", "Helvetica-Bold")
    return result


def _parse_hex_color(hex_str: Optional[str]):
    """Parse #RRGGBB to ReportLab color. Default black if invalid."""
    if not hex_str or not isinstance(hex_str, str):
        return colors.black
    hex_str = hex_str.strip()
    if hex_str.startswith("#") and len(hex_str) == 7:
        try:
            return colors.HexColor(hex_str)
        except Exception:
            pass
    return colors.black


def _wrap_text_to_width(c: canvas.Canvas, text: str, font_name: str, font_size: float, max_width: float) -> list[str]:
    """
    Word-wrap `text` so each line fits within `max_width` (points), using actual font metrics.
    Respects explicit newlines. Returns a list of lines (may include empty strings).
    """
    if text is None:
        return []
    s = str(text).replace("\r\n", "\n")
    if s == "":
        return [""]

    def fits(line: str) -> bool:
        return c.stringWidth(line, font_name, font_size) <= max_width

    def break_long_word(word: str) -> list[str]:
        # Fallback: break a single long word by characters.
        out: list[str] = []
        cur = ""
        for ch in word:
            nxt = cur + ch
            if cur and not fits(nxt):
                out.append(cur)
                cur = ch
            else:
                cur = nxt
        if cur:
            out.append(cur)
        return out or [word]

    lines: list[str] = []
    for para in s.split("\n"):
        if para.strip() == "":
            lines.append("")
            continue
        words = para.split(" ")
        cur = ""
        for w in words:
            if w == "":
                # preserve multi-space runs somewhat
                candidate = (cur + " ") if cur else " "
            else:
                candidate = (cur + " " + w) if cur else w
            if cur and not fits(candidate):
                lines.append(cur)
                cur = w
                if cur and not fits(cur):
                    broken = break_long_word(cur)
                    lines.extend(broken[:-1])
                    cur = broken[-1]
            else:
                cur = candidate
        if cur != "":
            lines.append(cur)
    return lines


def _parse_object_position(pos: Optional[str]) -> tuple[float, float]:
    """
    Parse CSS-like object-position into anchors (x, y) in [0..1].
    x: 0=left, 0.5=center, 1=right
    y: 0=top, 0.5=center, 1=bottom
    Accepts: "50% 0%", "left top", "center", "top", etc.
    """
    if not pos or not isinstance(pos, str):
        return 0.5, 0.5
    tokens = pos.strip().lower().split()
    if not tokens:
        return 0.5, 0.5

    def tok_to_anchor(tok: str, axis: str) -> Optional[float]:
        if tok.endswith("%"):
            try:
                v = float(tok[:-1]) / 100.0
                return max(0.0, min(1.0, v))
            except Exception:
                return None
        if tok in ("left", "l") and axis == "x":
            return 0.0
        if tok in ("right", "r") and axis == "x":
            return 1.0
        if tok in ("top", "t") and axis == "y":
            return 0.0
        if tok in ("bottom", "b") and axis == "y":
            return 1.0
        if tok in ("center", "middle", "c", "m"):
            return 0.5
        return None

    x = None
    y = None
    if len(tokens) == 1:
        # Single keyword can apply to one axis (e.g. "top") or both ("center").
        x = tok_to_anchor(tokens[0], "x")
        y = tok_to_anchor(tokens[0], "y")
        if tokens[0] in ("top", "bottom"):
            x = 0.5
        if tokens[0] in ("left", "right"):
            y = 0.5
    else:
        x = tok_to_anchor(tokens[0], "x")
        y = tok_to_anchor(tokens[1], "y")
        # Handle swapped order like "top left"
        if x is None or y is None:
            x2 = tok_to_anchor(tokens[1], "x")
            y2 = tok_to_anchor(tokens[0], "y")
            if x is None and x2 is not None:
                x = x2
            if y is None and y2 is not None:
                y = y2

    return (x if x is not None else 0.5), (y if y is not None else 0.5)


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


def build_pdf_bytes(db: Session, doc: UserDocument, canvas_width_px: Optional[float] = None) -> bytes:
    """Generate PDF bytes for the given UserDocument."""
    fonts_map = _register_fonts()
    buf = io.BytesIO()
    page_width, page_height = A4  # 595.28 x 841.89 points
    cw = None
    try:
        cw = float(canvas_width_px) if canvas_width_px is not None else None
    except Exception:
        cw = None
    px_to_pt = page_width / (cw if cw and cw > 100 else CANVAS_REFERENCE_WIDTH_PX)

    c = canvas.Canvas(buf, pagesize=A4)
    pages = doc.pages if isinstance(doc.pages, list) else []
    if not pages:
        # Single empty page
        font_name, _ = fonts_map.get("Montserrat", ("Helvetica", "Helvetica-Bold"))
        c.setFont(font_name, 12)
        c.setFillColor(colors.black)
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
                        font_size_px = float(el.get("fontSize") or el.get("font_size", 11) or 11)
                        font_size = max(1.0, font_size_px * px_to_pt)
                        line_height = max(6.0, font_size * 1.2)
                        is_bold = el.get("fontWeight") == "bold"
                        font_family = el.get("fontFamily") or "Montserrat"
                        font_name, font_bold = fonts_map.get(font_family, fonts_map.get("Montserrat", ("Helvetica", "Helvetica-Bold")))
                        active_font = font_bold if is_bold else font_name
                        c.setFont(active_font, font_size)
                        c.setFillColor(_parse_hex_color(el.get("color")))
                        text_align = el.get("textAlign") or "left"
                        vertical_align = el.get("verticalAlign") or "top"
                        lines = _wrap_text_to_width(c, str(content), active_font, font_size, w)
                        # Clip to box height
                        max_lines = int(h // line_height) if h > 0 else 0
                        if max_lines > 0:
                            lines = lines[:max_lines]
                        n = len(lines)
                        if n > 0:
                            ascent = font_size * 0.8
                            descent = font_size * 0.2
                            # baseline of the first (top) line, per vertical alignment
                            if vertical_align == "bottom":
                                baseline_first = y + (n - 1) * line_height + descent
                            elif vertical_align == "center":
                                baseline_first = (
                                    y
                                    + (h / 2.0)
                                    - (ascent - descent) / 2.0
                                    + (n - 1) * (line_height / 2.0)
                                )
                            else:
                                baseline_first = y + h - ascent

                            for i, line in enumerate(lines):
                                line_y = baseline_first - i * line_height
                                if text_align == "center":
                                    tw = c.stringWidth(line, active_font, font_size)
                                    c.drawString(x + (w - tw) / 2.0, line_y, line)
                                elif text_align == "right":
                                    tw = c.stringWidth(line, active_font, font_size)
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
                                    img_w, img_h = pil_im.size
                                    img_buf = io.BytesIO()
                                    pil_im.save(img_buf, format="JPEG", quality=90)
                                    img_buf.seek(0)
                                    reader = ImageReader(img_buf)
                                    fit = (el.get("imageFit") or el.get("image_fit") or "contain").lower()
                                    pos = el.get("imagePosition") or el.get("image_position") or "50% 50%"
                                    ax, ay = _parse_object_position(pos)

                                    # Default to contain to match the editor preview.
                                    if fit == "fill":
                                        c.drawImage(reader, x, y, width=w, height=h)
                                    else:
                                        if not img_w or not img_h or w <= 0 or h <= 0:
                                            c.drawImage(reader, x, y, width=w, height=h)
                                        else:
                                            if fit == "cover":
                                                scale = max(w / img_w, h / img_h)
                                            else:
                                                # contain / none (treated as contain for now)
                                                scale = min(w / img_w, h / img_h)
                                            dw = img_w * scale
                                            dh = img_h * scale
                                            dx = (w - dw) * ax
                                            # ay: 0=top, 1=bottom; PDF y grows up => invert for placement inside box
                                            dy = (h - dh) * (1.0 - ay)
                                            draw_x = x + dx
                                            draw_y = y + dy

                                            if fit == "cover":
                                                # Clip to the element box, then draw oversized image.
                                                p = c.beginPath()
                                                p.rect(x, y, w, h)
                                                c.saveState()
                                                c.clipPath(p, stroke=0, fill=0)
                                                c.drawImage(reader, draw_x, draw_y, width=dw, height=dh)
                                                c.restoreState()
                                            else:
                                                c.drawImage(reader, draw_x, draw_y, width=dw, height=dh)
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
                    font_size_px = float(area.get("font_size", 11) or 11)
                    font_size = max(1.0, font_size_px * px_to_pt)
                    _fn, _fb = fonts_map.get("Montserrat", ("Helvetica", "Helvetica-Bold"))
                    c.setFont(_fb if (area.get("type") == "title") else _fn, font_size)
                    c.setFillColor(colors.black)
                    lines = _wrap_text_to_width(c, str(text), _fb if (area.get("type") == "title") else _fn, font_size, w)
                    lines = lines[: int(h / (font_size * 1.2)) or 1]
                    for i, line in enumerate(lines):
                        if i * (font_size * 1.2) >= h:
                            break
                        c.drawString(x, y - i * (font_size * 1.2), line)

            c.showPage()

    c.save()
    buf.seek(0)
    return buf.read()
