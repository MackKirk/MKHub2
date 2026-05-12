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
from reportlab.pdfbase.pdfmetrics import getAscentDescent
from reportlab.pdfbase.ttfonts import TTFont
from sqlalchemy.orm import Session
import httpx

from ..models.models import DocumentTemplate, UserDocument, FileObject
from ..config import settings
from ..storage.provider import StorageProvider
from ..storage.local_provider import LocalStorageProvider
from ..storage.blob_provider import BlobStorageProvider


# In the editor, fontSize is stored in reference CSS px and preview scales it by
# (rendered canvas width / 910). PDF export must use the same reference width,
# not the user's current zoom/window size, otherwise fonts drift from preview.
CANVAS_REFERENCE_WIDTH_PX = 910.0
TEXT_INNER_PADDING_PX = 4.0
CSS_NORMAL_LINE_HEIGHT = 1.2


def _font_ascent_descent(font_name: str, font_size: float) -> tuple[float, float]:
    """Return font ascent/descent in points, with a conservative fallback."""
    try:
        ascent, descent = getAscentDescent(font_name, font_size)
        if ascent:
            return float(ascent), float(descent)
    except Exception:
        pass
    return font_size * 0.8, -font_size * 0.2


# Register document editor fonts. Returns dict: family -> (regular, bold, italic, bold_italic)
def _register_fonts():
    import os
    result = {}
    fonts_path = os.path.join(os.path.dirname(__file__), "..", "proposals", "assets", "fonts")

    def _try_register(name: str, path: str) -> bool:
        try:
            if os.path.exists(path):
                pdfmetrics.registerFont(TTFont(name, path))
                return True
        except Exception:
            pass
        return False

    # Montserrat
    try:
        reg_ok = _try_register("Montserrat", os.path.join(fonts_path, "Montserrat-Regular.ttf"))
        bold_ok = _try_register("Montserrat-Bold", os.path.join(fonts_path, "Montserrat-Bold.ttf"))
        italic_ok = _try_register("Montserrat-Italic", os.path.join(fonts_path, "Montserrat-Italic.ttf"))
        bolditalic_ok = _try_register("Montserrat-BoldItalic", os.path.join(fonts_path, "Montserrat-BoldItalic.ttf"))
        if reg_ok:
            result["Montserrat"] = (
                "Montserrat",
                "Montserrat-Bold" if bold_ok else "Montserrat",
                "Montserrat-Italic" if italic_ok else "Montserrat",
                "Montserrat-BoldItalic" if bolditalic_ok else ("Montserrat-Bold" if bold_ok else "Montserrat"),
            )
    except Exception:
        pass

    # Open Sans
    try:
        reg_ok = _try_register("OpenSans", os.path.join(fonts_path, "OpenSans-Regular.ttf"))
        bold_ok = _try_register("OpenSans-Bold", os.path.join(fonts_path, "OpenSans-Bold.ttf"))
        italic_ok = _try_register("OpenSans-Italic", os.path.join(fonts_path, "OpenSans-Italic.ttf"))
        bolditalic_ok = _try_register("OpenSans-BoldItalic", os.path.join(fonts_path, "OpenSans-BoldItalic.ttf"))
        if reg_ok:
            result["Open Sans"] = (
                "OpenSans",
                "OpenSans-Bold" if bold_ok else "OpenSans",
                "OpenSans-Italic" if italic_ok else "OpenSans",
                "OpenSans-BoldItalic" if bolditalic_ok else ("OpenSans-Bold" if bold_ok else "OpenSans"),
            )
        else:
            result["Open Sans"] = ("Helvetica", "Helvetica-Bold", "Helvetica-Oblique", "Helvetica-BoldOblique")
    except Exception:
        result["Open Sans"] = ("Helvetica", "Helvetica-Bold", "Helvetica-Oblique", "Helvetica-BoldOblique")

    if "Montserrat" not in result:
        result["Montserrat"] = ("Helvetica", "Helvetica-Bold", "Helvetica-Oblique", "Helvetica-BoldOblique")
    return result


def _pick_font(fonts_map: dict, family: str, bold: bool, italic: bool) -> str:
    """Select the correct font variant name for a given family + bold + italic combination."""
    entry = fonts_map.get(family) or fonts_map.get("Montserrat", ("Helvetica", "Helvetica-Bold", "Helvetica-Oblique", "Helvetica-BoldOblique"))
    # entry is (regular, bold, italic, bold_italic)
    if bold and italic:
        return entry[3] if len(entry) > 3 else entry[1]
    if bold:
        return entry[1] if len(entry) > 1 else entry[0]
    if italic:
        return entry[2] if len(entry) > 2 else entry[0]
    return entry[0]


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
                # A word that starts a fresh line may itself be too long to fit
                if cur and not fits(cur):
                    broken = break_long_word(cur)
                    lines.extend(broken[:-1])
                    cur = broken[-1]
        if cur != "":
            if not fits(cur):
                broken = break_long_word(cur)
                lines.extend(broken[:-1])
                cur = broken[-1]
            if cur != "":
                lines.append(cur)
    return lines


def _prepare_pdf_text_rows(
    c: canvas.Canvas,
    content: str,
    list_style: Optional[str],
    line_list_styles: Optional[list],
    active_font: str,
    font_size: float,
    text_w: float,
) -> tuple[list[list[tuple[float, str]]], int]:
    """
    Build rows for PDF text: each row is a baseline with one or more (x_offset_from_text_start, fragment) segments.
    Plain text uses a single segment per row; list styles use prefix + body segments.
    Returns (rows, total_visual_lines).
    """
    raw = str(content).replace("\r\n", "\n")
    fallback_ls = (list_style or "none").strip().lower()
    items = raw.split("\n")
    per_line_styles = []
    if isinstance(line_list_styles, list):
        for idx, _item in enumerate(items):
            value = line_list_styles[idx] if idx < len(line_list_styles) else None
            style = str(value or "none").strip().lower()
            per_line_styles.append(style if style in ("bullet", "numbered", "lettered") else "none")
    elif fallback_ls in ("bullet", "numbered", "lettered"):
        per_line_styles = [fallback_ls for _item in items]

    if any(style in ("bullet", "numbered", "lettered") for style in per_line_styles):
        rows_out: list[list[tuple[float, str]]] = []
        gap = max(font_size * 0.35, 3.0)
        for idx, item in enumerate(items):
            ls = per_line_styles[idx] if idx < len(per_line_styles) else "none"
            if ls not in ("bullet", "numbered", "lettered"):
                wrapped_plain = _wrap_text_to_width(c, item, active_font, font_size, text_w) or [""]
                rows_out.extend([[(0.0, ln)] for ln in wrapped_plain])
                continue
            if ls == "bullet":
                prefix = "• "
            elif ls == "numbered":
                n = 1
                j = idx - 1
                while j >= 0 and j < len(per_line_styles) and per_line_styles[j] == ls:
                    n += 1
                    j -= 1
                prefix = f"{n}. "
            else:
                n = 1
                j = idx - 1
                while j >= 0 and j < len(per_line_styles) and per_line_styles[j] == ls:
                    n += 1
                    j -= 1
                prefix = f"{chr(ord('a') + n - 1)}. " if n <= 26 else f"{n}. "
            pw = c.stringWidth(prefix, active_font, font_size)
            body_w = max(1.0, text_w - pw - gap)
            wrapped = _wrap_text_to_width(c, item, active_font, font_size, body_w)
            if not wrapped:
                wrapped = [""]
            body_indent = pw + gap
            for j, wl in enumerate(wrapped):
                if j == 0:
                    rows_out.append([(0.0, prefix), (body_indent, wl)])
                else:
                    rows_out.append([(body_indent, wl)])
        return rows_out, len(rows_out)
    # Plain paragraph(s): existing wrap behavior
    flat = _wrap_text_to_width(c, raw, active_font, font_size, text_w)
    rows_plain = [[(0.0, ln)] for ln in flat]
    return rows_plain, len(rows_plain)


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
    # Keep the optional argument for API compatibility, but do not let runtime
    # viewport/zoom width affect PDF layout.
    _ = canvas_width_px
    px_to_pt = page_width / CANVAS_REFERENCE_WIDTH_PX
    text_padding = TEXT_INNER_PADDING_PX * px_to_pt

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
                        line_height = max(6.0, font_size * CSS_NORMAL_LINE_HEIGHT)
                        is_bold = el.get("fontWeight") == "bold"
                        is_italic = el.get("fontStyle") == "italic"
                        font_family = el.get("fontFamily") or "Montserrat"
                        active_font = _pick_font(fonts_map, font_family, is_bold, is_italic)
                        el_color = _parse_hex_color(el.get("color"))
                        text_align = el.get("textAlign") or "left"
                        vertical_align = el.get("verticalAlign") or "top"
                        text_x = x + text_padding
                        text_y = y + text_padding
                        text_w = max(1.0, w - (text_padding * 2.0))
                        text_h = max(0.0, h - (text_padding * 2.0))

                        rich_lines = el.get("richLines") or el.get("rich_lines")
                        line_text_aligns = el.get("lineTextAligns") or el.get("line_text_aligns") or []

                        if rich_lines and isinstance(rich_lines, list):
                            # ── Rich text path: per-run font/color ─────────────────────
                            list_style = el.get("listStyle") or el.get("list_style")
                            line_list_styles_raw = el.get("lineListStyles") or el.get("line_list_styles")

                            # Build flat rows: each row = list of (x_offset, fragment, font_name, font_size_pt, color)
                            RichRow = list  # list of (x_off, text, font, size, color)
                            all_rows: list[RichRow] = []
                            line_aligns_out: list[str] = []

                            for li, line_runs in enumerate(rich_lines):
                                if not isinstance(line_runs, list):
                                    continue
                                plain_text = "".join(r.get("text", "") if isinstance(r, dict) else str(r) for r in line_runs)
                                ls_val = None
                                if isinstance(line_list_styles_raw, list) and li < len(line_list_styles_raw):
                                    ls_val = str(line_list_styles_raw[li] or "none").strip().lower()
                                elif list_style:
                                    ls_val = str(list_style).strip().lower()
                                if ls_val not in ("bullet", "numbered", "lettered"):
                                    ls_val = "none"

                                line_align = text_align
                                if li < len(line_text_aligns) and line_text_aligns[li]:
                                    line_align = str(line_text_aligns[li])

                                # Build run segments for this line
                                run_segments: list[tuple[str, str, float, object]] = []
                                for run in line_runs:
                                    if not isinstance(run, dict):
                                        continue
                                    run_text = run.get("text", "")
                                    if not run_text:
                                        continue
                                    r_bold = run.get("bold") if run.get("bold") is not None else is_bold
                                    r_italic = run.get("italic") if run.get("italic") is not None else is_italic
                                    r_family = run.get("fontFamily") or font_family
                                    r_font_px = float(run.get("fontSize") or font_size_px)
                                    r_font_pt = max(1.0, r_font_px * px_to_pt)
                                    r_font_name = _pick_font(fonts_map, r_family, bool(r_bold), bool(r_italic))
                                    r_color = _parse_hex_color(run.get("color")) if run.get("color") else el_color
                                    run_segments.append((run_text, r_font_name, r_font_pt, r_color))

                                if not run_segments:
                                    # Preserve blank lines as empty rows so they occupy vertical space
                                    all_rows.append([(0.0, "", active_font, font_size, el_color)])
                                    line_aligns_out.append(line_align)
                                    continue

                                # Word-wrap each run while keeping track of current x offset
                                # For simplicity: wrap the whole plain line with the first run's font, then assign runs proportionally
                                # (full per-run wrapping is complex; use element font for wrap measurement)
                                c.setFont(active_font, font_size)
                                wrapped_lines = _wrap_text_to_width(c, plain_text, active_font, font_size, text_w) or [""]

                                # Build rows: for each wrapped line, find which runs contribute
                                run_cursor = 0  # char position in plain_text
                                char_cursor = 0
                                for wl in wrapped_lines:
                                    row_segs: list[tuple[float, str, str, float, object]] = []
                                    x_off = 0.0
                                    wl_len = len(wl)
                                    wl_remain = wl_len
                                    seg_i = 0
                                    seg_pos = run_cursor  # current position within run segments

                                    # Distribute characters of this wrapped line across run segments
                                    for seg_idx, (seg_text, seg_font, seg_pt, seg_color) in enumerate(run_segments):
                                        if seg_pos >= char_cursor + wl_len:
                                            break
                                        seg_start_in_line = max(0, seg_pos - char_cursor)
                                        # How many chars of this segment fall in this line?
                                        seg_total = len(seg_text)
                                        taken = min(seg_total - max(0, char_cursor - seg_pos), wl_remain)
                                        if taken <= 0:
                                            seg_pos += seg_total
                                            continue
                                        frag_text = seg_text[max(0, char_cursor - seg_pos):max(0, char_cursor - seg_pos) + taken]
                                        if frag_text:
                                            row_segs.append((x_off, frag_text, seg_font, seg_pt, seg_color))
                                            x_off += c.stringWidth(frag_text, seg_font, seg_pt)
                                        wl_remain -= taken
                                        seg_pos += seg_total
                                        if wl_remain <= 0:
                                            break

                                    if not row_segs:
                                        row_segs = [(0.0, wl, active_font, font_size, el_color)]

                                    # Add list prefix for first wrapped line of each content line
                                    if wrapped_lines.index(wl) == 0 and ls_val in ("bullet", "numbered", "lettered"):
                                        # Count ordinal
                                        ordinal = 1
                                        for prev_li in range(li):
                                            prev_ls = None
                                            if isinstance(line_list_styles_raw, list) and prev_li < len(line_list_styles_raw):
                                                prev_ls = str(line_list_styles_raw[prev_li] or "none").strip().lower()
                                            elif list_style:
                                                prev_ls = str(list_style).strip().lower()
                                            if prev_ls == ls_val:
                                                ordinal += 1
                                        if ls_val == "bullet":
                                            prefix = "• "
                                        elif ls_val == "numbered":
                                            prefix = f"{ordinal}. "
                                        else:
                                            prefix = f"{chr(ord('a') + ordinal - 1)}. " if ordinal <= 26 else f"{ordinal}. "
                                        pw = c.stringWidth(prefix, active_font, font_size)
                                        shifted = [(off + pw + max(font_size * 0.35, 3.0), t, fn, fp, fc) for off, t, fn, fp, fc in row_segs]
                                        row_segs = [(0.0, prefix, active_font, font_size, el_color)] + shifted

                                    all_rows.append(row_segs)
                                    line_aligns_out.append(line_align)
                                    char_cursor += wl_len

                            max_lines = int(text_h // line_height) if text_h > 0 else 0
                            if max_lines > 0 and len(all_rows) > max_lines:
                                all_rows = all_rows[:max_lines]
                                line_aligns_out = line_aligns_out[:max_lines]

                            n = len(all_rows)
                            if n > 0:
                                ascent, descent = _font_ascent_descent(active_font, font_size)
                                half_leading = max(0.0, (line_height - font_size) / 2.0)
                                first_line_offset = half_leading + ascent
                                last_line_descent = half_leading + abs(descent)
                                block_h = (n - 1) * line_height + first_line_offset + last_line_descent
                                if vertical_align == "bottom":
                                    baseline_first = text_y + block_h - first_line_offset
                                elif vertical_align == "center":
                                    block_top = text_y + ((text_h + block_h) / 2.0)
                                    baseline_first = block_top - first_line_offset
                                else:
                                    baseline_first = text_y + text_h - first_line_offset

                                for i, row_segs in enumerate(all_rows):
                                    line_y = baseline_first - i * line_height
                                    la = line_aligns_out[i] if i < len(line_aligns_out) else text_align
                                    row_w = sum(c.stringWidth(t, fn, fp) for _, t, fn, fp, _ in row_segs)
                                    if la == "center":
                                        line_shift = (text_w - row_w) / 2.0
                                    elif la == "right":
                                        line_shift = text_w - row_w
                                    else:
                                        line_shift = 0.0
                                    for x_off, frag, fnt, fsz, clr in row_segs:
                                        c.setFont(fnt, fsz)
                                        c.setFillColor(clr)
                                        c.drawString(text_x + line_shift + x_off, line_y, frag)
                        else:
                            # ── Plain text path (legacy / no rich runs) ─────────────────
                            c.setFont(active_font, font_size)
                            c.setFillColor(el_color)
                            list_style = el.get("listStyle") or el.get("list_style")
                            line_list_styles = el.get("lineListStyles") or el.get("line_list_styles")
                            rows, _n_all = _prepare_pdf_text_rows(
                                c, str(content), list_style, line_list_styles, active_font, font_size, text_w
                            )
                            max_lines = int(text_h // line_height) if text_h > 0 else 0
                            if max_lines > 0 and len(rows) > max_lines:
                                rows = rows[:max_lines]
                            n = len(rows)
                            if n > 0:
                                ascent, descent = _font_ascent_descent(active_font, font_size)
                                half_leading = max(0.0, (line_height - font_size) / 2.0)
                                first_line_offset = half_leading + ascent
                                last_line_descent = half_leading + abs(descent)
                                block_h = (n - 1) * line_height + first_line_offset + last_line_descent
                                if vertical_align == "bottom":
                                    baseline_first = text_y + block_h - first_line_offset
                                elif vertical_align == "center":
                                    block_top = text_y + ((text_h + block_h) / 2.0)
                                    baseline_first = block_top - first_line_offset
                                else:
                                    baseline_first = text_y + text_h - first_line_offset

                                for i, row in enumerate(rows):
                                    line_y = baseline_first - i * line_height
                                    tw_row = 0.0
                                    for off, frag in row:
                                        tw_row = max(tw_row, off + c.stringWidth(frag, active_font, font_size))
                                    if text_align == "center":
                                        shift = (text_w - tw_row) / 2.0
                                    elif text_align == "right":
                                        shift = text_w - tw_row
                                    else:
                                        shift = 0.0
                                    for off, frag in row:
                                        c.drawString(text_x + shift + off, line_y, frag)
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
