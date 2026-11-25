"""Printable Field Report PDF (Site Assessment / Work Report) — ReportLab, Mack Kirk template."""
from __future__ import annotations

import io
import logging
import os
from datetime import datetime
from typing import Any, List, Optional, Tuple
from xml.sax.saxutils import escape as xml_escape

import pytz
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    Image,
    KeepTogether,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)
from sqlalchemy.orm import Session

from ..models.models import FieldworkPhotoObservation, FieldworkRecord, FileObject, Project
from .onboarding_storage import read_file_object_bytes

logger = logging.getLogger(__name__)

_PDF_TZ = pytz.timezone("America/Vancouver")
_SIDE = "_fieldComments"

# Hub / Mack Kirk palette (matches safety inspection + brand-red)
_INK = colors.HexColor("#111827")
_MUTED = colors.HexColor("#6b7280")
_LINE = colors.HexColor("#e5e7eb")
_CARD = colors.HexColor("#f9fafb")
_BRAND = colors.HexColor("#b91c1c")
_BRAND_SOFT = colors.HexColor("#fef2f2")
_BLUE_BG = colors.HexColor("#eff6ff")
_BLUE_BD = colors.HexColor("#bfdbfe")
_GREEN = colors.HexColor("#166534")
_GREEN_BG = colors.HexColor("#dcfce7")
_RED = colors.HexColor("#991b1b")
_RED_BG = colors.HexColor("#fee2e2")
_MK_TEMPLATE_REL = os.path.join("proposals", "assets", "templates", "page_MK_template.png")
_TOP_PAGE_CODE_LINE_Y = 826
_TOP_PAGE_CODE_RIGHT_INSET = 18
_BANNER_TEXT_MAX_WIDTH = 300
_BANNER_FIRST_BASELINE = 794

try:
    from ..proposals import pdf_dynamic as _pdf_dyn  # noqa: F401
    from ..proposals.pdf_dynamic import _get_cached_bg_reader, wrap_text as _pdf_wrap_text
except Exception:  # pragma: no cover
    _pdf_dyn = None  # type: ignore
    _get_cached_bg_reader = None  # type: ignore
    _pdf_wrap_text = None  # type: ignore

try:
    from ..proposals.pdf_fixed import HEADER_TITLE_BASE_SIZE, HEADER_TITLE_MAX_WIDTH, HEADER_TITLE_MIN_SIZE
except Exception:  # pragma: no cover
    HEADER_TITLE_MAX_WIDTH = 450
    HEADER_TITLE_BASE_SIZE = 12
    HEADER_TITLE_MIN_SIZE = 6


def _esc(s: Any) -> str:
    return xml_escape(str(s or ""), entities={'"': "&quot;", "'": "&apos;"})


def _fmt_dt(dt: Optional[datetime]) -> str:
    if not dt:
        return "—"
    if dt.tzinfo is None:
        dt = pytz.UTC.localize(dt)
    loc = dt.astimezone(_PDF_TZ)
    return loc.strftime("%Y-%m-%d %H:%M %Z").strip()


def _kind_label(kind: str) -> str:
    k = (kind or "").strip().lower()
    if k == "site_assessment":
        return "Site Assessment"
    if k == "work_report":
        return "Work Report"
    return kind or "Field Report"


def _status_label(status: str) -> str:
    st = (status or "").strip().lower()
    return {
        "draft": "Draft",
        "submitted": "Pending review",
        "changes_requested": "Changes requested",
        "approved": "Approved",
        "superseded": "Superseded",
    }.get(st, status or "—")


def _parse_note(raw: Any) -> Tuple[str, List[str]]:
    if isinstance(raw, str):
        return raw.strip(), []
    if isinstance(raw, dict):
        text = raw.get("text") or raw.get("comments") or ""
        text = text.strip() if isinstance(text, str) else ""
        arr = raw.get("imageIds") or raw.get("images") or raw.get("commentImageIds") or []
        ids = [str(x) for x in arr if isinstance(x, str) and x.strip()] if isinstance(arr, list) else []
        return text, ids
    return "", []


def _tech_note(field: dict, payload: dict) -> Tuple[str, List[str]]:
    if field.get("type") == "yes_no_na":
        return _parse_note(payload.get(field.get("key")))
    bag = payload.get(_SIDE)
    if isinstance(bag, dict):
        return _parse_note(bag.get(field.get("key")))
    return "", []


def _format_answer(field: dict, value: Any) -> str:
    t = field.get("type")
    if value is None or value == "":
        return "—"
    if t == "checkbox":
        return "Yes" if value is True else "No"
    if t == "pass_fail_na":
        return {"pass": "Pass", "fail": "Fail", "na": "N/A"}.get(str(value), str(value))
    if t == "yes_no_na":
        if isinstance(value, dict):
            return {"yes": "Yes", "no": "No", "na": "N/A"}.get(str(value.get("status") or ""), "—")
        return "—"
    if t in ("dropdown_multi", "user_multi", "equipment_multi"):
        if isinstance(value, list):
            return ", ".join(str(x) for x in value if x) or "—"
        return str(value)
    if t == "pass_fail_total" and isinstance(value, dict):
        return f"Pass {value.get('pass', 0)} · Fail {value.get('fail', 0)} · N/A {value.get('na', 0)}"
    if t == "gps" and isinstance(value, dict):
        lat, lng = value.get("lat"), value.get("lng")
        if isinstance(lat, (int, float)) and isinstance(lng, (int, float)):
            return f"{lat:.5f}, {lng:.5f}"
        return "—"
    if isinstance(value, (dict, list)):
        return "—"
    return str(value).strip() or "—"


def _sorted_fields(definition: dict, payload: dict) -> List[Tuple[str, List[dict]]]:
    sections = definition.get("sections") if isinstance(definition, dict) else None
    if not isinstance(sections, list):
        return []
    out: List[Tuple[str, List[dict]]] = []
    for sec in sorted(sections, key=lambda s: int((s or {}).get("order") or 0)):
        if not isinstance(sec, dict):
            continue
        title = str(sec.get("title") or "Section")
        fields_raw = sec.get("fields") if isinstance(sec.get("fields"), list) else []
        fields: List[dict] = []
        for f in sorted(fields_raw, key=lambda x: int((x or {}).get("order") or 0)):
            if not isinstance(f, dict):
                continue
            if f.get("type") in ("text_info", "pdf_view"):
                continue
            fields.append(f)
        if fields:
            out.append((title, fields))
    return out


def _template_bg_path() -> str:
    base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    return os.path.normpath(os.path.join(base, _MK_TEMPLATE_REL))


def _banner_project_line(project_name: str, project_code: str) -> str:
    pn = (project_name or "").strip()
    pc = (project_code or "").strip()
    if pn and pc:
        return f"{pn} ({pc})"
    return pn or pc or ""


def _draw_mk_banner_header(
    canvas: Any,
    *,
    title: str,
    project_name: str,
    project_code: str,
    project_address: str,
) -> None:
    from reportlab.pdfbase.pdfmetrics import stringWidth

    font_title = "Montserrat-Bold" if _pdf_dyn else "Helvetica-Bold"
    font_sub_bold = "Montserrat-Bold" if _pdf_dyn else "Helvetica-Bold"
    font_sub = "Montserrat" if _pdf_dyn else "Helvetica"
    max_w = min(HEADER_TITLE_MAX_WIDTH, _BANNER_TEXT_MAX_WIDTH)
    x = 40.0
    y0 = float(_BANNER_FIRST_BASELINE)

    text = (title or "").strip() or "Field Report"
    size = HEADER_TITLE_BASE_SIZE
    while size > HEADER_TITLE_MIN_SIZE and stringWidth(text, font_title, size) > max_w:
        size -= 0.5
    line_h = size + 4
    wrap = _pdf_wrap_text

    canvas.saveState()
    canvas.setFillColor(colors.white)

    if stringWidth(text, font_title, size) > max_w and wrap:
        lines = wrap(text, font_title, size, max_w)[:2]
        canvas.setFont(font_title, size)
        y_title = y0
        last_title_bl = y0
        for line in lines:
            canvas.drawString(x, y_title, line)
            last_title_bl = y_title
            y_title -= line_h
    else:
        canvas.setFont(font_title, size)
        canvas.drawString(x, y0, text)
        last_title_bl = y0

    proj = _banner_project_line(project_name, project_code)
    addr = (project_address or "").strip()
    if not proj and not addr:
        canvas.restoreState()
        return

    y_cursor = last_title_bl - 12.0
    if proj:
        canvas.setFont(font_sub_bold, 9.0)
        plines = wrap(proj, font_sub_bold, 9.0, max_w)[:3] if wrap else [proj]
        for pl in plines:
            if y_cursor < 708:
                break
            canvas.drawString(x, y_cursor, pl)
            y_cursor -= 11
    if addr:
        if proj:
            y_cursor -= 2
        canvas.setFont(font_sub, 8.0)
        alines = wrap(addr, font_sub, 8.0, max_w)[:4] if wrap else [addr]
        for al in alines:
            if y_cursor < 692:
                break
            canvas.drawString(x, y_cursor, al)
            y_cursor -= 10
    canvas.restoreState()


def _thumb(db: Session, file_object_id: str, max_w: float = 2.2 * inch, max_h: float = 1.7 * inch):
    try:
        import uuid as uuid_mod

        fo = db.query(FileObject).filter(FileObject.id == uuid_mod.UUID(str(file_object_id))).first()
        if not fo:
            return None
        raw = read_file_object_bytes(db, fo)
        if not raw:
            return None
        img = Image(io.BytesIO(raw))
        img.hAlign = "LEFT"
        iw, ih = float(img.imageWidth), float(img.imageHeight)
        if iw <= 0 or ih <= 0:
            return None
        scale = min(max_w / iw, max_h / ih, 1.0)
        img.drawWidth = iw * scale
        img.drawHeight = ih * scale
        return img
    except Exception:
        logger.exception("Fieldwork PDF: failed to load image %s", file_object_id)
        return None


def _status_or_value_cell(field: dict, payload: dict, value_style: ParagraphStyle) -> Any:
    """Right-column answer; Pass/Fail render as compact colored chips."""
    key = str(field.get("key") or "")
    raw = payload.get(key)
    answer = _format_answer(field, raw)
    font_b = "Montserrat-Bold" if _pdf_dyn else "Helvetica-Bold"

    if field.get("type") == "pass_fail_na" and raw in ("pass", "fail", "na"):
        if raw == "pass":
            fg, bg = _GREEN, _GREEN_BG
        elif raw == "fail":
            fg, bg = _RED, _RED_BG
        else:
            fg, bg = _MUTED, _CARD
        chip = Paragraph(
            _esc(answer),
            ParagraphStyle(
                f"Chip_{key}",
                parent=value_style,
                fontName=font_b,
                textColor=fg,
                alignment=TA_CENTER,
                fontSize=8.5,
            ),
        )
        wrap = Table([[chip]], colWidths=[0.85 * inch])
        wrap.hAlign = "RIGHT"
        wrap.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, -1), bg),
                    ("BOX", (0, 0), (-1, -1), 0.5, fg),
                    ("LEFTPADDING", (0, 0), (-1, -1), 6),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                    ("TOPPADDING", (0, 0), (-1, -1), 3),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
                    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ]
            )
        )
        return wrap

    style = ParagraphStyle(
        f"Ans_{key}",
        parent=value_style,
        alignment=TA_RIGHT,
        fontName=font_b if answer != "—" else (value_style.fontName or "Helvetica"),
        textColor=_MUTED if answer == "—" else _INK,
    )
    return Paragraph(_esc(answer), style)


def build_fieldwork_report_pdf_bytes(
    db: Session,
    *,
    record: FieldworkRecord,
    project: Project,
) -> bytes:
    payload = record.form_payload if isinstance(record.form_payload, dict) else {}
    definition = record.form_definition_snapshot if isinstance(record.form_definition_snapshot, dict) else {}
    photos = (
        db.query(FieldworkPhotoObservation)
        .filter(FieldworkPhotoObservation.record_id == record.id)
        .order_by(FieldworkPhotoObservation.sort_order.asc(), FieldworkPhotoObservation.created_at.asc())
        .all()
    )

    buf = io.BytesIO()
    page_w, page_h = A4
    lm, rm = 44, 44
    tm, bm = 132, 92
    frame_w = page_w - lm - rm
    frame_h = page_h - tm - bm

    font = "Montserrat" if _pdf_dyn else "Helvetica"
    font_b = "Montserrat-Bold" if _pdf_dyn else "Helvetica-Bold"

    styles = getSampleStyleSheet()
    section_style = ParagraphStyle(
        "FWSection",
        parent=styles["Heading2"],
        fontName=font_b,
        fontSize=11.5,
        textColor=_BRAND,
        spaceBefore=14,
        spaceAfter=6,
        leading=14,
    )
    label_style = ParagraphStyle(
        "FWLabel",
        parent=styles["Normal"],
        fontName=font_b,
        fontSize=9,
        textColor=colors.HexColor("#374151"),
        leading=12,
        alignment=TA_LEFT,
    )
    value_style = ParagraphStyle(
        "FWValue",
        parent=styles["Normal"],
        fontName=font,
        fontSize=9,
        textColor=_INK,
        leading=12,
        alignment=TA_RIGHT,
    )
    meta_label = ParagraphStyle(
        "FWMetaLbl",
        parent=styles["Normal"],
        fontName=font_b,
        fontSize=7.5,
        textColor=_MUTED,
        leading=9,
        spaceAfter=1,
    )
    meta_value = ParagraphStyle(
        "FWMetaVal",
        parent=styles["Normal"],
        fontName=font,
        fontSize=9,
        textColor=_INK,
        leading=11,
    )
    note_label = ParagraphStyle(
        "FWNoteLbl",
        parent=styles["Normal"],
        fontName=font_b,
        fontSize=7.5,
        textColor=colors.HexColor("#1e40af"),
        leading=9,
        spaceAfter=2,
    )
    note_body = ParagraphStyle(
        "FWNoteBody",
        parent=styles["Normal"],
        fontName=font,
        fontSize=8.5,
        textColor=_INK,
        leading=11,
    )
    small = ParagraphStyle(
        "FWSmall",
        parent=styles["Normal"],
        fontName=font,
        fontSize=8.5,
        textColor=_INK,
        leading=11,
    )
    muted_small = ParagraphStyle(
        "FWMuted",
        parent=small,
        textColor=_MUTED,
    )

    story: List[Any] = []

    # Status / version strip
    meta_cells = [
        [
            Paragraph("STATUS", meta_label),
            Paragraph("VERSION", meta_label),
            Paragraph("SUBMITTED", meta_label),
            Paragraph("APPROVED", meta_label),
        ],
        [
            Paragraph(_esc(_status_label(record.status)), meta_value),
            Paragraph(f"v{int(record.version or 1)}", meta_value),
            Paragraph(_esc(_fmt_dt(record.submitted_at)), meta_value),
            Paragraph(_esc(_fmt_dt(record.approved_at)), meta_value),
        ],
    ]
    col_w = frame_w / 4
    meta_t = Table(meta_cells, colWidths=[col_w] * 4)
    meta_t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), _CARD),
                ("BOX", (0, 0), (-1, -1), 0.6, _LINE),
                ("LINEBEFORE", (1, 0), (-1, -1), 0.4, _LINE),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, 0), 7),
                ("BOTTOMPADDING", (0, 0), (-1, 0), 1),
                ("TOPPADDING", (0, 1), (-1, 1), 1),
                ("BOTTOMPADDING", (0, 1), (-1, 1), 8),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]
        )
    )
    story.append(meta_t)

    review_note = (getattr(record, "review_note", None) or "").strip()
    if review_note:
        story.append(Spacer(1, 8))
        note_inner = [
            Paragraph("RETURNED FOR CHANGES", ParagraphStyle("RetLbl", parent=note_label, textColor=_RED)),
            Paragraph(_esc(review_note).replace("\n", "<br/>"), note_body),
        ]
        note_box = Table([[note_inner]], colWidths=[frame_w])
        note_box.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, -1), _BRAND_SOFT),
                    ("BOX", (0, 0), (-1, -1), 0.7, colors.HexColor("#fecaca")),
                    ("LEFTPADDING", (0, 0), (-1, -1), 10),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                    ("TOPPADDING", (0, 0), (-1, -1), 7),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
                ]
            )
        )
        story.append(note_box)

    label_w = frame_w * 0.62
    value_w = frame_w * 0.38
    # Tech note sits inside the label cell (padding 8+8).
    tech_note_w = label_w - 16

    for sec_title, fields in _sorted_fields(definition, payload):
        story.append(Paragraph(_esc(sec_title), section_style))
        rows: List[List[Any]] = []
        style_cmds: List[tuple] = [
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
            ("TOPPADDING", (0, 0), (-1, -1), 7),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
            ("BOX", (0, 0), (-1, -1), 0.7, _LINE),
            ("LINEBELOW", (0, 0), (-1, -2), 0.4, _LINE),
            ("BACKGROUND", (0, 0), (-1, -1), colors.white),
            ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ]

        for idx, field in enumerate(fields):
            key = str(field.get("key") or "")
            label = str(field.get("label") or key)
            tech_text, tech_imgs = _tech_note(field, payload)

            label_cell: List[Any] = [Paragraph(_esc(label), label_style)]
            if tech_text or tech_imgs:
                bits: List[Any] = [Paragraph("TECHNICIAN NOTE", note_label)]
                if tech_text:
                    bits.append(Paragraph(_esc(tech_text).replace("\n", "<br/>"), note_body))
                img_flow = []
                for fid in tech_imgs[:3]:
                    im = _thumb(db, fid, max_w=1.2 * inch, max_h=0.95 * inch)
                    if im:
                        img_flow.append(im)
                if img_flow:
                    bits.append(Spacer(1, 3))
                    bits.append(
                        Table(
                            [img_flow],
                            hAlign="LEFT",
                            colWidths=[min(1.25 * inch, tech_note_w / max(len(img_flow), 1))] * len(img_flow),
                        )
                    )
                tech_box = Table([[bits]], colWidths=[tech_note_w])
                tech_box.setStyle(
                    TableStyle(
                        [
                            ("BACKGROUND", (0, 0), (-1, -1), _BLUE_BG),
                            ("BOX", (0, 0), (-1, -1), 0.5, _BLUE_BD),
                            ("LEFTPADDING", (0, 0), (-1, -1), 6),
                            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                            ("TOPPADDING", (0, 0), (-1, -1), 5),
                            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                        ]
                    )
                )
                label_cell.append(Spacer(1, 5))
                label_cell.append(tech_box)

            rows.append(
                [
                    label_cell if len(label_cell) > 1 else label_cell[0],
                    _status_or_value_cell(field, payload, value_style),
                ]
            )
            if idx % 2 == 1:
                style_cmds.append(("BACKGROUND", (0, idx), (-1, idx), _CARD))

        table = Table(rows, colWidths=[label_w, value_w])
        table.setStyle(TableStyle(style_cmds))
        story.append(KeepTogether([table]))

    if photos:
        story.append(Paragraph("Photos with descriptions", section_style))
        row: List[Any] = []
        photo_rows: List[List[Any]] = []
        half = (frame_w - 8) / 2
        for p in photos:
            caption = (p.phrase_text_snapshot or "").strip() or "No description"
            notes = (p.extra_notes or "").strip()
            im = _thumb(db, str(p.file_object_id), max_w=half - 12, max_h=2.1 * inch)
            cell_bits: List[Any] = []
            if im:
                cell_bits.append(im)
            else:
                cell_bits.append(Paragraph("<i>Image unavailable</i>", muted_small))
            cell_bits.append(Spacer(1, 4))
            cell_bits.append(Paragraph(_esc(caption), small))
            if notes:
                cell_bits.append(Paragraph(_esc(notes), muted_small))
            cell = Table([[cell_bits]], colWidths=[half])
            cell.setStyle(
                TableStyle(
                    [
                        ("BOX", (0, 0), (-1, -1), 0.6, _LINE),
                        ("BACKGROUND", (0, 0), (-1, -1), colors.white),
                        ("LEFTPADDING", (0, 0), (-1, -1), 6),
                        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                        ("TOPPADDING", (0, 0), (-1, -1), 6),
                        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                        ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ]
                )
            )
            row.append(cell)
            if len(row) == 2:
                photo_rows.append(row)
                row = []
        if row:
            while len(row) < 2:
                row.append("")
            photo_rows.append(row)
        for r in photo_rows:
            t = Table([r], colWidths=[half + 4, half + 4])
            t.setStyle(
                TableStyle(
                    [
                        ("VALIGN", (0, 0), (-1, -1), "TOP"),
                        ("LEFTPADDING", (0, 0), (-1, -1), 0),
                        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                        ("TOPPADDING", (0, 0), (-1, -1), 0),
                        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                    ]
                )
            )
            story.append(t)

    final = (record.final_comments or "").strip()
    if final:
        story.append(Paragraph("Additional comments", section_style))
        box = Table(
            [[Paragraph(_esc(final).replace("\n", "<br/>"), small)]],
            colWidths=[frame_w],
        )
        box.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, -1), _CARD),
                    ("BOX", (0, 0), (-1, -1), 0.6, _LINE),
                    ("LEFTPADDING", (0, 0), (-1, -1), 10),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                    ("TOPPADDING", (0, 0), (-1, -1), 8),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
                ]
            )
        )
        story.append(box)

    story.append(Spacer(1, 14))
    story.append(
        Paragraph(
            f"Generated {_esc(_fmt_dt(datetime.now(pytz.UTC)))} · Mack Kirk Field Report",
            muted_small,
        )
    )

    tmpl_path = _template_bg_path()
    use_bg = bool(_get_cached_bg_reader and os.path.exists(tmpl_path))
    header_title = _kind_label(record.kind)
    project_name = (project.name or "").strip()
    project_code = (getattr(project, "code", None) or "").strip()
    project_address = (getattr(project, "address", None) or "").strip()

    def on_page(canvas: Any, _doc: Any) -> None:
        canvas.saveState()
        try:
            if use_bg and _get_cached_bg_reader:
                bg = _get_cached_bg_reader(tmpl_path)
                canvas.drawImage(bg, 0, 0, width=page_w, height=page_h)
                _draw_mk_banner_header(
                    canvas,
                    title=header_title,
                    project_name=project_name,
                    project_code=project_code,
                    project_address=project_address,
                )
            else:
                # Fallback when template asset missing: brand bar + title
                canvas.setFillColor(_BRAND)
                canvas.rect(0, page_h - 28, page_w, 28, fill=1, stroke=0)
                canvas.setFillColor(colors.white)
                canvas.setFont(font_b, 12)
                canvas.drawString(lm, page_h - 18, header_title)
                canvas.setFont(font, 8)
                canvas.setFillColor(_MUTED)
                line = " · ".join(x for x in [project_name, project_code] if x)
                if line:
                    canvas.drawString(lm, page_h - 42, line)
            canvas.setFont("Helvetica", 8)
            canvas.setFillColor(colors.HexColor("#9ca3af"))
            code = project_code or "Field Report"
            canvas.drawRightString(
                page_w - _TOP_PAGE_CODE_RIGHT_INSET,
                _TOP_PAGE_CODE_LINE_Y,
                f"{code} · Page {canvas.getPageNumber()}",
            )
        except Exception as e:
            logger.warning("fieldwork_report_pdf: page chrome failed: %s", e)
        finally:
            canvas.restoreState()

    frame = Frame(
        lm,
        bm,
        frame_w,
        frame_h,
        id="main",
        leftPadding=0,
        rightPadding=0,
        topPadding=8,
        bottomPadding=10,
    )
    doc = BaseDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=lm,
        rightMargin=rm,
        topMargin=tm,
        bottomMargin=bm,
        title=f"{header_title} — {project_name}"[:120],
        author="Mack Kirk",
    )
    doc.addPageTemplates([PageTemplate(id="main", frames=[frame], onPage=on_page)])
    doc.build(story)
    return buf.getvalue()
