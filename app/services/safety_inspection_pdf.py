"""Generate a printable PDF for a finalized dynamic safety inspection (ReportLab, MK template)."""
from __future__ import annotations

import io
import logging
import os
import uuid as uuid_mod
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple, Union

import pytz

# Use pytz (already in requirements): Windows often has no IANA DB for zoneinfo without extra `tzdata`.
_PDF_DISPLAY_TZ = pytz.timezone("America/Vancouver")
_PDF_TZ_LABEL = "Vancouver, BC"

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    Image,
    CondPageBreak,
    KeepTogether,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)
from reportlab.platypus.flowables import Flowable, TopPadder
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

# page_MK_template: dark band ends in a diagonal — keep white text left of that edge (narrower than proposals title width).
_SAFETY_BANNER_TEXT_MAX_WIDTH = 300
# First baseline for header stack; slightly higher than proposals (784) so the block sits a bit further up in the band.
_SAFETY_BANNER_FIRST_BASELINE = 794

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
# Light gray for empty field placeholder (italic in paragraph XML)
_NO_ANSWER_HEX = "#b8c4d0"
_CHOICE_CIRCLE_DIAMETER = 24.0
_CHOICE_CIRCLE_TEXT_SIZE = 9.0

_MK_TEMPLATE_REL = os.path.join("proposals", "assets", "templates", "page_MK_template.png")
# Right-aligned metadata line at the very top of the page (above the Mack Kirk logo in page_MK_template).
_TOP_PAGE_CODE_LINE_Y = 826
# Inset from the right edge of the page (smaller = line sits further right than frame margin rm).
_TOP_PAGE_CODE_RIGHT_INSET = 18


def _esc(s: Any) -> str:
    from xml.sax.saxutils import escape as xml_escape

    return xml_escape(str(s or ""), entities={'"': "&quot;", "'": "&apos;"})


def _as_utc_aware(dt: datetime) -> datetime:
    """DB/API datetimes are stored in UTC; naive values are treated as UTC."""
    if dt.tzinfo is None:
        return pytz.UTC.localize(dt)
    return dt.astimezone(pytz.UTC)


def _format_pdf_datetime_vancouver(dt: Optional[datetime]) -> str:
    """Wall clock in America/Vancouver (PST/PDT) for PDF copy."""
    if not dt:
        return "—"
    loc = _as_utc_aware(dt).astimezone(_PDF_DISPLAY_TZ)
    tz_abbr = loc.strftime("%Z").strip() or (loc.tzname() or "")
    return f"{loc.strftime('%Y-%m-%d %H:%M')} {tz_abbr}".strip()


def _format_iso_timestamp_vancouver(raw: str) -> Optional[str]:
    """Parse ISO-8601 (e.g. from signature pad) and format in Vancouver; None if not parseable."""
    s = (raw or "").strip()
    if not s:
        return None
    try:
        dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        return None
    return _format_pdf_datetime_vancouver(dt)


def _try_parse_iso_datetime(s: str) -> Optional[datetime]:
    t = (s or "").strip()
    if not t:
        return None
    try:
        return datetime.fromisoformat(t.replace("Z", "+00:00"))
    except ValueError:
        return None


def _template_bg_path() -> str:
    base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    return os.path.normpath(os.path.join(base, _MK_TEMPLATE_REL))


def _banner_project_line(project_name: str, project_code: str) -> str:
    pn = (project_name or "").strip()
    pc = (project_code or "").strip()
    if pn and pc:
        return f"{pn} ({pc})"
    if pn:
        return pn
    if pc:
        return pc
    return ""


def _draw_mk_banner_header(
    canvas: Any,
    *,
    title: str,
    project_name: str,
    project_code: str,
    project_address: str,
    visible: bool = True,
) -> None:
    """Form name plus project and address in white on the dark band (like proposals cover + company line)."""
    if not visible:
        return
    from reportlab.pdfbase.pdfmetrics import stringWidth

    font_title = "Montserrat-Bold" if _pdf_dyn else "Helvetica-Bold"
    font_sub_bold = "Montserrat-Bold" if _pdf_dyn else "Helvetica-Bold"
    font_sub = "Montserrat" if _pdf_dyn else "Helvetica"
    max_w = min(HEADER_TITLE_MAX_WIDTH, _SAFETY_BANNER_TEXT_MAX_WIDTH)
    x = 40.0
    y0 = float(_SAFETY_BANNER_FIRST_BASELINE)

    text = (title or "").strip() or "Safety inspection"
    size = HEADER_TITLE_BASE_SIZE
    while size > HEADER_TITLE_MIN_SIZE and stringWidth(text, font_title, size) > max_w:
        size -= 0.5
    line_h = size + 4
    wrap = _pdf_wrap_text

    canvas.saveState()
    canvas.setFillColor(colors.white)

    last_title_bl: float
    if stringWidth(text, font_title, size) > max_w and wrap:
        lines = wrap(text, font_title, size, max_w)[:2]
        canvas.setFont(font_title, size)
        y_title = y0
        for line in lines:
            canvas.drawString(x, y_title, line)
            last_title_bl = y_title
            y_title -= line_h
    elif stringWidth(text, font_title, size) > max_w:
        el = "…"
        t = text
        canvas.setFont(font_title, size)
        while len(t) > 1 and stringWidth(t + el, font_title, size) > max_w:
            t = t[:-1]
        canvas.drawString(x, y0, t + el)
        last_title_bl = y0
    else:
        canvas.setFont(font_title, size)
        canvas.drawString(x, y0, text)
        last_title_bl = y0

    proj = _banner_project_line(project_name, project_code)
    addr = (project_address or "").strip()
    if not proj and not addr:
        canvas.restoreState()
        return

    sub_b = 9.0
    sub_a = 8.0
    gap_below_title = 12.0
    y_cursor = last_title_bl - gap_below_title

    if proj:
        canvas.setFont(font_sub_bold, sub_b)
        if wrap and stringWidth(proj, font_sub_bold, sub_b) > max_w:
            plines = wrap(proj, font_sub_bold, sub_b, max_w)[:3]
        else:
            plines = [proj]
        for pl in plines:
            if y_cursor < 708:
                break
            line = pl
            if not wrap and stringWidth(line, font_sub_bold, sub_b) > max_w:
                el = "…"
                t = line
                while len(t) > 1 and stringWidth(t + el, font_sub_bold, sub_b) > max_w:
                    t = t[:-1]
                line = t + el
            canvas.drawString(x, y_cursor, line)
            y_cursor -= sub_b + 2

    if addr:
        if proj:
            y_cursor -= 2
        canvas.setFont(font_sub, sub_a)
        if wrap and stringWidth(addr, font_sub, sub_a) > max_w:
            alines = wrap(addr, font_sub, sub_a, max_w)[:4]
        else:
            alines = [addr]
        for al in alines:
            if y_cursor < 692:
                break
            line = al
            if not wrap and stringWidth(line, font_sub, sub_a) > max_w:
                el = "…"
                t = line
                while len(t) > 1 and stringWidth(t + el, font_sub, sub_a) > max_w:
                    t = t[:-1]
                line = t + el
            canvas.drawString(x, y_cursor, line)
            y_cursor -= sub_a + 2

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


def _get_additional_comments(payload: Dict[str, Any]) -> Tuple[str, List[str]]:
    """Top-level `_additionalComments` — same serialized shape as a `_fieldComments` entry."""
    raw = payload.get("_additionalComments")
    if isinstance(raw, str):
        return raw.strip(), []
    if isinstance(raw, dict):
        text = str(raw.get("text") or "").strip()
        arr = raw.get("imageIds") or raw.get("images")
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


def _chip_style(name: str, parent: ParagraphStyle) -> ParagraphStyle:
    return ParagraphStyle(
        name,
        parent=parent,
        fontSize=9,
        leading=11,
        alignment=TA_LEFT,
        textColor=colors.black,
    )


def _no_answer_paragraph(style: ParagraphStyle) -> Paragraph:
    """Italic, light color — used when a field has no response in the PDF."""
    return Paragraph(
        f'<para><i><font color="{_NO_ANSWER_HEX}">No answer</font></i></para>',
        style,
    )


class _CircledChoiceLabel(Flowable):
    """Selected option: compact filled ellipse (light tint) + border; label centered (bold)."""

    def __init__(self, label: str, text_hex: str, fill_color: Any, border_color: Any) -> None:
        Flowable.__init__(self)
        self._label = label
        self._hex = text_hex
        self._fill = fill_color
        self._stroke = border_color
        self._font = "Montserrat-Bold" if _pdf_dyn else "Helvetica-Bold"
        self._size = _CHOICE_CIRCLE_TEXT_SIZE

    def wrap(self, availWidth: float, availHeight: float) -> Tuple[float, float]:
        side = _CHOICE_CIRCLE_DIAMETER
        if availWidth and availWidth > 0 and side > availWidth:
            side = availWidth
        self.width = side
        self.height = side
        return self.width, self.height

    def draw(self) -> None:
        from reportlab.pdfbase.pdfmetrics import getAscentDescent, stringWidth

        c = self.canv
        w, h = self.width, self.height
        c.setFillColor(self._fill)
        c.setStrokeColor(self._stroke)
        c.setLineWidth(0.9)
        c.ellipse(0, 0, w, h, stroke=1, fill=1)
        c.setFillColor(colors.HexColor(self._hex))
        c.setFont(self._font, self._size)
        tw = stringWidth(self._label, self._font, self._size)
        ascent, descent = getAscentDescent(self._font, self._size)
        tx = (w - tw) / 2.0
        ty = (h - (ascent - descent)) / 2.0 - descent
        c.drawString(tx, ty, self._label)


def _single_selected_choice(
    defs: List[Tuple[str, str, Any, str, Any]],
    selected: str,
    empty_style: ParagraphStyle,
) -> Union[_CircledChoiceLabel, Paragraph]:
    """Show only the selected label (circled); if none matched, em dash in muted color."""
    sel = (selected or "").lower().strip()
    for key, label, bg, txt_hex, bd in defs:
        if sel == key:
            return _CircledChoiceLabel(label, txt_hex, bg, bd)
    return _no_answer_paragraph(empty_style)


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


def _pfna_badges(selected: str, badge_style: ParagraphStyle) -> Union[_CircledChoiceLabel, Paragraph]:
    defs = [
        ("pass", "Pass", _GREEN_BG, "#166534", _GREEN_BD),
        ("fail", "Fail", _RED_BG, "#991b1b", _RED_BD),
        ("na", "NA", _GRAY_BG, "#374151", _GRAY_BD),
    ]
    chip = _chip_style("ChoiceChip", badge_style)
    return _single_selected_choice(defs, selected, chip)


def _yna_badges(selected: str, badge_style: ParagraphStyle) -> Union[_CircledChoiceLabel, Paragraph]:
    defs = [
        ("yes", "Yes", _GREEN_BG, "#166534", _GREEN_BD),
        ("no", "No", _RED_BG, "#991b1b", _RED_BD),
        ("na", "NA", _GRAY_BG, "#374151", _GRAY_BD),
    ]
    chip = _chip_style("ChoiceChip", badge_style)
    return _single_selected_choice(defs, selected, chip)


def _coerce_checkbox_checked(raw: Any) -> bool:
    """Match stored payload to PDF checkbox (bool, string, or numeric from JSON/DB quirks)."""
    if raw is True:
        return True
    if raw is False or raw is None:
        return False
    if isinstance(raw, str):
        return raw.strip().lower() in ("true", "1", "yes", "on")
    if isinstance(raw, (int, float)):
        return raw != 0
    return False


class _CheckboxFlowable(Flowable):
    """Vector checkbox: square outline plus line checkmark when selected."""

    def __init__(self, checked: bool, size: float = 16.0) -> None:
        super().__init__()
        self._checked = checked
        self._size = size

    def wrap(self, availWidth: float, availHeight: float) -> Tuple[float, float]:
        self.width = min(self._size, availWidth) if availWidth else self._size
        self.height = min(self._size, availHeight) if availHeight else self._size
        return self.width, self.height

    def draw(self) -> None:
        c = self.canv
        w = getattr(self, "width", self._size)
        h = getattr(self, "height", self._size)
        c.saveState()
        c.setStrokeColor(colors.HexColor("#374151"))
        c.setLineWidth(1.1)
        c.rect(0.5, 0.5, max(0, w - 1), max(0, h - 1), stroke=1, fill=0)
        if self._checked:
            c.setLineCap(1)
            c.setLineJoin(1)
            c.setStrokeColor(colors.HexColor("#111827"))
            c.setLineWidth(1.7)
            x1 = w * 0.24
            y1 = h * 0.50
            x2 = w * 0.42
            y2 = h * 0.30
            x3 = w * 0.76
            y3 = h * 0.72
            c.line(x1, y1, x2, y2)
            c.line(x2, y2, x3, y3)
        c.restoreState()


def _checkbox_badge(checked: bool, badge_style: ParagraphStyle) -> _CheckboxFlowable:
    """Paper-style checkbox: empty square or square with checkmark."""
    return _CheckboxFlowable(checked, size=16.0)


def _pft_badges(val: Dict[str, Any], badge_style: ParagraphStyle, no_answer_style: ParagraphStyle) -> Union[Table, Paragraph]:
    """Aggregate P/F/NA counts — color only columns with count > 0 (matches “only marked” emphasis)."""
    o = val if isinstance(val, dict) else {}
    np = int(o.get("pass") or 0)
    nf = int(o.get("fail") or 0)
    nn = int(o.get("na") or 0)
    if np == 0 and nf == 0 and nn == 0:
        return _no_answer_paragraph(no_answer_style)

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


def _plain_field_has_answer(
    field: Dict[str, Any],
    payload: Dict[str, Any],
    list_maps: Dict[str, Dict[str, str]],
) -> bool:
    """True when the field has a non-empty primary value (PDF shows real content, not 'No answer')."""
    key = str(field.get("key") or "").strip()
    ftype = str(field.get("type") or "").strip().lower()
    val = payload.get(key)
    if ftype == "text_info":
        return True
    if ftype == "checkbox":
        return _coerce_checkbox_checked(val)
    if ftype in ("short_text", "long_text", "number"):
        if val is None:
            return False
        return str(val).strip() != ""
    if ftype == "date":
        if val is None:
            return False
        return str(val).strip() != ""
    if ftype == "time":
        if val is None:
            return False
        return str(val).strip() != ""
    if ftype == "dropdown_single":
        return bool(str(val or "").strip())
    if ftype == "dropdown_multi":
        if not isinstance(val, list) or not val:
            return False
        return any(str(x).strip() for x in val)
    if ftype == "user_single":
        return bool(val)
    if ftype == "user_multi":
        return isinstance(val, list) and len(val) > 0
    if ftype == "gps":
        if not val or not isinstance(val, dict):
            return False
        lat, lng = val.get("lat"), val.get("lng")
        if lat is None or lng is None:
            return False
        return str(lat).strip() != "" and str(lng).strip() != ""
    if ftype in ("equipment_single", "equipment_multi"):
        if isinstance(val, list):
            return len(val) > 0
        return bool(val)
    if ftype == "image_view":
        return len(_collect_image_view_ids(key, payload)) > 0
    if ftype == "pdf_insert":
        if isinstance(val, str) and val.strip():
            return True
        if isinstance(val, dict):
            ids = val.get("file_object_ids")
            if isinstance(ids, list) and ids:
                return True
        return False
    if ftype == "pdf_view":
        return True
    return val is not None and str(val).strip() != ""


def _plain_text_value(db: Session, field: Dict[str, Any], payload: Dict[str, Any], list_maps: Dict[str, Dict[str, str]]) -> str:
    key = str(field.get("key") or "").strip()
    ftype = str(field.get("type") or "").strip().lower()
    val = payload.get(key)
    if ftype == "text_info":
        return ""
    if ftype in ("short_text", "long_text", "number"):
        return str(val).strip() if val is not None else ""
    if ftype == "date":
        if val is None:
            return ""
        ds = str(val).strip()
        if not ds:
            return ""
        if len(ds) > 10:
            p = _try_parse_iso_datetime(ds)
            if p:
                return _format_pdf_datetime_vancouver(p)
        return ds
    if ftype == "time":
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


def _custom_on_site_signature_entries(form_payload: Dict[str, Any]) -> List[Dict[str, str]]:
    """Third-party signatures stored in form_payload._custom_signatures (see frontend customSafetySignatures)."""
    raw = form_payload.get("_custom_signatures")
    if not isinstance(raw, list):
        return []
    out: List[Dict[str, str]] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        fid = str(item.get("file_id") or "").strip()
        if not fid:
            continue
        out.append(
            {
                "file_id": fid,
                "name": str(item.get("name") or "").strip(),
                "company": str(item.get("company") or "").strip(),
                "occupation": str(item.get("occupation") or "").strip(),
                "signed_at": str(item.get("signed_at") or "").strip(),
                "location_label": str(item.get("location_label") or "").strip(),
            }
        )
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
    first_finalized_at: Optional[datetime] = None,
) -> bytes:
    list_ids = _collect_custom_list_ids_from_definition(definition)
    list_maps = _build_custom_list_label_maps(db, list_ids) if list_ids else {}

    buf = io.BytesIO()
    page_w, page_h = A4
    # Margins vs page_MK_template.png: keep flowables inside the white band (header/footer graphics).
    # Proposals using the same template use a larger bottom margin; 52pt was too tight and overlapped the footer.
    lm, rm = 44, 44
    tm, bm = 132, 92
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
    meta_footer_style = ParagraphStyle(
        "MetaFoot",
        parent=sub_style,
        spaceBefore=0,
        spaceAfter=3,
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
    no_answer_style = ParagraphStyle(
        "FldNoAns",
        parent=val_style,
        fontName=val_style.fontName,
        fontSize=9,
        leading=12,
        textColor=colors.HexColor("#94a3b8"),
    )
    badge_chr = _badge_style("BadgeChr", val_style)

    col_label_w = frame_w * 0.32
    col_val_w = frame_w * 0.68

    story: List[Any] = []
    date_s = _format_pdf_datetime_vancouver(inspection_date) if inspection_date else "—"
    tv = (template_version_label or "").strip()
    tv_line = f"Version: {tv}" if tv else ""

    # Form title + project/address are drawn on the MK header band (see on_page). General metadata is at the end of the PDF.

    for sec in _sorted_sections(definition):
        stitle = str(sec.get("title") or "Section").strip()
        fields = _sorted_fields(sec)
        block: List[Any] = []
        has_content = False
        for field in fields:
            if not _is_field_visible(field, form_payload):
                continue
            ftype = str(field.get("type") or "").strip().lower()
            if ftype == "text_info":
                lbl = str(field.get("label") or "")
                if lbl:
                    block.append(Paragraph(_esc(lbl), sub_style))
                    has_content = True
                continue

            key = str(field.get("key") or "").strip()
            label = str(field.get("label") or field.get("key") or "Field")
            label_p = Paragraph(_esc(label), lbl_style)

            val_flow: Union[Paragraph, Table, Flowable]
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
                val_flow = _checkbox_badge(_coerce_checkbox_checked(form_payload.get(key)), badge_chr)
            elif ftype == "pass_fail_total":
                val_flow = _pft_badges(form_payload.get(key) or {}, badge_chr, no_answer_style)
            else:
                if _plain_field_has_answer(field, form_payload, list_maps):
                    txt = _plain_text_value(db, field, form_payload, list_maps)
                    val_flow = Paragraph(_esc(txt), val_style)
                else:
                    val_flow = _no_answer_paragraph(no_answer_style)

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
            block.append(row_tbl)
            block.append(Spacer(1, 8))
            has_content = True

        if has_content:
            h2_flow = Paragraph(_esc(stitle), h2)
            if not block:
                story.append(h2_flow)
            else:
                # Push the section to the next page only if there is not enough room for the title + first row.
                first_h = block[0].wrap(frame_w, frame_h)[1]
                story.append(CondPageBreak(first_h + h2.leading + 8))
                story.append(h2_flow)
                story.extend(block)

    ac_text, ac_imgs = _get_additional_comments(form_payload)
    if ac_text or ac_imgs:
        ac_h2 = Paragraph("Additional Comments / Photos", h2)
        ac_parts: List[Any] = []
        if ac_text:
            ac_parts.append(Paragraph(_esc(ac_text), val_style))
        seen_ac: set = set()
        ac_unique: List[str] = []
        for i in ac_imgs:
            if i not in seen_ac:
                seen_ac.add(i)
                ac_unique.append(i)
        for fid in ac_unique[:_MAX_IMAGES_PER_FIELD]:
            im = _load_image_flowable(db, fid, max_w=min(col_val_w * 0.95, 3.2 * inch))
            if im:
                ac_parts.append(Spacer(1, 6))
                ac_parts.append(im)
        if ac_parts:
            story.append(CondPageBreak(ac_h2.wrap(frame_w, frame_h)[1] + h2.leading + 8))
            story.append(ac_h2)
            story.extend(ac_parts)
            story.append(Spacer(1, 8))

    sig_id = str(form_payload.get("_worker_signature_file_id") or "").strip()
    if sig_id:
        story.append(PageBreak())
        h2_worker = Paragraph("Worker signature", h2)
        meta_lines = []
        sn = str(form_payload.get("_worker_signature_signer_name") or "").strip()
        sa = str(form_payload.get("_worker_signature_signed_at") or "").strip()
        loc = str(form_payload.get("_worker_signature_location_label") or "").strip()
        if sn:
            meta_lines.append(f"Signed by: {sn}")
        if sa:
            van = _format_iso_timestamp_vancouver(sa)
            meta_lines.append(f"Signed at ({_PDF_TZ_LABEL}): {van or sa}")
        if loc:
            meta_lines.append(f"Location: {loc}")
        meta_flows: List[Any] = [Paragraph(_esc(line), sub_style) for line in meta_lines]
        img = _load_image_flowable(db, sig_id, max_w=min(frame_w * 0.85, 4.5 * inch))
        if img:
            meta_flows.append(Spacer(1, 0.12 * inch))
            meta_flows.append(img)
        if meta_flows:
            story.append(KeepTogether([h2_worker, meta_flows[0]]))
            story.extend(meta_flows[1:])
        else:
            story.append(h2_worker)

    custom_sigs = _custom_on_site_signature_entries(form_payload)
    if custom_sigs:
        story.append(PageBreak())
        h2_custom = Paragraph("Custom on-site signatures", h2)
        custom_flows: List[Any] = []
        for cs in custom_sigs:
            nm = (cs.get("name") or "").strip() or "Signer"
            custom_flows.append(Paragraph(_esc(nm), sub_style))
            co = (cs.get("company") or "").strip()
            if co:
                custom_flows.append(Paragraph(_esc(f"Company: {co}"), sub_style))
            occ = (cs.get("occupation") or "").strip()
            if occ:
                custom_flows.append(Paragraph(_esc(f"Occupation: {occ}"), sub_style))
            sa = (cs.get("signed_at") or "").strip()
            if sa:
                van = _format_iso_timestamp_vancouver(sa)
                custom_flows.append(
                    Paragraph(_esc(f"Signed at ({_PDF_TZ_LABEL}): {van or sa}"), sub_style)
                )
            loc = (cs.get("location_label") or "").strip()
            if loc:
                custom_flows.append(Paragraph(_esc(f"Location: {loc}"), sub_style))
            cfid = (cs.get("file_id") or "").strip()
            if cfid:
                im = _load_image_flowable(db, cfid, max_w=min(frame_w * 0.85, 4.5 * inch))
                if im:
                    custom_flows.append(Spacer(1, 0.12 * inch))
                    custom_flows.append(im)
            custom_flows.append(Spacer(1, 0.16 * inch))
        if custom_flows:
            story.append(KeepTogether([h2_custom, custom_flows[0]]))
            story.extend(custom_flows[1:])
        else:
            story.append(h2_custom)

    if extras:
        story.append(PageBreak())
        h2_sigs = Paragraph("Additional signers", h2)
        sig_body: List[Any] = []
        for ex in extras:
            if not isinstance(ex, dict):
                continue
            nm = str(ex.get("display_name") or "Signer").strip()
            pending = bool(ex.get("pending"))
            sig_body.append(Paragraph(_esc(nm), sub_style))
            if pending:
                sig_body.append(Paragraph("<i>Signature pending</i>", sub_style))
            else:
                sa = str(ex.get("signed_at_utc") or "").strip()
                loc = str(ex.get("location_label") or "").strip()
                if sa:
                    van = _format_iso_timestamp_vancouver(sa)
                    sig_body.append(
                        Paragraph(_esc(f"Signed at ({_PDF_TZ_LABEL}): {van or sa}"), sub_style)
                    )
                if loc:
                    sig_body.append(Paragraph(_esc(f"Location: {loc}"), sub_style))
                fid = str(ex.get("signature_file_object_id") or "").strip()
                if fid:
                    im = _load_image_flowable(db, fid, max_w=min(frame_w * 0.85, 4.5 * inch))
                    if im:
                        sig_body.append(Spacer(1, 0.08 * inch))
                        sig_body.append(im)
            sig_body.append(Spacer(1, 0.16 * inch))
        if sig_body:
            story.append(KeepTogether([h2_sigs, sig_body[0]]))
            story.extend(sig_body[1:])
        else:
            story.append(h2_sigs)

    meta_rows_inner: List[Any] = []
    meta_rows_inner.append(
        Paragraph(f"<b>Project:</b> {_esc(project_name)} ({_esc(project_code)})", meta_footer_style)
    )
    if project_address:
        meta_rows_inner.append(Paragraph(f"<b>Location:</b> {_esc(project_address)}", meta_footer_style))
    meta_rows_inner.append(Paragraph(f"<b>Inspection ID:</b> {_esc(inspection_id)}", meta_footer_style))
    meta_rows_inner.append(
        Paragraph(f"<b>Inspection date ({_esc(_PDF_TZ_LABEL)}):</b> {_esc(date_s)}", meta_footer_style)
    )
    if tv_line:
        meta_rows_inner.append(Paragraph(_esc(tv_line), meta_footer_style))
    if kind == "final" and first_finalized_at is not None:
        ff_s = _format_pdf_datetime_vancouver(first_finalized_at)
        meta_rows_inner.append(
            Paragraph(f"<b>First finalized ({_esc(_PDF_TZ_LABEL)}):</b> {_esc(ff_s)}", meta_footer_style)
        )
    if kind == "interim":
        meta_rows_inner.append(Paragraph("<b>Status:</b> Pending additional signatures", meta_footer_style))
        meta_rows_inner.append(
            Paragraph(
                "<i>This document is not final until all requested signers have signed.</i>",
                meta_footer_style,
            )
        )
    else:
        meta_rows_inner.append(Paragraph("<b>Status:</b> Finalized", meta_footer_style))
    meta_rows_inner.append(
        Paragraph(f"<b>Prepared / finalized by:</b> {_esc(finalized_by_name)}", meta_footer_style)
    )
    meta_table = Table([[p] for p in meta_rows_inner], colWidths=[frame_w])
    meta_table.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
            ]
        )
    )
    # Anchor the administrative block to the bottom of the remaining frame on the last page.
    story.append(TopPadder(meta_table))

    tmpl_path = _template_bg_path()
    use_bg = _get_cached_bg_reader and os.path.exists(tmpl_path)

    header_title = (template_name or "Safety inspection").strip() or "Safety inspection"

    def on_page(canvas: Any, doc: Any) -> None:
        canvas.saveState()
        try:
            if use_bg and _get_cached_bg_reader:
                bg = _get_cached_bg_reader(tmpl_path)
                canvas.drawImage(bg, 0, 0, width=page_w, height=page_h)
            canvas.setFont("Helvetica", 8)
            canvas.setFillColor(colors.HexColor("#9ca3af"))
            suffix = " · INTERIM" if kind == "interim" else ""
            text = f"{project_code} · Page {canvas.getPageNumber()}{suffix}"
            canvas.drawRightString(page_w - _TOP_PAGE_CODE_RIGHT_INSET, _TOP_PAGE_CODE_LINE_Y, text)
            if use_bg and _get_cached_bg_reader:
                _draw_mk_banner_header(
                    canvas,
                    title=header_title,
                    project_name=project_name,
                    project_code=project_code,
                    project_address=project_address,
                    visible=True,
                )
        except Exception as e:
            logger.warning("safety_inspection_pdf: background draw failed: %s", e)
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
    pt = PageTemplate(id="main", frames=[frame], onPage=on_page)

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
