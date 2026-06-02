"""
Build PDF from UserDocument: one page per entry in pages, each with template background + areas.
"""
import io
import uuid
from typing import Optional

from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.utils import simpleSplit
from reportlab.platypus import Paragraph
from reportlab.pdfgen import canvas
from xml.sax.saxutils import escape
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
from ..proposals.pdf_image_optimizer import pil_image_to_jpeg_bytes_for_document_pdf


# In the editor, fontSize is stored in reference CSS px and preview scales it by
# (rendered canvas width / 910). PDF export must use the same reference width,
# not the user's current zoom/window size, otherwise fonts drift from preview.
CANVAS_REFERENCE_WIDTH_PX = 910.0
TEXT_INNER_PADDING_PX = 4.0
CSS_NORMAL_LINE_HEIGHT = 1.2

_FONTS_MAP: Optional[dict] = None


def _font_ascent_descent(font_name: str, font_size: float) -> tuple[float, float]:
    """Return font ascent/descent in points, with a conservative fallback."""
    try:
        ascent, descent = getAscentDescent(font_name, font_size)
        if ascent:
            return float(ascent), float(descent)
    except Exception:
        pass
    return font_size * 0.8, -font_size * 0.2


def _font_line_height_pt(font_name: str, font_size_pt: float) -> float:
    """
    Line box height to match the editor (min-h 1.2em rows + browser line-height: normal).
    Browsers typically use a line box taller than 1.2× em for Montserrat/Open Sans.
    """
    ascent, descent = _font_ascent_descent(font_name, font_size_pt)
    content_h = ascent + abs(descent)
    # normal ≈ 1.2–1.35× em; use the larger so PDF text does not sit high vs the preview.
    return max(font_size_pt * 1.33, content_h * 1.12, font_size_pt * CSS_NORMAL_LINE_HEIGHT)


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

    # Register family aliases for ReportLab (optional; helps some APIs).
    try:
        for family, entry in result.items():
            reg, bold, italic, bolditalic = (entry + (entry[0],))[:4]
            if reg in pdfmetrics.getRegisteredFontNames():
                pdfmetrics.registerFontFamily(
                    family.replace(" ", ""),
                    normal=reg,
                    bold=bold,
                    italic=italic,
                    boldItalic=bolditalic,
                )
    except Exception:
        pass

    return result


def _get_fonts_map() -> dict:
    global _FONTS_MAP
    if _FONTS_MAP is None:
        _FONTS_MAP = _register_fonts()
    return _FONTS_MAP


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


def _wrap_text_to_width(
    _c: canvas.Canvas,
    text: str,
    font_name: str,
    font_size: float,
    max_width: float,
) -> list[str]:
    """
    Word-wrap at word boundaries (never splits words mid-character).
    Uses ReportLab simpleSplit — same strategy as proposals PDFs.
    """
    if text is None:
        return []
    s = str(text).replace("\r\n", "\n")
    if s == "":
        return [""]
    if max_width <= 0:
        return [s]

    lines: list[str] = []
    for para in s.split("\n"):
        if para.strip() == "":
            lines.append("")
            continue
        wrapped = simpleSplit(para, font_name, font_size, max_width)
        lines.extend(wrapped if wrapped else [""])
    return lines


def _clip_text_area(c: canvas.Canvas, text_x: float, text_y: float, text_w: float, text_h: float) -> bool:
    """Clip drawing to the inner text box (matches preview overflow-hidden). Returns True if clipped."""
    if text_w <= 0 or text_h <= 0:
        return False
    p = c.beginPath()
    p.rect(text_x, text_y, text_w, text_h)
    c.saveState()
    c.clipPath(p, stroke=0, fill=0)
    return True


def _color_to_hex_str(clr) -> str:
    try:
        if hasattr(clr, "hexval"):
            hv = clr.hexval()
            if isinstance(hv, str):
                if hv.startswith("0x"):
                    return "#" + hv[2:].upper()
                if hv.startswith("#"):
                    return hv.upper()
    except Exception:
        pass
    return "#000000"


def _text_align_to_reportlab(align: Optional[str]) -> int:
    a = (align or "left").strip().lower()
    if a == "center":
        return TA_CENTER
    if a == "right":
        return TA_RIGHT
    return TA_LEFT


def _normalize_rich_lines_for_content(content: str, rich_lines: Optional[list]) -> list[list[dict]]:
    """
    Align richLines with content newlines. When many rich rows map to one content
    paragraph (soft-wrap artifact), merge them so PDF wraps like the browser block.
    """
    content_norm = str(content or "").replace("\r\n", "\n")
    content_lines = content_norm.split("\n") if content_norm else [""]
    if not rich_lines or not isinstance(rich_lines, list):
        return [[{"text": ln}] if ln else [{"text": ""}] for ln in content_lines]

    def runs_plain(runs: list) -> str:
        return "".join(r.get("text", "") if isinstance(r, dict) else str(r) for r in runs)

    flat_rich = runs_plain([r for rl in rich_lines if isinstance(rl, list) for r in rl])
    content_flat = content_norm.replace("\n", "")

    if len(content_lines) == 1 and len(rich_lines) > 1 and flat_rich == content_flat:
        merged: list[dict] = []
        for rl in rich_lines:
            if isinstance(rl, list):
                merged.extend([r for r in rl if isinstance(r, dict)])
        return [merged] if merged else [[{"text": content_norm}]]

    if len(rich_lines) == len(content_lines):
        return [
            rl if isinstance(rl, list) else [{"text": content_lines[i]}]
            for i, rl in enumerate(rich_lines)
        ]

    return [[{"text": ln}] if ln else [{"text": ""}] for ln in content_lines]


def _run_to_markup_fragment(
    run: dict,
    fonts_map: dict,
    font_family: str,
    font_size_px: float,
    px_to_pt: float,
    is_bold: bool,
    is_italic: bool,
    default_color,
) -> str:
    text = run.get("text", "")
    if not text:
        return ""
    safe = escape(text).replace("\n", " ")
    r_bold = run.get("bold") if run.get("bold") is not None else is_bold
    r_italic = run.get("italic") if run.get("italic") is not None else is_italic
    r_family = run.get("fontFamily") or font_family
    r_font_px = float(run.get("fontSize") or font_size_px)
    r_font_pt = max(1.0, r_font_px * px_to_pt)
    r_font_name = _pick_font(fonts_map, r_family, bool(r_bold), bool(r_italic))
    r_color = _parse_hex_color(run.get("color")) if run.get("color") else default_color
    hc = _color_to_hex_str(r_color)
    inner = safe
    if r_bold:
        inner = f"<b>{inner}</b>"
    if r_italic:
        inner = f"<i>{inner}</i>"
    return f'<font name="{r_font_name}" color="{hc}" size="{r_font_pt:.2f}">{inner}</font>'


# (font_name, font_size_pt, color, text)
TextSegment = tuple[str, float, object, str]


def _runs_to_segments(
    runs: Optional[list],
    line_text: str,
    fonts_map: dict,
    font_family: str,
    font_size_px: float,
    px_to_pt: float,
    is_bold: bool,
    is_italic: bool,
    default_color,
) -> list[TextSegment]:
    """Build drawable segments for one editor content line (preserves spaces)."""
    line_norm = (line_text or "").replace("\r\n", "\n")
    if runs:
        runs_plain = "".join(r.get("text", "") if isinstance(r, dict) else str(r) for r in runs)
        if runs_plain != line_norm:
            fn = _pick_font(fonts_map, font_family, is_bold, is_italic)
            pt = max(1.0, font_size_px * px_to_pt)
            return [(fn, pt, default_color, line_norm)]
        out: list[TextSegment] = []
        for r in runs:
            if not isinstance(r, dict):
                continue
            text = r.get("text", "")
            if not text:
                continue
            r_bold = r.get("bold") if r.get("bold") is not None else is_bold
            r_italic = r.get("italic") if r.get("italic") is not None else is_italic
            r_family = r.get("fontFamily") or font_family
            r_font_px = float(r.get("fontSize") or font_size_px)
            r_font_pt = max(1.0, r_font_px * px_to_pt)
            r_font_name = _pick_font(fonts_map, r_family, bool(r_bold), bool(r_italic))
            r_color = _parse_hex_color(r.get("color")) if r.get("color") else default_color
            out.append((r_font_name, r_font_pt, r_color, text.replace("\n", " ")))
        return out or [(_pick_font(fonts_map, font_family, is_bold, is_italic), max(1.0, font_size_px * px_to_pt), default_color, "")]
    fn = _pick_font(fonts_map, font_family, is_bold, is_italic)
    pt = max(1.0, font_size_px * px_to_pt)
    return [(fn, pt, default_color, line_norm)]


def _measure_segments(c: canvas.Canvas, segments: list[TextSegment]) -> float:
    total = 0.0
    for font_name, size, _color, text in segments:
        if text:
            total += c.stringWidth(text, font_name, size)
    return total


def _line_box_metrics(
    segments: list[TextSegment],
    fonts_map: dict,
    font_family: str,
    font_size_px: float,
    px_to_pt: float,
    is_bold: bool,
    is_italic: bool,
    fallback_pt: float,
) -> tuple[float, float, float, float]:
    """Ascent, |descent|, line height, and half-leading (pt) — matches editor min-h 1.2em + CSS line box."""
    max_pt = fallback_pt
    max_ascent = 0.0
    max_descent = 0.0
    fallback_font = _pick_font(fonts_map, font_family, is_bold, is_italic)
    for font_name, size, _color, text in segments:
        if size:
            max_pt = max(max_pt, size)
        a, d = _font_ascent_descent(font_name or fallback_font, size or fallback_pt)
        max_ascent = max(max_ascent, a)
        max_descent = max(max_descent, abs(d))
    if max_ascent <= 0:
        max_ascent, max_descent = _font_ascent_descent(fallback_font, max_pt)
        max_descent = abs(max_descent)
    dominant_font = fallback_font
    for font_name, size, _color, text in segments:
        if text:
            dominant_font = font_name or dominant_font
            break
    leading = max(
        6.0,
        _font_line_height_pt(dominant_font, max_pt),
        max_ascent + max_descent + 0.5,
    )
    half_leading = max(0.0, (leading - max_ascent - max_descent) / 2.0)
    return max_ascent, max_descent, leading, half_leading


def _draw_segments_at(c: canvas.Canvas, x: float, baseline_y: float, segments: list[TextSegment]) -> None:
    cx = x
    for font_name, size, color, text in segments:
        if not text:
            continue
        c.setFont(font_name, size)
        c.setFillColor(color)
        c.drawString(cx, baseline_y, text)
        cx += c.stringWidth(text, font_name, size)


def _aligned_line_start_x(
    box_x: float,
    box_w: float,
    line_w: float,
    align: str,
    left_indent: float = 0.0,
) -> float:
    avail_w = max(1.0, box_w - left_indent)
    a = (align or "left").strip().lower()
    if a == "center":
        return box_x + left_indent + max(0.0, (avail_w - line_w) / 2.0)
    if a == "right":
        return box_x + left_indent + max(0.0, avail_w - line_w)
    return box_x + left_indent


def _tokenize_segments_for_wrap(segments: list[TextSegment]) -> list[TextSegment]:
    """Split segments into word/whitespace tokens (whitespace preserved)."""
    import re

    tokens: list[TextSegment] = []
    for font_name, size, color, text in segments:
        if not text:
            continue
        for m in re.finditer(r"\s+|\S+", text):
            tokens.append((font_name, size, color, m.group()))
    return tokens


def _break_segment_to_width(
    c: canvas.Canvas, font_name: str, size: float, color, text: str, max_width: float
) -> list[TextSegment]:
    if not text:
        return []
    if c.stringWidth(text, font_name, size) <= max_width:
        return [(font_name, size, color, text)]
    chunks: list[TextSegment] = []
    buf = ""
    for ch in text:
        trial = buf + ch
        if buf and c.stringWidth(trial, font_name, size) > max_width:
            chunks.append((font_name, size, color, buf))
            buf = ch
        else:
            buf = trial
    if buf:
        chunks.append((font_name, size, color, buf))
    return chunks


def _wrap_segments_to_visual_rows(
    c: canvas.Canvas, segments: list[TextSegment], max_width: float
) -> list[list[TextSegment]]:
    """Wrap like editor `whitespace-pre-wrap` + `break-words` (per content line)."""
    if max_width <= 0:
        return [segments]
    if _measure_segments(c, segments) <= max_width:
        return [segments]

    tokens = _tokenize_segments_for_wrap(segments)
    if not tokens:
        return [segments]

    rows: list[list[TextSegment]] = []
    current: list[TextSegment] = []
    current_w = 0.0

    def flush() -> None:
        nonlocal current, current_w
        if current:
            rows.append(current)
            current = []
            current_w = 0.0

    for font_name, size, color, token in tokens:
        tw = c.stringWidth(token, font_name, size) if token else 0.0
        if tw > max_width:
            flush()
            for piece in _break_segment_to_width(c, font_name, size, color, token, max_width):
                rows.append([piece])
            continue
        if current and current_w + tw > max_width + 0.5:
            flush()
        if not current:
            current = [(font_name, size, color, token)]
            current_w = tw
        else:
            last = current[-1]
            if last[0] == font_name and last[1] == size and last[2] == color:
                current[-1] = (font_name, size, color, last[3] + token)
            else:
                current.append((font_name, size, color, token))
            current_w += tw
    flush()
    return rows or [segments]


def _list_prefix_segment(
    c: canvas.Canvas,
    ls_val: str,
    ordinal: int,
    fonts_map: dict,
    font_family: str,
    font_size_px: float,
    px_to_pt: float,
    is_bold: bool,
    is_italic: bool,
    default_color,
) -> tuple[Optional[TextSegment], float]:
    if ls_val not in ("bullet", "numbered", "lettered"):
        return None, 0.0
    active_font = _pick_font(fonts_map, font_family, is_bold, is_italic)
    font_size = max(1.0, font_size_px * px_to_pt)
    if ls_val == "bullet":
        prefix = "\u2022 "
    elif ls_val == "numbered":
        prefix = f"{ordinal}. "
    else:
        prefix = f"{chr(ord('a') + ordinal - 1)}. " if ordinal <= 26 else f"{ordinal}. "
    gap = max(font_size * 0.35, 3.0)
    pw = c.stringWidth(prefix, active_font, font_size)
    return (active_font, font_size, default_color, prefix), pw + gap


def _runs_to_paragraph_markup(
    runs: Optional[list],
    line_text: str,
    fonts_map: dict,
    font_family: str,
    font_size_px: float,
    px_to_pt: float,
    is_bold: bool,
    is_italic: bool,
    default_color,
) -> str:
    line_norm = line_text.replace("\r\n", "\n")
    if not runs:
        return escape(line_norm) if line_norm else "&nbsp;"
    runs_plain = "".join(r.get("text", "") if isinstance(r, dict) else str(r) for r in runs)
    if runs_plain != line_norm:
        fn = _pick_font(fonts_map, font_family, is_bold, is_italic)
        pt = max(1.0, font_size_px * px_to_pt)
        hc = _color_to_hex_str(default_color)
        safe = escape(line_norm) if line_norm else "&nbsp;"
        inner = safe
        if is_bold:
            inner = f"<b>{inner}</b>"
        if is_italic:
            inner = f"<i>{inner}</i>"
        return f'<font name="{fn}" color="{hc}" size="{pt:.2f}">{inner}</font>'
    parts = [
        _run_to_markup_fragment(
            r, fonts_map, font_family, font_size_px, px_to_pt, is_bold, is_italic, default_color
        )
        for r in runs
        if isinstance(r, dict)
    ]
    joined = "".join(parts)
    return joined if joined.strip() else "&nbsp;"


def _draw_text_in_box(
    c: canvas.Canvas,
    *,
    content: str,
    rich_lines: Optional[list],
    fonts_map: dict,
    box_x: float,
    box_y: float,
    box_w: float,
    box_h: float,
    font_size_px: float,
    px_to_pt: float,
    font_family: str,
    is_bold: bool,
    is_italic: bool,
    el_color,
    text_align: str,
    vertical_align: str,
    list_style: Optional[str],
    line_list_styles_raw: Optional[list],
    line_text_aligns: Optional[list],
) -> None:
    """
    Draw text to match the document editor preview:
    one row per content newline, whitespace preserved, per-line alignment,
    wrap only when a line exceeds the box width (like whitespace-pre-wrap + break-words).
    """
    if box_w <= 0 or box_h <= 0:
        return

    pad = TEXT_INNER_PADDING_PX * px_to_pt
    text_x = box_x + pad
    text_w = max(1.0, box_w - (pad * 2.0))
    text_inner_h = max(0.0, box_h - (pad * 2.0))
    if text_w <= 0 or text_inner_h <= 0:
        return

    font_size_pt = max(1.0, font_size_px * px_to_pt)
    content_norm = str(content or "").replace("\r\n", "\n")
    content_lines = content_norm.split("\n") if content_norm else [""]
    normalized_rich = _normalize_rich_lines_for_content(content_norm, rich_lines)

    visual_rows: list[tuple[list[TextSegment], float, float, float, str, float]] = []

    for li, line_text in enumerate(content_lines):
        runs = normalized_rich[li] if li < len(normalized_rich) else None
        ls_val = "none"
        if isinstance(line_list_styles_raw, list) and li < len(line_list_styles_raw):
            ls_val = str(line_list_styles_raw[li] or "none").strip().lower()
        elif list_style:
            ls_val = str(list_style or "none").strip().lower()
        if ls_val not in ("bullet", "numbered", "lettered"):
            ls_val = "none"

        line_align = text_align
        if isinstance(line_text_aligns, list) and li < len(line_text_aligns) and line_text_aligns[li]:
            line_align = str(line_text_aligns[li])

        segments = _runs_to_segments(
            runs,
            line_text,
            fonts_map,
            font_family,
            font_size_px,
            px_to_pt,
            is_bold,
            is_italic,
            el_color,
        )

        ordinal = 1
        if ls_val in ("bullet", "numbered", "lettered"):
            for prev_li in range(li):
                prev_ls = "none"
                if isinstance(line_list_styles_raw, list) and prev_li < len(line_list_styles_raw):
                    prev_ls = str(line_list_styles_raw[prev_li] or "none").strip().lower()
                elif list_style:
                    prev_ls = str(list_style).strip().lower()
                if prev_ls == ls_val:
                    ordinal += 1

        prefix_seg, list_indent = _list_prefix_segment(
            c,
            ls_val,
            ordinal,
            fonts_map,
            font_family,
            font_size_px,
            px_to_pt,
            is_bold,
            is_italic,
            el_color,
        )
        body_w = max(1.0, text_w - list_indent)
        wrapped = _wrap_segments_to_visual_rows(c, segments, body_w)

        for wi, row_segments in enumerate(wrapped):
            draw_segments = list(row_segments)
            row_indent = list_indent
            if wi == 0 and prefix_seg:
                draw_segments = [prefix_seg, *draw_segments]
                row_indent = 0.0
            max_ascent, max_descent, leading, half_leading = _line_box_metrics(
                draw_segments,
                fonts_map,
                font_family,
                font_size_px,
                px_to_pt,
                is_bold,
                is_italic,
                font_size_pt,
            )
            visual_rows.append((draw_segments, leading, max_ascent, half_leading, line_align, row_indent))

    if not visual_rows:
        return

    full_total_h = sum(leading for _segs, leading, _a, _hl, _align, _indent in visual_rows)
    total_h = full_total_h
    if full_total_h > text_inner_h + 0.5:
        acc = 0.0
        kept: list[tuple[list[TextSegment], float, float, float, str, float]] = []
        for row in visual_rows:
            if acc + row[1] <= text_inner_h + 0.5:
                kept.append(row)
                acc += row[1]
            else:
                break
        if not kept:
            # Single line taller than the box — still draw it (editor shows it with overflow hidden).
            segs, leading, max_a, half_l, line_align, row_indent = visual_rows[0]
            if text_inner_h > 0 and leading > text_inner_h:
                scale = text_inner_h / leading
                leading = text_inner_h
                half_l = half_l * scale
            kept = [(segs, leading, max_a, half_l, line_align, row_indent)]
        visual_rows = kept
        total_h = sum(leading for _segs, leading, _a, _hl, _align, _indent in visual_rows)

    # Match editor: flex on full element box; p-1 padding inside the flex child (TEXT_INNER_PADDING_PX).
    element_top = box_y + box_h
    element_bottom = box_y
    block_h = total_h + (pad * 2.0)
    full_block_h = full_total_h + (pad * 2.0)
    va = (vertical_align or "top").strip().lower()
    # When content overflows the element, editor flex-start + overflow:hidden keeps the top visible.
    content_overflows = full_block_h > box_h + 0.5
    if content_overflows or va == "top":
        content_top = element_top - pad
    elif va == "bottom":
        content_top = element_bottom + pad + total_h
    elif va == "center":
        content_top = element_bottom + (box_h - block_h) / 2.0 + block_h - pad
    else:
        content_top = element_top - pad

    clipped = _clip_text_area(c, text_x, box_y + pad, text_w, text_inner_h)
    try:
        # Stack lines from the content top downward (PDF y grows upward).
        y_line_top = content_top
        for draw_segments, leading, max_ascent, half_leading, line_align, row_indent in visual_rows:
            # CSS line box: half-leading above the content area, then ascent to baseline.
            baseline_y = y_line_top - half_leading - max_ascent
            line_w = _measure_segments(c, draw_segments)
            start_x = _aligned_line_start_x(text_x, text_w, line_w, line_align, row_indent)
            _draw_segments_at(c, start_x, baseline_y, draw_segments)
            y_line_top -= leading
    finally:
        if clipped:
            c.restoreState()


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
    fonts_map = _get_fonts_map()
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
                        jpeg_bytes = pil_image_to_jpeg_bytes_for_document_pdf(
                            pil_im, page_width, page_height
                        )
                        img_buf = io.BytesIO(jpeg_bytes)
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
                        is_bold = el.get("fontWeight") == "bold"
                        is_italic = el.get("fontStyle") == "italic"
                        font_family = el.get("fontFamily") or "Montserrat"
                        el_color = _parse_hex_color(el.get("color"))
                        text_align = el.get("textAlign") or "left"
                        vertical_align = el.get("verticalAlign") or el.get("vertical_align") or "top"

                        rich_lines = el.get("richLines") or el.get("rich_lines")
                        line_text_aligns = el.get("lineTextAligns") or el.get("line_text_aligns") or []
                        _draw_text_in_box(
                            c,
                            content=str(content),
                            rich_lines=rich_lines if isinstance(rich_lines, list) else None,
                            fonts_map=fonts_map,
                            box_x=x,
                            box_y=y,
                            box_w=w,
                            box_h=h,
                            font_size_px=font_size_px,
                            px_to_pt=px_to_pt,
                            font_family=font_family,
                            is_bold=is_bold,
                            is_italic=is_italic,
                            el_color=el_color,
                            text_align=text_align,
                            vertical_align=vertical_align,
                            list_style=el.get("listStyle") or el.get("list_style"),
                            line_list_styles_raw=el.get("lineListStyles") or el.get("line_list_styles"),
                            line_text_aligns=line_text_aligns,
                        )
                    elif el_type == "image" and content:
                        try:
                            fid = uuid.UUID(content) if isinstance(content, str) else None
                            if fid:
                                img_bytes = _read_file_bytes(db, fid)
                                if img_bytes:
                                    from reportlab.lib.utils import ImageReader
                                    from PIL import Image as PILImage
                                    pil_im = PILImage.open(io.BytesIO(img_bytes))
                                    img_w, img_h = pil_im.size
                                    fit = (el.get("imageFit") or el.get("image_fit") or "contain").lower()
                                    pos = el.get("imagePosition") or el.get("image_position") or "50% 50%"
                                    ax, ay = _parse_object_position(pos)

                                    if fit == "fill":
                                        dw, dh = w, h
                                    elif not img_w or not img_h or w <= 0 or h <= 0:
                                        dw, dh = w, h
                                    else:
                                        if fit == "cover":
                                            scale = max(w / img_w, h / img_h)
                                        else:
                                            scale = min(w / img_w, h / img_h)
                                        dw = img_w * scale
                                        dh = img_h * scale

                                    jpeg_bytes = pil_image_to_jpeg_bytes_for_document_pdf(pil_im, dw, dh)
                                    img_buf = io.BytesIO(jpeg_bytes)
                                    img_buf.seek(0)
                                    reader = ImageReader(img_buf)

                                    if fit == "fill":
                                        c.drawImage(reader, x, y, width=w, height=h)
                                    elif not img_w or not img_h or w <= 0 or h <= 0:
                                        c.drawImage(reader, x, y, width=w, height=h)
                                    else:
                                        dx = (w - dw) * ax
                                        dy = (h - dh) * (1.0 - ay)
                                        draw_x = x + dx
                                        draw_y = y + dy
                                        if fit == "cover":
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
