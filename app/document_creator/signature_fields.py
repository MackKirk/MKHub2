"""
Extract signature_template overlay fields from Document Builder pages.

Free `initials` elements → absolute % boxes.
Inline signature atoms in text → positions after rich-text wrap (same as PDF layout).
"""
from __future__ import annotations

import io
import uuid
from typing import Any, Dict, List, Optional, Tuple


def pct_box_to_pdf_rect(
    x_pct: float,
    y_pct: float,
    width_pct: float,
    height_pct: float,
    page_width: float,
    page_height: float,
) -> Dict[str, float]:
    """Editor top-left % → PDF bottom-left points (same as pdf_builder element draw)."""
    x = page_width * (x_pct / 100.0)
    h = page_height * (height_pct / 100.0)
    y = page_height * (1.0 - (y_pct / 100.0) - (height_pct / 100.0))
    w = page_width * (width_pct / 100.0)
    return {"x": float(x), "y": float(y), "width": float(w), "height": float(h)}


def _field_id(raw: Any) -> str:
    try:
        return str(uuid.UUID(str(raw)))
    except Exception:
        return str(uuid.uuid4())


def _assignee(raw: Any) -> str:
    """Emit role id for Document Builder fields (legacy keys → stable UUIDs)."""
    from ..services.document_signer_roles import normalize_field_assignee

    return normalize_field_assignee(raw)


def _collect_initials_fields(
    elements: list,
    page_index: int,
    page_width: float,
    page_height: float,
) -> List[dict]:
    out: List[dict] = []
    for el in elements:
        if not isinstance(el, dict) or (el.get("type") or "") != "initials":
            continue
        try:
            x_pct = float(el.get("x_pct", 78))
            y_pct = float(el.get("y_pct", 92))
            w_pct = float(el.get("width_pct", 14))
            h_pct = float(el.get("height_pct", 4.5))
        except (TypeError, ValueError):
            continue
        out.append(
            {
                "id": _field_id(el.get("id") or el.get("atomId")),
                "type": "initials",
                "page_index": page_index,
                "rect": pct_box_to_pdf_rect(x_pct, y_pct, w_pct, h_pct, page_width, page_height),
                "field_name": "Initials",
                "required": bool(el.get("required", True)),
                "assignee": _assignee(el.get("assignee")),
            }
        )
    return out


def _collect_date_fields(
    elements: list,
    page_index: int,
    page_width: float,
    page_height: float,
) -> List[dict]:
    out: List[dict] = []
    for el in elements:
        if not isinstance(el, dict) or (el.get("type") or "") != "date":
            continue
        try:
            x_pct = float(el.get("x_pct", 60))
            y_pct = float(el.get("y_pct", 92))
            w_pct = float(el.get("width_pct", 16))
            h_pct = float(el.get("height_pct", 4.5))
        except (TypeError, ValueError):
            continue
        out.append(
            {
                "id": _field_id(el.get("id") or el.get("atomId")),
                "type": "date",
                "page_index": page_index,
                "rect": pct_box_to_pdf_rect(x_pct, y_pct, w_pct, h_pct, page_width, page_height),
                "field_name": "Date",
                "required": bool(el.get("required", True)),
                "assignee": _assignee(el.get("assignee")),
            }
        )
    return out


def _collect_inline_signature_fields(
    c,
    fonts_map: dict,
    el: dict,
    page_index: int,
    page_width: float,
    page_height: float,
    px_to_pt: float,
    *,
    SIG_ATOM_FONT: str,
    SIG_ATOM_CHAR: str,
    TEXT_INNER_PADDING_PX: float,
    _is_sig_atom_run,
    _runs_to_segments,
    _wrap_segments_to_visual_rows,
    _list_prefix_segment,
    _line_box_metrics,
    _measure_segments,
    _aligned_line_start_x,
    _normalize_rich_lines_for_content,
    _parse_hex_color,
    _segment_width,
) -> List[dict]:
    """Walk text-box layout (same as _draw_text_in_box) and emit a field per signature atom."""
    content = str(el.get("content") or "")
    rich_lines = el.get("richLines") or el.get("rich_lines")
    if not isinstance(rich_lines, list):
        rich_lines = None
    has_atom = SIG_ATOM_CHAR in content
    if not has_atom and rich_lines:
        for line in rich_lines:
            if not isinstance(line, list):
                continue
            for run in line:
                if isinstance(run, dict) and _is_sig_atom_run(run):
                    has_atom = True
                    break
            if has_atom:
                break
    if not has_atom:
        return []

    try:
        x_pct = float(el.get("x_pct", 10)) / 100.0
        y_pct = float(el.get("y_pct", 20)) / 100.0
        w_pct = float(el.get("width_pct", 80)) / 100.0
        h_pct = float(el.get("height_pct", 10)) / 100.0
    except (TypeError, ValueError):
        return []

    box_x = page_width * x_pct
    box_y = page_height * (1.0 - y_pct - h_pct)
    box_w = page_width * w_pct
    box_h = page_height * h_pct
    if box_w <= 0 or box_h <= 0:
        return []

    font_size_px = float(el.get("fontSize") or el.get("font_size", 11) or 11)
    is_bold = el.get("fontWeight") == "bold"
    is_italic = el.get("fontStyle") == "italic"
    font_family = el.get("fontFamily") or "Montserrat"
    el_color = _parse_hex_color(el.get("color"))
    text_align = el.get("textAlign") or "left"
    vertical_align = (el.get("verticalAlign") or el.get("vertical_align") or "top").strip().lower()
    list_style = el.get("listStyle") or el.get("list_style")
    line_list_styles_raw = el.get("lineListStyles") or el.get("line_list_styles")
    line_text_aligns = el.get("lineTextAligns") or el.get("line_text_aligns") or []

    pad = TEXT_INNER_PADDING_PX * px_to_pt
    text_x = box_x + pad
    text_w = max(1.0, box_w - (pad * 2.0))
    text_inner_h = max(0.0, box_h - (pad * 2.0))
    font_size_pt = max(1.0, font_size_px * px_to_pt)

    content_norm = content.replace("\r\n", "\n")
    content_lines = content_norm.split("\n") if content_norm else [""]
    normalized_rich = _normalize_rich_lines_for_content(content_norm, rich_lines)

    visual_rows: List[Tuple[list, float, float, float, str, float, List[Optional[dict]]]] = []

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
        atom_runs_in_order: List[dict] = []
        if isinstance(runs, list):
            for r in runs:
                if isinstance(r, dict) and _is_sig_atom_run(r):
                    atom_runs_in_order.append(r)

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

        atom_cursor = 0
        for wi, row_segments in enumerate(wrapped):
            draw_segments = list(row_segments)
            row_indent = list_indent
            meta: List[Optional[dict]] = [None] * len(draw_segments)
            if wi == 0 and prefix_seg:
                draw_segments = [prefix_seg, *draw_segments]
                meta = [None, *([None] * len(row_segments))]
                row_indent = 0.0
            for si, seg in enumerate(draw_segments):
                if seg[0] == SIG_ATOM_FONT:
                    meta[si] = atom_runs_in_order[atom_cursor] if atom_cursor < len(atom_runs_in_order) else {}
                    atom_cursor += 1
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
            visual_rows.append(
                (draw_segments, leading, max_ascent, half_leading, line_align, row_indent, meta)
            )

    if not visual_rows:
        return []

    full_total_h = sum(leading for _s, leading, _a, _hl, _al, _ind, _m in visual_rows)
    kept = visual_rows
    if full_total_h > text_inner_h + 0.5:
        acc = 0.0
        kept = []
        for row in visual_rows:
            if acc + row[1] <= text_inner_h + 0.5:
                kept.append(row)
                acc += row[1]
            else:
                break
    total_h = sum(r[1] for r in kept)

    va = vertical_align
    content_overflows = full_total_h > text_inner_h + 0.5
    if content_overflows or va == "top":
        top_y = box_y + box_h - pad
    elif va == "bottom":
        top_y = box_y + pad + total_h
    else:
        top_y = box_y + pad + text_inner_h - (text_inner_h - total_h) / 2.0

    fields: List[dict] = []
    cursor_y = top_y
    for draw_segments, leading, max_ascent, half_leading, line_align, row_indent, meta in kept:
        line_w = _measure_segments(c, draw_segments)
        start_x = _aligned_line_start_x(text_x, text_w, line_w, line_align, left_indent=row_indent)
        baseline = cursor_y - half_leading - max_ascent
        # Indent is already applied in start_x (same as PDF draw path).
        cx = start_x
        for si, (font_name, size, color, text) in enumerate(draw_segments):
            if font_name == SIG_ATOM_FONT:
                w_pt = float(size) if size else 0.0
                try:
                    h_pt = float(color)
                except (TypeError, ValueError):
                    h_pt = font_size_pt * 1.6
                run_meta = meta[si] if si < len(meta) else {}
                # vertical-align:middle — center chip in the line box (matches editor display).
                rect_y = cursor_y - (leading + h_pt) / 2.0
                rect_x = cx
                field_type = "date" if (run_meta or {}).get("kind") == "date" else "signature"
                fields.append(
                    {
                        "id": _field_id((run_meta or {}).get("atomId") or (run_meta or {}).get("atom_id")),
                        "type": field_type,
                        "page_index": page_index,
                        "rect": {
                            "x": float(rect_x),
                            "y": float(rect_y),
                            "width": float(w_pt),
                            "height": float(h_pt),
                        },
                        "field_name": "Date" if field_type == "date" else "Signature",
                        "required": bool((run_meta or {}).get("required", True)),
                        "assignee": _assignee((run_meta or {}).get("assignee")),
                    }
                )
                cx += w_pt
            else:
                if text:
                    cx += _segment_width(c, font_name, size, text)
        cursor_y -= leading

    return fields


def extract_signature_fields_from_pages(pages: Any) -> Tuple[List[dict], List[Tuple[float, float]]]:
    """
    Return (fields, page_sizes) for Document Builder pages (token-substituted).
    Uses a scratch ReportLab canvas for stringWidth / wrap (same as PDF export).
    """
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas

    from .pdf_builder import (
        CANVAS_REFERENCE_WIDTH_PX,
        SIG_ATOM_CHAR,
        SIG_ATOM_FONT,
        TEXT_INNER_PADDING_PX,
        _aligned_line_start_x,
        _get_fonts_map,
        _is_sig_atom_run,
        _line_box_metrics,
        _list_prefix_segment,
        _measure_segments,
        _normalize_rich_lines_for_content,
        _parse_hex_color,
        _runs_to_segments,
        _segment_width,
        _wrap_segments_to_visual_rows,
    )

    page_width, page_height = A4
    px_to_pt = page_width / CANVAS_REFERENCE_WIDTH_PX
    fonts_map = _get_fonts_map()
    scratch = canvas.Canvas(io.BytesIO(), pagesize=A4)

    fields: List[dict] = []
    page_sizes: List[Tuple[float, float]] = []

    if not isinstance(pages, list):
        return [], page_sizes

    helpers = dict(
        SIG_ATOM_FONT=SIG_ATOM_FONT,
        SIG_ATOM_CHAR=SIG_ATOM_CHAR,
        TEXT_INNER_PADDING_PX=TEXT_INNER_PADDING_PX,
        _is_sig_atom_run=_is_sig_atom_run,
        _runs_to_segments=_runs_to_segments,
        _wrap_segments_to_visual_rows=_wrap_segments_to_visual_rows,
        _list_prefix_segment=_list_prefix_segment,
        _line_box_metrics=_line_box_metrics,
        _measure_segments=_measure_segments,
        _aligned_line_start_x=_aligned_line_start_x,
        _normalize_rich_lines_for_content=_normalize_rich_lines_for_content,
        _parse_hex_color=_parse_hex_color,
        _segment_width=_segment_width,
    )

    for page_index, page_data in enumerate(pages):
        page_sizes.append((float(page_width), float(page_height)))
        if not isinstance(page_data, dict):
            continue
        elements = page_data.get("elements")
        if not isinstance(elements, list):
            continue
        fields.extend(_collect_initials_fields(elements, page_index, page_width, page_height))
        fields.extend(_collect_date_fields(elements, page_index, page_width, page_height))
        for el in elements:
            if not isinstance(el, dict) or (el.get("type") or "text") != "text":
                continue
            fields.extend(
                _collect_inline_signature_fields(
                    scratch,
                    fonts_map,
                    el,
                    page_index,
                    page_width,
                    page_height,
                    px_to_pt,
                    **helpers,
                )
            )

    return fields, page_sizes


def build_signature_template_payload(pages: Any) -> dict:
    """Raw template dict before validate_and_normalize_template."""
    fields, _sizes = extract_signature_fields_from_pages(pages)
    return {"version": 1, "fields": fields}
