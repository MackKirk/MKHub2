"""Generate a printable PDF for a finalized dynamic safety inspection (ReportLab)."""
from __future__ import annotations

import io
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional
from xml.sax.saxutils import escape as xml_escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import Image, PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from reportlab.lib.utils import ImageReader
from sqlalchemy.orm import Session

from ..models.models import FileObject, User, EmployeeProfile
from .onboarding_storage import read_file_object_bytes

logger = logging.getLogger(__name__)

_MAX_IMG_DIM = 420


def _esc(s: Any) -> str:
    return xml_escape(str(s or ""), entities={'"': "&quot;", "'": "&apos;"})


def _is_field_visible(field: Dict[str, Any], payload: Dict[str, Any]) -> bool:
    vis = field.get("visibility")
    if not vis or not isinstance(vis, dict):
        return True
    when = vis.get("when")
    if not when or not isinstance(when, dict):
        return True
    fk = str(when.get("fieldKey") or "").strip()
    if not fk:
        return True
    val = payload.get(fk)
    op = when.get("op") or "equals"
    if op == "notEmpty":
        if val is None:
            return False
        if isinstance(val, str):
            return val.strip() != ""
        if isinstance(val, list):
            return len(val) > 0
        if isinstance(val, dict):
            return len(val) > 0
        return True
    if op == "equals":
        return str(val) == str(when.get("value", ""))
    if op == "in" and isinstance(when.get("value"), list):
        return str(val) in [str(x) for x in when["value"]]
    return True


def _user_display(db: Session, uid: str) -> str:
    try:
        import uuid as _uuid

        u = db.query(User).filter(User.id == _uuid.UUID(str(uid).strip())).first()
        if not u:
            return uid
        ep = db.query(EmployeeProfile).filter(EmployeeProfile.user_id == u.id).first()
        if ep:
            parts = [str(getattr(ep, "first_name", "") or "").strip(), str(getattr(ep, "last_name", "") or "").strip()]
            name = " ".join(p for p in parts if p).strip()
            if name:
                return name
        return u.username or uid
    except Exception:
        return uid


def _format_field_value(db: Session, field: Dict[str, Any], payload: Dict[str, Any]) -> str:
    key = str(field.get("key") or "").strip()
    ftype = str(field.get("type") or "")
    val = payload.get(key)
    if ftype == "text_info":
        return ""
    if ftype == "checkbox":
        return "Yes" if val is True else "No"
    if ftype in ("short_text", "long_text", "number", "date", "time"):
        return str(val).strip() if val is not None else ""
    if ftype == "pass_fail_na":
        return str(val or "").upper() or "—"
    if ftype == "pass_fail_total":
        if not val or not isinstance(val, dict):
            return "—"
        o = val
        return f"Pass {o.get('pass', 0)} · Fail {o.get('fail', 0)} · NA {o.get('na', 0)}"
    if ftype == "dropdown_single":
        return str(val or "").strip() or "—"
    if ftype == "dropdown_multi":
        if not isinstance(val, list):
            return "—"
        return ", ".join(str(x) for x in val) if val else "—"
    if ftype == "yes_no_na":
        if not val or not isinstance(val, dict):
            return "—"
        st = str(val.get("status") or "").upper()
        comments = str(val.get("comments") or "").strip()
        imgs = val.get("comment_image_ids") or []
        n_img = len(imgs) if isinstance(imgs, list) else 0
        bits = [st] if st else ["—"]
        if comments:
            bits.append(f"Notes: {comments}")
        if n_img:
            bits.append(f"Photos: {n_img}")
        return " · ".join(bits)
    if ftype == "user_single":
        if not val:
            return "—"
        return _user_display(db, str(val))
    if ftype == "user_multi":
        if not isinstance(val, list) or not val:
            return "—"
        return ", ".join(_user_display(db, str(x)) for x in val)
    if ftype == "gps":
        if not val or not isinstance(val, dict):
            return "—"
        lat, lng = val.get("lat"), val.get("lng")
        if lat is None or lng is None:
            return "—"
        return f"{lat}, {lng}"
    if ftype in ("equipment_single", "equipment_multi"):
        if isinstance(val, list):
            return ", ".join(str(x) for x in val) if val else "—"
        return str(val or "").strip() or "—"
    if ftype == "image_view":
        if isinstance(val, str) and val.strip():
            return f"Image file: {val.strip()}"
        if isinstance(val, dict):
            ids = val.get("file_object_ids")
            if isinstance(ids, list) and ids:
                return f"{len(ids)} image(s)"
        return "—"
    if ftype == "pdf_insert":
        if isinstance(val, str) and val.strip():
            return f"PDF attachment: {val.strip()}"
        if isinstance(val, dict):
            ids = val.get("file_object_ids")
            if isinstance(ids, list) and ids:
                return f"{len(ids)} PDF file(s)"
        return "—"
    if ftype == "pdf_view":
        return "Reference PDF(s) (see template)"
    return str(val) if val is not None else "—"


def _load_image_flowable(db: Session, file_object_id: str, max_w: float = 2.8 * inch) -> Optional[Image]:
    try:
        import uuid as _uuid

        fo = db.query(FileObject).filter(FileObject.id == _uuid.UUID(str(file_object_id).strip())).first()
        if not fo:
            return None
        data = read_file_object_bytes(db, fo)
        if not data:
            return None
        bio = io.BytesIO(data)
        ir = ImageReader(bio)
        iw, ih = ir.getSize()
        scale = min(max_w / float(iw), _MAX_IMG_DIM / float(ih), 1.0)
        w, h = iw * scale, ih * scale
        bio.seek(0)
        return Image(bio, width=w, height=h)
    except Exception as e:
        logger.warning("safety_inspection_pdf: could not embed image %s: %s", file_object_id, e)
        return None


def _sorted_sections(definition: Dict[str, Any]) -> List[Dict[str, Any]]:
    secs = definition.get("sections") or []
    if not isinstance(secs, list):
        return []
    out = [s for s in secs if isinstance(s, dict)]
    out.sort(key=lambda s: int(s.get("order") or 0))
    return out


def _sorted_fields(sec: Dict[str, Any]) -> List[Dict[str, Any]]:
    fields = sec.get("fields") or []
    if not isinstance(fields, list):
        return []
    out = [f for f in fields if isinstance(f, dict)]
    out.sort(key=lambda f: int(f.get("order") or 0))
    return out


def build_safety_inspection_pdf_bytes(
    db: Session,
    *,
    definition: Dict[str, Any],
    form_payload: Dict[str, Any],
    project_name: str,
    project_code: str,
    project_address: str,
    template_name: str,
    template_version_label: str,
    inspection_id: str,
    inspection_date: Optional[datetime],
    finalized_by_name: str,
    document_kind: str = "final",
    extra_signers: Optional[List[Dict[str, Any]]] = None,
) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=letter,
        leftMargin=0.65 * inch,
        rightMargin=0.65 * inch,
        topMargin=0.6 * inch,
        bottomMargin=0.65 * inch,
        title=(template_name or "Safety inspection")[:120],
    )
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "CoverTitle",
        parent=styles["Title"],
        fontSize=18,
        textColor=colors.HexColor("#111827"),
        spaceAfter=10,
    )
    sub_style = ParagraphStyle(
        "CoverSub",
        parent=styles["Normal"],
        fontSize=10,
        textColor=colors.HexColor("#4b5563"),
        leading=14,
    )
    h2 = ParagraphStyle(
        "H2",
        parent=styles["Heading2"],
        fontSize=12,
        textColor=colors.HexColor("#1f2937"),
        spaceBefore=14,
        spaceAfter=8,
    )
    small = ParagraphStyle("Small", parent=styles["Normal"], fontSize=8, textColor=colors.HexColor("#6b7280"))

    story: List[Any] = []
    kind = (document_kind or "final").strip().lower()
    if kind not in ("final", "interim"):
        kind = "final"
    extras = extra_signers if isinstance(extra_signers, list) else []
    date_s = inspection_date.strftime("%Y-%m-%d %H:%M UTC") if inspection_date else "—"
    tv = (template_version_label or "").strip()
    tv_line = f"Version: {tv}" if tv else ""

    story.append(Paragraph(_esc(template_name or "Safety inspection"), title_style))
    story.append(Paragraph(f"<b>Project:</b> {_esc(project_name)} ({_esc(project_code)})", sub_style))
    if project_address:
        story.append(Paragraph(f"<b>Location:</b> {_esc(project_address)}", sub_style))
    story.append(Paragraph(f"<b>Inspection ID:</b> {_esc(inspection_id)}", sub_style))
    story.append(Paragraph(f"<b>Inspection date:</b> {_esc(date_s)}", sub_style))
    if tv_line:
        story.append(Paragraph(_esc(tv_line), sub_style))
    if kind == "interim":
        story.append(Paragraph("<b>Status:</b> Pending additional signatures", sub_style))
        story.append(
            Paragraph(
                "<i>This document is not final until all requested signers have signed.</i>",
                sub_style,
            )
        )
    else:
        story.append(Paragraph("<b>Status:</b> Finalized", sub_style))
    story.append(Paragraph(f"<b>Prepared / finalized by:</b> {_esc(finalized_by_name)}", sub_style))
    story.append(Spacer(1, 0.25 * inch))

    for sec in _sorted_sections(definition):
        stitle = str(sec.get("title") or "Section").strip()
        fields = _sorted_fields(sec)
        rows: List[List[Any]] = []
        image_ids_after: List[str] = []
        for field in fields:
            if not _is_field_visible(field, form_payload):
                continue
            ftype = str(field.get("type") or "")
            if ftype == "text_info":
                lbl = str(field.get("label") or "")
                if lbl:
                    story.append(Paragraph(_esc(lbl), sub_style))
                continue
            label = str(field.get("label") or field.get("key") or "Field")
            text_val = _format_field_value(db, field, form_payload)
            key = str(field.get("key") or "")
            if ftype == "image_view":
                v = form_payload.get(key)
                if isinstance(v, str) and v.strip():
                    image_ids_after.append(v.strip())
                elif isinstance(v, dict):
                    ids = v.get("file_object_ids")
                    if isinstance(ids, list):
                        for i in ids:
                            if isinstance(i, str) and i.strip():
                                image_ids_after.append(i.strip())
            rows.append(
                [
                    Paragraph(_esc(label), sub_style),
                    Paragraph(_esc(text_val), sub_style),
                ]
            )
        if rows:
            story.append(Paragraph(_esc(stitle), h2))
            t = Table(rows, colWidths=[2.15 * inch, 4.35 * inch])
            t.setStyle(
                TableStyle(
                    [
                        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f9fafb")),
                        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#e5e7eb")),
                        ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#e5e7eb")),
                        ("VALIGN", (0, 0), (-1, -1), "TOP"),
                        ("LEFTPADDING", (0, 0), (-1, -1), 8),
                        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                        ("TOPPADDING", (0, 0), (-1, -1), 6),
                        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                    ]
                )
            )
            story.append(t)
            story.append(Spacer(1, 0.12 * inch))
        for fid in image_ids_after[:6]:
            im = _load_image_flowable(db, fid)
            if im:
                story.append(Spacer(1, 0.08 * inch))
                story.append(im)

    sig_id = str(form_payload.get("_worker_signature_file_id") or "").strip()
    if sig_id:
        story.append(PageBreak())
        story.append(Paragraph("Worker signature", h2))
        meta_lines = []
        sn = str(form_payload.get("_worker_signature_signer_name") or "").strip()
        sa = str(form_payload.get("_worker_signature_signed_at") or "").strip()
        loc = str(form_payload.get("_worker_signature_location_label") or "").strip()
        if sn:
            meta_lines.append(f"Signed by: {sn}")
        if sa:
            meta_lines.append(f"Timestamp (UTC): {sa}")
        if loc:
            meta_lines.append(f"Location: {loc}")
        for line in meta_lines:
            story.append(Paragraph(_esc(line), sub_style))
        img = _load_image_flowable(db, sig_id, max_w=4.5 * inch)
        if img:
            story.append(Spacer(1, 0.15 * inch))
            story.append(img)

    if extras:
        story.append(PageBreak())
        story.append(Paragraph("Additional signers", h2))
        for ex in extras:
            if not isinstance(ex, dict):
                continue
            nm = str(ex.get("display_name") or "Signer").strip()
            pending = bool(ex.get("pending"))
            story.append(Paragraph(_esc(nm), sub_style))
            if pending:
                story.append(Paragraph("<i>Signature pending</i>", sub_style))
            else:
                sa = str(ex.get("signed_at_utc") or "").strip()
                loc = str(ex.get("location_label") or "").strip()
                if sa:
                    story.append(Paragraph(_esc(f"Signed at: {sa}"), sub_style))
                if loc:
                    story.append(Paragraph(_esc(f"Location: {loc}"), sub_style))
                fid = str(ex.get("signature_file_object_id") or "").strip()
                if fid:
                    im = _load_image_flowable(db, fid, max_w=4.5 * inch)
                    if im:
                        story.append(Spacer(1, 0.1 * inch))
                        story.append(im)
            story.append(Spacer(1, 0.2 * inch))

    def _footer(canvas, doc):  # noqa: ARG001
        canvas.saveState()
        canvas.setFont("Helvetica", 8)
        canvas.setFillColor(colors.HexColor("#9ca3af"))
        suffix = " · INTERIM" if kind == "interim" else ""
        text = f"{project_code} · Page {canvas.getPageNumber()}{suffix}"
        canvas.drawCentredString(letter[0] / 2, 0.45 * inch, text)
        canvas.restoreState()

    doc.build(story, onFirstPage=_footer, onLaterPages=_footer)
    pdf = buf.getvalue()
    buf.close()
    return pdf
