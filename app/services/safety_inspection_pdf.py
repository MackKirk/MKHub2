"""Generate a printable PDF for a finalized dynamic safety inspection (ReportLab, MK template)."""
from __future__ import annotations

import io
import logging
import os
import uuid as uuid_mod
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple, Union

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    Image,
    KeepTogether,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)
from reportlab.lib.utils import ImageReader
from sqlalchemy.orm import Session

# Registers Montserrat (used in Paragraph styles)
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

from ..models.models import EmployeeProfile, FileObject, FleetAsset, FormCustomListItem, User
from .onboarding_storage import read_file_object_bytes

logger = logging.getLogger(__name__)

_MAX_IMG_DIM = 420
_MAX_IMAGES_PER_FIELD = 24

# Match DynamicSafetyForm PFNA / YNA (tailwind-like) — only the selected tile is filled; others stay neutral
_GREEN_BG = colors.HexColor("#dcfce7")
_GREEN_BD = colors.HexColor("#4ade80")
_RED_BG = colors.HexColor("#fee2e2")
_RED_BD = colors.HexColor("#f87171")
_GRAY_BG = colors.HexColor("#f3f4f6")
_GRAY_BD = colors.HexColor("#d1d5db")
_NEUTRAL_BG = colors.white
_NEUTRAL_BD = colors.HexColor("#e5e7eb")
_MUTED_TXT = "#9ca3af"

_MK_TEMPLATE_REL = os.path.join("proposals", "assets", "templates", "page_MK_template.png")


def _esc(s: Any) -> str:
    from xml.sax.saxutils import escape as xml_escape

    return xml_escape(str(s or ""), entities={'"': "&quot;", "'": "&apos;"})


def _template_bg_path() -> str:
    base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    return os.path.normpath(os.path.join(base, _MK_TEMPLATE_REL))


def _draw_mk_banner_form_title(canvas: Any, title: str, *, visible: bool = True) -> None:
    """Form name in white on the dark header band (aligned with proposals `page_MK_template`)."""
    if not visible:
        return
    from reportlab.pdfbase.pdfmetrics import stringWidth

    text = (title or "").strip() or "Safety inspection"
    font = "Montserrat-Bold" if _pdf_dyn else "Helvetica-Bold"
    max_w = HEADER_TITLE_MAX_WIDTH
    size = HEADER_TITLE_BASE_SIZE
    while size > HEADER_TITLE_MIN_SIZE and stringWidth(text, font, size) > max_w:
        size -= 0.5

    canvas.saveState()
    canvas.setFillColor(colors.white)
    wrap = _pdf_wrap_text
    if stringWidth(text, font, size) > max_w and wrap:
        lines = wrap(text, font, size, max_w)[:2]
        canvas.setFont(font, size)
        line_height = size + 4
        y_title = 784
        for line in lines:
            canvas.drawString(40, y_title, line)
            y_title -= line_height
    elif stringWidth(text, font, size) > max_w:
        el = "…"
        t = text
        canvas.setFont(font, size)
        while len(t) > 1 and stringWidth(t + el, font, size) > max_w:
            t = t[:-1]
        canvas.drawString(40, 784, t + el)
    else:
        canvas.setFont(font, size)
        canvas.drawString(40, 784, text)
    canvas.restoreState()


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
        u = db.query(User).filter(User.id == uuid_mod.UUID(str(uid).strip())).first()
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


def _fleet_display(db: Session, asset_id: str) -> str:
    try:
        fa = db.query(FleetAsset).filter(FleetAsset.id == uuid_mod.UUID(str(asset_id).strip())).first()
        if not fa:
            return asset_id
        name = str(fa.name or "").strip()
        unit = str(fa.unit_number or "").strip()
        if name and unit:
            return f"{name} ({unit})"
        return name or asset_id
    except Exception:
        return asset_id


def _collect_custom_list_ids_from_definition(definition: Dict[str, Any]) -> List[uuid_mod.UUID]:
    out: List[uuid_mod.UUID] = []
    for sec in definition.get("sections") or []:
        if not isinstance(sec, dict):
            continue
        for f in sec.get("fields") or []:
            if not isinstance(f, dict):
                continue
            osrc = f.get("optionsSource")
            if isinstance(osrc, dict) and osrc.get("type") == "custom_list":
                cid = osrc.get("customListId")
                if cid:
                    try:
                        out.append(uuid_mod.UUID(str(cid).strip()))
                    except Exception:
                        pass
    seen = set()
    uniq: List[uuid_mod.UUID] = []
    for u in out:
        if u not in seen:
            seen.add(u)
            uniq.append(u)
    return uniq


def _build_custom_list_label_maps(db: Session, list_ids: List[uuid_mod.UUID]) -> Dict[str, Dict[str, str]]:
    """Map customListId str -> (item_id str -> hierarchical label)."""
    result: Dict[str, Dict[str, str]] = {}
    for lid in list_ids:
        rows = db.query(FormCustomListItem).filter(FormCustomListItem.list_id == lid).all()
        rows_by_id = {r.id: r for r in rows}

        def path_label(item: FormCustomListItem) -> str:
            parts: List[str] = []
            cur: Optional[FormCustomListItem] = item
            guard = 0
            while cur is not None and guard < 8:
                parts.insert(0, cur.name or "")
                cur = rows_by_id.get(cur.parent_id) if cur.parent_id else None
                guard += 1
            return " › ".join(p for p in parts if p)

        m: Dict[str, str] = {}
        for it in rows:
            subs = [x for x in rows if x.parent_id == it.id]
            if not subs:
                m[str(it.id)] = path_label(it)
        result[str(lid)] = m
    return result


def _static_option_label(field: Dict[str, Any], raw_val: str) -> str:
    opts = field.get("options")
    if not opts or not isinstance(opts, list):
        return raw_val
    for o in opts:
        if isinstance(o, str) and o == raw_val:
            return o
        if isinstance(o, dict) and str(o.get("value", "")) == raw_val:
            return str(o.get("label") or o.get("value") or raw_val)
    return raw_val


def _resolve_dropdown_value(
    db: Session,
    field: Dict[str, Any],
    raw: str,
    list_maps: Dict[str, Dict[str, str]],
) -> str:
    if not raw or not raw.strip():
        return "—"
    osrc = field.get("optionsSource")
    if isinstance(osrc, dict) and osrc.get("type") == "custom_list":
        lid = str(osrc.get("customListId") or "").strip()
        if lid and lid in list_maps:
            return list_maps[lid].get(raw.strip(), raw)
        return raw
    return _static_option_label(field, raw)


def _get_side_comment(payload: Dict[str, Any], field_key: str) -> Tuple[str, List[str]]:
    raw = payload.get("_fieldComments")
    if not raw or not isinstance(raw, dict):
        return "", []
    entry = raw.get(field_key)
    if isinstance(entry, str):
        return entry.strip(), []
    if isinstance(entry, dict):
        text = str(entry.get("text") or "").strip()
        arr = entry.get("imageIds") or entry.get("images")
        ids: List[str] = []
        if isinstance(arr, list):
            ids = [str(x).strip() for x in arr if isinstance(x, str) and str(x).strip()]
        return text, ids
    return "", []


def _get_yn_comment_images(val: Any) -> List[str]:
    if not val or not isinstance(val, dict):
        return []
    imgs = val.get("commentImageIds") or val.get("comment_image_ids") or []
    if not isinstance(imgs, list):
        return []
    return [str(x).strip() for x in imgs if isinstance(x, str) and str(x).strip()]


def _collect_image_view_ids(key: str, payload: Dict[str, Any]) -> List[str]:
    v = payload.get(key)
    out: List[str] = []
    if isinstance(v, str) and v.strip():
        out.append(v.strip())
    elif isinstance(v, dict):
        ids = v.get("file_object_ids")
        if isinstance(ids, list):
            for i in ids:
                if isinstance(i, str) and i.strip():
                    out.append(i.strip())
    return out


def _load_image_flowable(db: Session, file_object_id: str, max_w: float = 2.6 * inch) -> Optional[Image]:
    try:
        fo = db.query(FileObject).filter(FileObject.id == uuid_mod.UUID(str(file_object_id).strip())).first()
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


def _badge_style(name: str, parent: ParagraphStyle) -> ParagraphStyle:
    return ParagraphStyle(
        name,
        parent=parent,
        fontSize=9,
        leading=11,
        alignment=TA_CENTER,
        textColor=colors.black,
    )


def _mini_badge_table(
    badge_defs: List[Tuple[str, str, Any, str, Any]],
    selected: str,
    badge_style: ParagraphStyle,
    col_widths: Optional[List[float]] = None,
) -> Table:
    """badge_defs: (key, letter, bg, txt_hex, border). Only the selected key gets color; others are neutral."""
    cells: List[Any] = []
    sel = (selected or "").lower().strip()
    n = len(badge_defs)
    for key, letter, bg, txt_hex, bd in badge_defs:
        on = sel == key
        tx = txt_hex if on else _MUTED_TXT
        p = Paragraph(
            f'<para align="center"><b><font color="{tx}">{_esc(letter)}</font></b></para>',
            badge_style,
        )
        cells.append(p)
    widths = col_widths if col_widths and len(col_widths) == n else [36.0] * n
    t = Table([cells], colWidths=widths, rowHeights=[22])
    ts = [
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("LEFTPADDING", (0, 0), (-1, -1), 2),
        ("RIGHTPADDING", (0, 0), (-1, -1), 2),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
    ]
    for i, (key, _l, bg, _tx, bd) in enumerate(badge_defs):
        on = sel == key
        ts.append(("BACKGROUND", (i, 0), (i, 0), bg if on else _NEUTRAL_BG))
        ts.append(("BOX", (i, 0), (i, 0), 2.5 if on else 0.75, bd if on else _NEUTRAL_BD))
    t.setStyle(TableStyle(ts))
    return t


def _pfna_badges(selected: str, badge_style: ParagraphStyle) -> Table:
    defs = [
        ("pass", "P", _GREEN_BG, "#166534", _GREEN_BD),
        ("fail", "F", _RED_BG, "#991b1b", _RED_BD),
        ("na", "NA", _GRAY_BG, "#374151", _GRAY_BD),
    ]
    return _mini_badge_table(defs, selected, badge_style)


def _yna_badges(selected: str, badge_style: ParagraphStyle) -> Table:
    defs = [
        ("yes", "Y", _GREEN_BG, "#166534", _GREEN_BD),
        ("no", "N", _RED_BG, "#991b1b", _RED_BD),
        ("na", "NA", _GRAY_BG, "#374151", _GRAY_BD),
    ]
    return _mini_badge_table(defs, selected, badge_style)


def _checkbox_badge(checked: bool, badge_style: ParagraphStyle) -> Table:
    defs = [
        ("yes", "Yes", _GREEN_BG, "#166534", _GREEN_BD),
        ("no", "No", _RED_BG, "#991b1b", _RED_BD),
    ]
    sel = "yes" if checked else "no"
    return _mini_badge_table(defs, sel, badge_style, col_widths=[52.0, 52.0])


def _pft_badges(val: Dict[str, Any], badge_style: ParagraphStyle) -> Table:
    """Aggregate P/F/NA counts — color only columns with count > 0 (matches “only marked” emphasis)."""
    o = val if isinstance(val, dict) else {}
    np = int(o.get("pass") or 0)
    nf = int(o.get("fail") or 0)
    nn = int(o.get("na") or 0)

    cols: List[Tuple[int, str, Any, str, Any]] = [
        (np, "P", _GREEN_BG, "#166534", _GREEN_BD),
        (nf, "F", _RED_BG, "#991b1b", _RED_BD),
        (nn, "NA", _GRAY_BG, "#374151", _GRAY_BD),
    ]

    row: List[Any] = []
    for n, letter, bg, txt_hex, bd in cols:
        on = n > 0
        tx = txt_hex if on else _MUTED_TXT
        row.append(
            Paragraph(
                f'<para align="center"><b><font color="{tx}">{letter} {n}</font></b></para>',
                badge_style,
            )
        )

    t = Table([row], colWidths=[52, 52, 52], rowHeights=[22])
    ts = [
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("LEFTPADDING", (0, 0), (-1, -1), 2),
        ("RIGHTPADDING", (0, 0), (-1, -1), 2),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
    ]
    for i, (n, _letter, bg, _tx, bd) in enumerate(cols):
        on = n > 0
        ts.append(("BACKGROUND", (i, 0), (i, 0), bg if on else _NEUTRAL_BG))
        ts.append(("BOX", (i, 0), (i, 0), 2.5 if on else 0.75, bd if on else _NEUTRAL_BD))
    t.setStyle(TableStyle(ts))
    return t


def _plain_text_value(db: Session, field: Dict[str, Any], payload: Dict[str, Any], list_maps: Dict[str, Dict[str, str]]) -> str:
    key = str(field.get("key") or "").strip()
    ftype = str(field.get("type") or "")
    val = payload.get(key)
    if ftype == "text_info":
        return ""
    if ftype in ("short_text", "long_text", "number", "date", "time"):
        return str(val).strip() if val is not None else ""
    if ftype == "dropdown_single":
        return _resolve_dropdown_value(db, field, str(val or "").strip(), list_maps)
    if ftype == "dropdown_multi":
        if not isinstance(val, list):
            return "—"
        parts = [_resolve_dropdown_value(db, field, str(x).strip(), list_maps) for x in val]
        return ", ".join(parts) if parts else "—"
    if ftype == "user_single":
        return _user_display(db, str(val)) if val else "—"
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
            return ", ".join(_fleet_display(db, str(x)) for x in val) if val else "—"
        return _fleet_display(db, str(val)) if val else "—"
    if ftype == "image_view":
        ids = _collect_image_view_ids(key, payload)
        return f"{len(ids)} photo(s)" if ids else "—"
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


def _yn_notes_text(val: Any) -> str:
    if not val or not isinstance(val, dict):
        return ""
    return str(val.get("comments") or "").strip()


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
    list_ids = _collect_custom_list_ids_from_definition(definition)
    list_maps = _build_custom_list_label_maps(db, list_ids) if list_ids else {}

    buf = io.BytesIO()
    page_w, page_h = A4
    lm, rm, tm, bm = 40, 40, 100, 52
    frame_w = page_w - lm - rm
    frame_h = page_h - tm - bm

    kind = (document_kind or "final").strip().lower()
    if kind not in ("final", "interim"):
        kind = "final"
    extras = extra_signers if isinstance(extra_signers, list) else []

    styles = getSampleStyleSheet()
    sub_style = ParagraphStyle(
        "CovSub",
        parent=styles["Normal"],
        fontName="Montserrat" if _pdf_dyn else "Helvetica",
        fontSize=9.5,
        textColor=colors.HexColor("#4b5563"),
        leading=13,
    )
    h2 = ParagraphStyle(
        "SecH",
        parent=styles["Heading2"],
        fontName="Montserrat-Bold" if _pdf_dyn else "Helvetica-Bold",
        fontSize=11.5,
        textColor=colors.HexColor("#d62028"),
        spaceBefore=12,
        spaceAfter=6,
    )
    lbl_style = ParagraphStyle(
        "FldLbl",
        parent=styles["Normal"],
        fontName="Montserrat-Bold" if _pdf_dyn else "Helvetica-Bold",
        fontSize=9,
        textColor=colors.HexColor("#374151"),
        leading=12,
    )
    val_style = ParagraphStyle(
        "FldVal",
        parent=styles["Normal"],
        fontName="Montserrat" if _pdf_dyn else "Helvetica",
        fontSize=9,
        textColor=colors.HexColor("#111827"),
        leading=12,
    )
    badge_chr = _badge_style("BadgeChr", val_style)

    col_label_w = frame_w * 0.32
    col_val_w = frame_w * 0.68

    story: List[Any] = []
    date_s = inspection_date.strftime("%Y-%m-%d %H:%M UTC") if inspection_date else "—"
    tv = (template_version_label or "").strip()
    tv_line = f"Version: {tv}" if tv else ""

    # Form title is drawn in white on the MK template header band on every page (see on_page).
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
    story.append(Spacer(1, 0.15 * inch))

    for sec in _sorted_sections(definition):
        stitle = str(sec.get("title") or "Section").strip()
        fields = _sorted_fields(sec)
        block: List[Any] = []
        has_content = False
        for field in fields:
            if not _is_field_visible(field, form_payload):
                continue
            ftype = str(field.get("type") or "")
            if ftype == "text_info":
                lbl = str(field.get("label") or "")
                if lbl:
                    block.append(Paragraph(_esc(lbl), sub_style))
                    has_content = True
                continue

            key = str(field.get("key") or "")
            label = str(field.get("label") or field.get("key") or "Field")
            label_p = Paragraph(_esc(label), lbl_style)

            val_flow: Union[Paragraph, Table]
            extra_flows: List[Any] = []
            img_ids: List[str] = []

            if ftype == "pass_fail_na":
                sel = str(form_payload.get(key) or "").strip().lower()
                val_flow = _pfna_badges(sel, badge_chr)
            elif ftype == "yes_no_na":
                raw = form_payload.get(key)
                st = ""
                if isinstance(raw, dict):
                    st = str(raw.get("status") or "").strip().lower()
                val_flow = _yna_badges(st, badge_chr)
                notes = _yn_notes_text(raw)
                if notes:
                    extra_flows.append(Paragraph(f"<b>Notes:</b> {_esc(notes)}", val_style))
                img_ids.extend(_get_yn_comment_images(raw))
            elif ftype == "checkbox":
                val_flow = _checkbox_badge(form_payload.get(key) is True, badge_chr)
            elif ftype == "pass_fail_total":
                val_flow = _pft_badges(form_payload.get(key) or {}, badge_chr)
            else:
                txt = _plain_text_value(db, field, form_payload, list_maps)
                val_flow = Paragraph(_esc(txt), val_style)

            sc_text, sc_imgs = _get_side_comment(form_payload, key)
            if sc_text:
                extra_flows.append(Paragraph(f"<b>Comment:</b> {_esc(sc_text)}", val_style))
            img_ids.extend(sc_imgs)

            if ftype == "image_view":
                img_ids.extend(_collect_image_view_ids(key, form_payload))

            # Dedupe preserve order
            seen_i: set = set()
            img_unique: List[str] = []
            for i in img_ids:
                if i not in seen_i:
                    seen_i.add(i)
                    img_unique.append(i)
            img_ids = img_unique[:_MAX_IMAGES_PER_FIELD]

            value_stack: List[Any] = [val_flow]
            value_stack.extend(extra_flows)
            if img_ids:
                for fid in img_ids:
                    im = _load_image_flowable(db, fid, max_w=min(col_val_w * 0.95, 3.2 * inch))
                    if im:
                        value_stack.append(Spacer(1, 6))
                        value_stack.append(im)

            if len(value_stack) == 1:
                value_cell: Any = value_stack[0]
            else:
                inner_data = [[v] for v in value_stack]
                value_cell = Table(inner_data, colWidths=[col_val_w])
                value_cell.setStyle(
                    TableStyle(
                        [
                            ("VALIGN", (0, 0), (-1, -1), "TOP"),
                            ("LEFTPADDING", (0, 0), (-1, -1), 0),
                            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                            ("TOPPADDING", (0, 0), (-1, -1), 0),
                            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                        ]
                    )
                )

            row_tbl = Table([[label_p, value_cell]], colWidths=[col_label_w, col_val_w])
            row_tbl.setStyle(
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
            block.append(KeepTogether(row_tbl))
            block.append(Spacer(1, 8))
            has_content = True

        if has_content:
            story.append(Paragraph(_esc(stitle), h2))
            story.extend(block)

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
        img = _load_image_flowable(db, sig_id, max_w=min(frame_w * 0.85, 4.5 * inch))
        if img:
            story.append(Spacer(1, 0.12 * inch))
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
                    im = _load_image_flowable(db, fid, max_w=min(frame_w * 0.85, 4.5 * inch))
                    if im:
                        story.append(Spacer(1, 0.08 * inch))
                        story.append(im)
            story.append(Spacer(1, 0.16 * inch))

    tmpl_path = _template_bg_path()
    use_bg = _get_cached_bg_reader and os.path.exists(tmpl_path)

    header_title = (template_name or "Safety inspection").strip() or "Safety inspection"

    def on_page(canvas: Any, doc: Any) -> None:
        canvas.saveState()
        try:
            if use_bg and _get_cached_bg_reader:
                bg = _get_cached_bg_reader(tmpl_path)
                canvas.drawImage(bg, 0, 0, width=page_w, height=page_h)
                _draw_mk_banner_form_title(canvas, header_title, visible=True)
        except Exception as e:
            logger.warning("safety_inspection_pdf: background draw failed: %s", e)
        finally:
            canvas.restoreState()

    def on_page_end(canvas: Any, doc: Any) -> None:
        canvas.saveState()
        canvas.setFont("Helvetica", 8)
        canvas.setFillColor(colors.HexColor("#9ca3af"))
        suffix = " · INTERIM" if kind == "interim" else ""
        text = f"{project_code} · Page {canvas.getPageNumber()}{suffix}"
        canvas.drawCentredString(page_w / 2, 18, text)
        canvas.restoreState()

    frame = Frame(lm, bm, frame_w, frame_h, id="main", leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
    pt = PageTemplate(id="main", frames=[frame], onPage=on_page, onPageEnd=on_page_end)

    doc = BaseDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=lm,
        rightMargin=rm,
        topMargin=tm,
        bottomMargin=bm,
        title=(template_name or "Safety inspection")[:120],
    )
    doc.addPageTemplates([pt])
    doc.build(story)
    pdf = buf.getvalue()
    buf.close()
    return pdf
