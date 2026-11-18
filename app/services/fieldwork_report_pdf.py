"""Printable Field Report PDF (Site Assessment / Work Report) — ReportLab."""
from __future__ import annotations

import io
import logging
from datetime import datetime
from typing import Any, List, Optional, Tuple
from xml.sax.saxutils import escape as xml_escape

import pytz
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_RIGHT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    Image,
    KeepTogether,
    Paragraph,
    SimpleDocTemplate,
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
_SUPER = "_supervisorComments"

_INK = colors.HexColor("#0f172a")
_MUTED = colors.HexColor("#64748b")
_LINE = colors.HexColor("#e2e8f0")
_CARD = colors.HexColor("#f8fafc")
_BLUE_BG = colors.HexColor("#eff6ff")
_BLUE_BD = colors.HexColor("#bfdbfe")
_AMBER_BG = colors.HexColor("#fffbeb")
_AMBER_BD = colors.HexColor("#fde68a")
_BRAND = colors.HexColor("#b91c1c")


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


def _supervisor_text(field_key: str, payload: dict) -> str:
    bag = payload.get(_SUPER)
    if not isinstance(bag, dict):
        return ""
    text, _ = _parse_note(bag.get(field_key))
    return text


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
        # Keep aspect
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
    doc = SimpleDocTemplate(
        buf,
        pagesize=letter,
        leftMargin=0.7 * inch,
        rightMargin=0.7 * inch,
        topMargin=0.65 * inch,
        bottomMargin=0.65 * inch,
        title=f"{_kind_label(record.kind)} — {project.name or ''}",
        author="Mack Kirk",
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "FWTitle",
        parent=styles["Heading1"],
        fontName="Helvetica-Bold",
        fontSize=18,
        textColor=_INK,
        spaceAfter=4,
        leading=22,
    )
    sub_style = ParagraphStyle(
        "FWSub",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=10,
        textColor=_MUTED,
        spaceAfter=2,
        leading=13,
    )
    section_style = ParagraphStyle(
        "FWSection",
        parent=styles["Heading2"],
        fontName="Helvetica-Bold",
        fontSize=12,
        textColor=_INK,
        spaceBefore=14,
        spaceAfter=8,
        leading=15,
    )
    body = ParagraphStyle(
        "FWBody",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=9.5,
        textColor=_INK,
        leading=12.5,
    )
    label_s = ParagraphStyle(
        "FWLabel",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=8,
        textColor=_MUTED,
        leading=10,
        spaceAfter=2,
    )
    small = ParagraphStyle(
        "FWSmall",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8.5,
        textColor=_INK,
        leading=11,
    )
    footer_style = ParagraphStyle(
        "FWFooter",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8,
        textColor=_MUTED,
        alignment=TA_CENTER,
    )

    story: List[Any] = []

    # Header
    story.append(Paragraph(_esc(_kind_label(record.kind)), title_style))
    story.append(
        Paragraph(
            f"<b>{_esc(project.name or 'Project')}</b>"
            + (f" · {_esc(project.code)}" if project.code else "")
            + (f"<br/>{_esc(project.address)}" if getattr(project, "address", None) else ""),
            sub_style,
        )
    )
    meta = [
        [
            Paragraph(f"<b>Status</b><br/>{_esc(_status_label(record.status))}", small),
            Paragraph(f"<b>Version</b><br/>v{int(record.version or 1)}", small),
            Paragraph(f"<b>Submitted</b><br/>{_esc(_fmt_dt(record.submitted_at))}", small),
            Paragraph(f"<b>Approved</b><br/>{_esc(_fmt_dt(record.approved_at))}", small),
        ]
    ]
    meta_t = Table(meta, colWidths=[1.7 * inch, 1.2 * inch, 2.2 * inch, 2.2 * inch])
    meta_t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), _CARD),
                ("BOX", (0, 0), (-1, -1), 0.6, _LINE),
                ("INNERGRID", (0, 0), (-1, -1), 0.4, _LINE),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]
        )
    )
    story.append(Spacer(1, 8))
    story.append(meta_t)

    # Form sections
    for sec_title, fields in _sorted_fields(definition, payload):
        story.append(Paragraph(_esc(sec_title), section_style))
        for field in fields:
            key = str(field.get("key") or "")
            label = str(field.get("label") or key)
            answer = _format_answer(field, payload.get(key))
            tech_text, tech_imgs = _tech_note(field, payload)
            super_text = _supervisor_text(key, payload)

            answer_hex = "#0f172a"
            if field.get("type") == "pass_fail_na":
                if payload.get(key) == "pass":
                    answer_hex = "#166534"
                elif payload.get(key) == "fail":
                    answer_hex = "#991b1b"

            header_row = Table(
                [
                    [
                        Paragraph(f"<b>{_esc(label)}</b>", body),
                        Paragraph(
                            f'<font color="{answer_hex}"><b>{_esc(answer)}</b></font>',
                            ParagraphStyle("Ans", parent=body, alignment=TA_RIGHT),
                        ),
                    ]
                ],
                colWidths=[5.2 * inch, 1.8 * inch],
            )
            header_row.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0)]))

            blocks: List[Any] = [header_row]

            if tech_text or tech_imgs:
                bits: List[Any] = [Paragraph("TECHNICIAN NOTE", label_s)]
                if tech_text:
                    bits.append(Paragraph(_esc(tech_text).replace("\n", "<br/>"), small))
                img_flow = []
                for fid in tech_imgs[:4]:
                    im = _thumb(db, fid, max_w=1.5 * inch, max_h=1.1 * inch)
                    if im:
                        img_flow.append(im)
                if img_flow:
                    bits.append(Spacer(1, 4))
                    bits.append(Table([img_flow], hAlign="LEFT"))
                tech_box = Table([[bits]], colWidths=[7.0 * inch])
                tech_box.setStyle(
                    TableStyle(
                        [
                            ("BACKGROUND", (0, 0), (-1, -1), _BLUE_BG),
                            ("BOX", (0, 0), (-1, -1), 0.6, _BLUE_BD),
                            ("LEFTPADDING", (0, 0), (-1, -1), 8),
                            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                            ("TOPPADDING", (0, 0), (-1, -1), 6),
                            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                        ]
                    )
                )
                blocks.append(Spacer(1, 4))
                blocks.append(tech_box)

            if super_text:
                bits = [
                    Paragraph("SUPERVISOR NOTE", label_s),
                    Paragraph(_esc(super_text).replace("\n", "<br/>"), small),
                ]
                super_box = Table([[bits]], colWidths=[7.0 * inch])
                super_box.setStyle(
                    TableStyle(
                        [
                            ("BACKGROUND", (0, 0), (-1, -1), _AMBER_BG),
                            ("BOX", (0, 0), (-1, -1), 0.6, _AMBER_BD),
                            ("LEFTPADDING", (0, 0), (-1, -1), 8),
                            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                            ("TOPPADDING", (0, 0), (-1, -1), 6),
                            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                        ]
                    )
                )
                blocks.append(Spacer(1, 4))
                blocks.append(super_box)

            card = Table([[blocks]], colWidths=[7.0 * inch])
            card.setStyle(
                TableStyle(
                    [
                        ("BACKGROUND", (0, 0), (-1, -1), colors.white),
                        ("BOX", (0, 0), (-1, -1), 0.7, _LINE),
                        ("LEFTPADDING", (0, 0), (-1, -1), 10),
                        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                        ("TOPPADDING", (0, 0), (-1, -1), 8),
                        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
                    ]
                )
            )
            story.append(KeepTogether([card, Spacer(1, 6)]))

    # Photos
    if photos:
        story.append(Paragraph("Photos with descriptions", section_style))
        row: List[Any] = []
        rows: List[List[Any]] = []
        for p in photos:
            caption = (p.phrase_text_snapshot or "").strip() or "No description"
            notes = (p.extra_notes or "").strip()
            im = _thumb(db, str(p.file_object_id), max_w=3.2 * inch, max_h=2.2 * inch)
            cell_bits: List[Any] = []
            if im:
                cell_bits.append(im)
            else:
                cell_bits.append(Paragraph("<i>Image unavailable</i>", small))
            cell_bits.append(Spacer(1, 3))
            cell_bits.append(Paragraph(_esc(caption), small))
            if notes:
                cell_bits.append(Paragraph(f"<font color='#64748b'>{_esc(notes)}</font>", small))
            cell = Table([[cell_bits]], colWidths=[3.35 * inch])
            cell.setStyle(
                TableStyle(
                    [
                        ("BOX", (0, 0), (-1, -1), 0.5, _LINE),
                        ("BACKGROUND", (0, 0), (-1, -1), _CARD),
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
                rows.append(row)
                row = []
        if row:
            while len(row) < 2:
                row.append("")
            rows.append(row)
        for r in rows:
            t = Table([r], colWidths=[3.5 * inch, 3.5 * inch])
            t.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 2), ("RIGHTPADDING", (0, 0), (-1, -1), 2)]))
            story.append(t)
            story.append(Spacer(1, 6))

    final = (record.final_comments or "").strip()
    if final:
        story.append(Paragraph("Additional comments", section_style))
        box = Table([[Paragraph(_esc(final).replace("\n", "<br/>"), body)]], colWidths=[7.0 * inch])
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

    story.append(Spacer(1, 18))
    story.append(
        Paragraph(
            f"Generated {_esc(_fmt_dt(datetime.now(pytz.UTC)))} · Mack Kirk Field Report",
            footer_style,
        )
    )

    def _on_page(canvas, _doc):
        canvas.saveState()
        canvas.setStrokeColor(_BRAND)
        canvas.setLineWidth(2.5)
        canvas.line(0.7 * inch, letter[1] - 0.42 * inch, letter[0] - 0.7 * inch, letter[1] - 0.42 * inch)
        canvas.setFont("Helvetica", 8)
        canvas.setFillColor(_MUTED)
        canvas.drawRightString(letter[0] - 0.7 * inch, 0.4 * inch, f"Page {canvas.getPageNumber()}")
        canvas.restoreState()

    doc.build(story, onFirstPage=_on_page, onLaterPages=_on_page)
    return buf.getvalue()
