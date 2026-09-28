"""Build signed PDF: original + signature overlay + certificate page."""
import io
import os
import tempfile
from datetime import datetime, timezone
from collections import defaultdict
from typing import Any, Dict, List, Optional, Tuple

from PyPDF2 import PdfReader, PdfWriter
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader

from ..utils.pdf_hash import sha256_bytes
from .time_rules import utc_to_local

_DEFAULT_TZ = "America/Vancouver"
SIGNATURE_CERTIFICATE_TEMPLATE_NAME = "Certified Doc"


def _utc_signed_at(signed_at: datetime) -> datetime:
    if signed_at.tzinfo is None:
        return signed_at.replace(tzinfo=timezone.utc)
    return signed_at.astimezone(timezone.utc)


def _local_signed_at(signed_at: datetime, tz_name: str) -> datetime:
    """Convert signed_at (UTC) to company local time via pytz (reliable on Windows)."""
    name = (tz_name or _DEFAULT_TZ).strip() or _DEFAULT_TZ
    return utc_to_local(_utc_signed_at(signed_at), name)


def _page_size(page) -> tuple[float, float]:
    mb = page.mediabox
    return float(mb.width), float(mb.height)


def _margin_pct(margins: Optional[dict], key: str) -> float:
    if not isinstance(margins, dict):
        return 0.0
    try:
        v = float(margins.get(key) or 0)
    except (TypeError, ValueError):
        return 0.0
    return max(0.0, min(100.0, v))


def content_box_from_margins(
    page_w: float,
    page_h: float,
    margins: Optional[dict],
    *,
    fallback_inset_pt: float = 50.0,
    elements: Optional[List[dict]] = None,
) -> tuple[float, float, float, float]:
    """
    Return (x, y_bottom, width, y_top) content box in PDF points (origin bottom-left).

    Margins define the initial content rect. Block elements carve out forbidden zones:
    top blocks push ``y_top`` down; bottom blocks raise ``y_bottom``; side blocks shrink width.
    """
    L = _margin_pct(margins, "left_pct")
    R = _margin_pct(margins, "right_pct")
    T = _margin_pct(margins, "top_pct")
    B = _margin_pct(margins, "bottom_pct")
    has_blocks = any(
        isinstance(el, dict) and str(el.get("type") or "").strip().lower() == "block"
        for el in (elements or [])
    )
    if L == 0 and R == 0 and T == 0 and B == 0 and not has_blocks:
        inset = fallback_inset_pt
        return inset, inset, max(0.0, page_w - 2 * inset), page_h - inset

    if L == 0 and R == 0 and T == 0 and B == 0:
        inset = 36.0
        x = inset
        width = max(0.0, page_w - 2 * inset)
        y_bottom = inset
        y_top = page_h - inset
    else:
        x = page_w * (L / 100.0)
        y_bottom = page_h * (B / 100.0)
        y_top = page_h * (1.0 - T / 100.0)
        width = page_w * (1.0 - L / 100.0 - R / 100.0)

    for el in elements or []:
        if not isinstance(el, dict):
            continue
        if str(el.get("type") or "").strip().lower() != "block":
            continue
        try:
            bx = float(el.get("x_pct") or 0)
            by = float(el.get("y_pct") or 0)
            bw = float(el.get("width_pct") or 0)
            bh = float(el.get("height_pct") or 0)
        except (TypeError, ValueError):
            continue
        bx = max(0.0, min(100.0, bx))
        by = max(0.0, min(100.0, by))
        bw = max(0.0, min(100.0 - bx, bw))
        bh = max(0.0, min(100.0 - by, bh))
        if bw <= 0 or bh <= 0:
            continue

        # Element coords are %-from-top-left; PDF y grows upward.
        block_left = page_w * (bx / 100.0)
        block_right = page_w * ((bx + bw) / 100.0)
        block_pdf_top = page_h * (1.0 - by / 100.0)
        block_pdf_bottom = page_h * (1.0 - (by + bh) / 100.0)

        free_left = x
        free_right = x + width
        free_bottom = y_bottom
        free_top = y_top
        if block_right <= free_left or block_left >= free_right:
            continue
        if block_pdf_top <= free_bottom or block_pdf_bottom >= free_top:
            continue

        # Keep top-left text flow: largest free sub-rect that avoids the block.
        # Tuples are (x, y_bottom, width, y_top).
        candidates: List[tuple[float, float, float, float]] = []
        if block_pdf_bottom > free_bottom + 20:
            candidates.append((free_left, free_bottom, free_right - free_left, block_pdf_bottom))
        if free_top > block_pdf_top + 20:
            candidates.append((free_left, block_pdf_top, free_right - free_left, free_top))
        if block_left > free_left + 40:
            candidates.append((free_left, free_bottom, block_left - free_left, free_top))
        if free_right > block_right + 40:
            candidates.append((block_right, free_bottom, free_right - block_right, free_top))

        if not candidates:
            continue

        best = max(
            candidates,
            key=lambda r: (max(0.0, r[2]) * max(0.0, r[3] - r[1]), r[3]),
        )
        x, y_bottom, width, y_top = best

    if width < 40:
        width = max(40.0, page_w - 2 * fallback_inset_pt)
        x = (page_w - width) / 2.0
    if y_top - y_bottom < 40:
        mid = (y_top + y_bottom) / 2.0
        y_bottom = mid - 20
        y_top = mid + 20
    return x, y_bottom, width, y_top


def resolve_signature_certificate_template_assets(
    db: Any,
) -> tuple[Optional[bytes], Optional[dict], List[dict], Dict[str, bytes]]:
    """
    Load Certified Doc assets for the signature certificate.

    Prefers DocumentType named \"Certified Doc\" (page layout with background + blocks),
    then falls back to a DocumentTemplate with that name.

    Returns (background_bytes, margins, page_elements, image_bytes_by_file_id).
    """
    empty: tuple[Optional[bytes], Optional[dict], List[dict], Dict[str, bytes]] = (
        None,
        None,
        [],
        {},
    )
    if db is None:
        return empty
    try:
        from uuid import UUID

        from ..models.models import DocumentTemplate, DocumentType
        from ..document_creator.pdf_builder import _read_file_bytes
    except Exception:
        return empty

    background_bytes: Optional[bytes] = None
    margins: Optional[dict] = None
    elements: List[dict] = []
    image_files: Dict[str, bytes] = {}
    template_id = None

    dtype = (
        db.query(DocumentType)
        .filter(DocumentType.name == SIGNATURE_CERTIFICATE_TEMPLATE_NAME)
        .first()
    )
    if dtype and isinstance(dtype.page_templates, list) and dtype.page_templates:
        page0 = dtype.page_templates[0] if isinstance(dtype.page_templates[0], dict) else {}
        tid = page0.get("template_id")
        if tid:
            template_id = tid
        page_margins = page0.get("margins")
        if isinstance(page_margins, dict):
            margins = page_margins
        raw_els = page0.get("elements")
        if isinstance(raw_els, list):
            elements = [e for e in raw_els if isinstance(e, dict)]

    if template_id is None:
        row = (
            db.query(DocumentTemplate)
            .filter(DocumentTemplate.name == SIGNATURE_CERTIFICATE_TEMPLATE_NAME)
            .first()
        )
        if row:
            template_id = str(row.id)
            if margins is None and isinstance(getattr(row, "margins", None), dict):
                margins = row.margins

    if template_id:
        try:
            tuid = UUID(str(template_id))
        except Exception:
            tuid = None
        if tuid:
            tmpl = db.query(DocumentTemplate).filter(DocumentTemplate.id == tuid).first()
            if tmpl:
                if margins is None and isinstance(getattr(tmpl, "margins", None), dict):
                    margins = tmpl.margins
                fid = getattr(tmpl, "background_file_id", None)
                if fid:
                    try:
                        background_bytes = _read_file_bytes(db, fid)
                    except Exception:
                        background_bytes = None

    for el in elements:
        if str(el.get("type") or "").strip().lower() != "image":
            continue
        raw_id = str(el.get("content") or "").strip()
        if not raw_id or raw_id in image_files:
            continue
        try:
            iuid = UUID(raw_id)
        except Exception:
            continue
        try:
            data = _read_file_bytes(db, iuid)
        except Exception:
            data = None
        if data:
            image_files[raw_id] = data

    return background_bytes, margins, elements, image_files


def overlay_signature_on_pdf(
    pdf_bytes: bytes,
    signature_png_bytes: bytes,
    page_index: int,
    x: float,
    y: float,
    w: float,
    h: float,
    signer_name: str,
    display_datetime: str,
) -> bytes:
    reader = PdfReader(io.BytesIO(pdf_bytes))
    n = len(reader.pages)
    if page_index < 0:
        page_index = n - 1
    if page_index < 0 or page_index >= n:
        raise ValueError(f"page_index {page_index} out of range (pages={n})")
    target = reader.pages[page_index]
    pw, ph = _page_size(target)
    packet = io.BytesIO()
    can = canvas.Canvas(packet, pagesize=(pw, ph))
    sig_path = tempfile.NamedTemporaryFile(suffix=".png", delete=False)
    try:
        sig_path.write(signature_png_bytes)
        sig_path.close()
        can.drawImage(
            ImageReader(sig_path.name),
            x,
            y,
            width=w,
            height=h,
            preserveAspectRatio=True,
            anchor="c",
            mask="auto",
        )
    finally:
        try:
            os.unlink(sig_path.name)
        except Exception:
            pass
    can.setFont("Helvetica-Bold", 10)
    can.drawString(x, max(0, y - 12), f"Signed by: {signer_name}")
    can.drawString(x, max(0, y - 24), f"Date: {display_datetime}")
    can.save()
    packet.seek(0)
    overlay_pdf = PdfReader(packet)
    if not overlay_pdf.pages:
        return pdf_bytes
    writer = PdfWriter()
    for i, page in enumerate(reader.pages):
        if i == page_index:
            page.merge_page(overlay_pdf.pages[0])
        writer.add_page(page)
    out = io.BytesIO()
    writer.write(out)
    return out.getvalue()


def build_certificate_page_pdf(
    *,
    document_name: str,
    document_id: str,
    document_hash_before_sign: str,
    requested_by: str,
    requested_at_utc: str,
    acceptance_statement: str,
    signers: Optional[List[Dict[str, Any]]] = None,
    requested_by_email: str = "",
    requested_ip: str = "",
    # Backward-compatible single-signer kwargs (onboarding / older callers)
    signer_name: str = "",
    signer_email: str = "",
    signed_local: str = "",
    signed_utc: str = "",
    ip_address: str = "",
    user_agent: str = "",
    background_bytes: Optional[bytes] = None,
    margins: Optional[dict] = None,
    elements: Optional[List[dict]] = None,
    image_bytes_by_id: Optional[Dict[str, bytes]] = None,
) -> bytes:
    """
    Build the Electronic Signature Certificate page(s).

    When ``background_bytes`` is set (Certified Doc), uses A4 + content box from
    ``margins`` / block elements. Overflow continues on additional certified pages.
    Layout uses Montserrat (document default) with decorative section rules.
    User agent and local signed time are not printed — only UTC.
    """
    _ = signed_local, user_agent  # retained for call-site compat; not rendered
    if not signers:
        signers = [
            {
                "name": signer_name,
                "email": signer_email,
                "signed_utc": signed_utc,
                "ip_address": ip_address,
            }
        ]

    from reportlab.lib.colors import Color, black
    from reportlab.pdfbase.pdfmetrics import stringWidth

    from ..document_creator.pdf_builder import _get_fonts_map, _pick_font

    fonts_map = _get_fonts_map()
    font_reg = _pick_font(fonts_map, "Montserrat", bold=False, italic=False)
    font_bold = _pick_font(fonts_map, "Montserrat", bold=True, italic=False)
    rule_color = Color(0.72, 0.72, 0.72)
    muted_color = Color(0.35, 0.35, 0.35)

    page_els = [e for e in (elements or []) if isinstance(e, dict)]
    images = image_bytes_by_id or {}
    page_w, page_h = A4
    x0, y_bottom, box_w, y_top = content_box_from_margins(
        page_w, page_h, margins, elements=page_els
    )
    body_size = 10
    header_size = 11
    title_size = 13
    line = 14
    section_gap = 16

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    page_index = 0
    y = y_top

    def _wrap_to_width(text: str, font_name: str, font_size: float) -> list[str]:
        raw = (text or "").strip() or ""
        if not raw:
            return [""]
        # Prefer word wrap; fall back to hard split for long tokens (hashes).
        words = raw.split()
        if not words:
            return [""]
        lines_out: list[str] = []
        cur = ""
        for word in words:
            trial = f"{cur} {word}".strip() if cur else word
            if stringWidth(trial, font_name, font_size) <= box_w:
                cur = trial
                continue
            if cur:
                lines_out.append(cur)
            if stringWidth(word, font_name, font_size) <= box_w:
                cur = word
            else:
                # Hard-break long unbroken strings (SHA / UUID)
                chunk = ""
                for ch in word:
                    trial_c = chunk + ch
                    if stringWidth(trial_c, font_name, font_size) <= box_w:
                        chunk = trial_c
                    else:
                        if chunk:
                            lines_out.append(chunk)
                        chunk = ch
                cur = chunk
        if cur:
            lines_out.append(cur)
        return lines_out or [""]

    def _draw_background():
        if not background_bytes:
            return
        try:
            from PIL import Image

            from ..document_creator.pdf_builder import _draw_raster_image_on_canvas

            pil_im = Image.open(io.BytesIO(background_bytes))
            if pil_im.mode not in ("RGB", "RGBA"):
                pil_im = pil_im.convert("RGBA" if "A" in pil_im.getbands() else "RGB")
            _draw_raster_image_on_canvas(c, pil_im, page_w, page_h, 0, 0, page_w, page_h)
        except Exception:
            pass

    def _draw_layout_images():
        if not images:
            return
        try:
            from PIL import Image

            from ..document_creator.pdf_builder import _draw_raster_image_on_canvas
        except Exception:
            return
        for el in page_els:
            if str(el.get("type") or "").strip().lower() != "image":
                continue
            raw_id = str(el.get("content") or "").strip()
            data = images.get(raw_id)
            if not data:
                continue
            try:
                x_pct = float(el.get("x_pct") or 0) / 100.0
                y_pct = float(el.get("y_pct") or 0) / 100.0
                w_pct = float(el.get("width_pct") or 0) / 100.0
                h_pct = float(el.get("height_pct") or 0) / 100.0
            except (TypeError, ValueError):
                continue
            x = page_w * x_pct
            w = page_w * w_pct
            h = page_h * h_pct
            y_img = page_h * (1.0 - y_pct - h_pct)
            try:
                pil_im = Image.open(io.BytesIO(data))
                if pil_im.mode not in ("RGB", "RGBA"):
                    pil_im = pil_im.convert("RGBA" if "A" in pil_im.getbands() else "RGB")
                _draw_raster_image_on_canvas(c, pil_im, w, h, x, y_img, w, h)
            except Exception:
                continue

    # Equal clearance on both sides of every decorative rule (text ↔ nearest line).
    # Pad-below includes room for the next heading's ascent above its baseline.
    rule_pad = 12.0
    rule_inner = 2.4
    rule_below_to_baseline = rule_pad + header_size * 0.85

    def _draw_rule():
        """Draw double rule with equal visual clearance above and below."""
        nonlocal y
        ensure_space(rule_pad + rule_inner + rule_below_to_baseline)
        y -= rule_pad
        c.setStrokeColor(rule_color)
        c.setLineWidth(0.75)
        c.line(x0, y, x0 + box_w, y)
        c.setLineWidth(0.4)
        c.line(x0, y - rule_inner, x0 + box_w, y - rule_inner)
        c.setStrokeColor(black)
        y -= rule_inner + rule_below_to_baseline

    def _start_page(*, continuation: bool = False):
        nonlocal y, page_index
        if continuation:
            c.showPage()
            page_index += 1
        _draw_background()
        _draw_layout_images()
        c.setFillColor(black)
        c.setFont(font_bold, title_size)
        title = "Electronic Signature Certificate"
        if continuation:
            title = f"{title} (continued)"
        title_baseline = y_top - 2
        c.drawString(x0, title_baseline, title)
        # Cursor just below title descenders — _draw_rule owns the shared pad.
        y = title_baseline - max(2.5, title_size * 0.35)

    def ensure_space(needed: float = line):
        nonlocal y
        if y - needed < y_bottom:
            _start_page(continuation=True)

    def draw_lines(
        text: str,
        *,
        bold: bool = False,
        size: float = body_size,
        color=black,
        gap: float = line,
        settle: bool = False,
    ):
        """
        Draw wrapped text. By default advances a full line gap after the last
        line (for stacking paragraphs). With settle=True, leaves the cursor
        just below the last line's descenders so a following _draw_rule gets
        the same rule_pad as everywhere else.
        """
        nonlocal y
        font = font_bold if bold else font_reg
        c.setFillColor(color)
        c.setFont(font, size)
        chunks = _wrap_to_width(text, font, size)
        for i, chunk in enumerate(chunks):
            is_last = i == len(chunks) - 1
            advance = max(2.5, size * 0.35) if (settle and is_last) else gap
            # When settling before a rule, reserve the full rule stack too.
            needed = advance
            if settle and is_last:
                needed = advance + rule_pad + rule_inner + rule_below_to_baseline
            ensure_space(needed)
            c.drawString(x0, y, chunk)
            y -= advance
        c.setFillColor(black)

    def audit_block(heading: str, rows: list[str], *, settle: bool = False):
        nonlocal y
        ensure_space(line * (2 + len(rows)) + section_gap)
        draw_lines(heading, bold=True, size=header_size, gap=line + 1)
        for i, row in enumerate(rows):
            is_last = i == len(rows) - 1
            draw_lines(
                row,
                bold=False,
                size=body_size,
                color=muted_color,
                gap=line,
                settle=settle and is_last,
            )
        if not settle:
            y -= section_gap * 0.45

    _start_page(continuation=False)

    # --- Header (filename + document id between decorative rules) ---
    _draw_rule()
    draw_lines((document_name or "Document").strip() or "Document", bold=True, size=header_size, gap=line + 1)
    has_hash = bool((document_hash_before_sign or "").strip())
    draw_lines(
        f"Document ID: {(document_id or '').strip()}",
        bold=False,
        size=9,
        color=muted_color,
        gap=12,
        settle=not has_hash,
    )
    if has_hash:
        draw_lines(
            f"SHA-256: {document_hash_before_sign.strip()}",
            bold=False,
            size=8,
            color=muted_color,
            gap=11,
            settle=True,
        )
    _draw_rule()

    # --- Requested (same shape as Signed: when / name (email) / IP) ---
    req_name = (requested_by or "").strip() or "—"
    req_email = (requested_by_email or "").strip()
    req_who = f"{req_name} ({req_email})" if req_email else req_name
    req_when = (requested_at_utc or "").strip() or "—"
    req_ip = (requested_ip or "").strip() or "unknown"
    audit_block(
        "Requested:",
        [
            req_when,
            req_who,
            f"IP: {req_ip}",
        ],
    )

    # --- Signed (one block per signer; same heading as Requested) ---
    for i, s in enumerate(signers, start=1):
        name = (str(s.get("name") or "").strip()) or "—"
        email = (str(s.get("email") or "").strip())
        who = f"{name} ({email})" if email else name
        when = (str(s.get("signed_utc") or "").strip()) or "—"
        ip = (str(s.get("ip_address") or "").strip()) or "unknown"
        audit_block(
            "Signed:",
            [
                when,
                who,
                f"IP: {ip}",
            ],
            settle=(i == len(signers)),
        )

    _draw_rule()
    accept = (acceptance_statement or "").strip() or "I have read and agree to this document."
    draw_lines("Acceptance", bold=True, size=header_size, gap=line + 1)
    draw_lines(accept, bold=False, size=body_size, color=muted_color, gap=line)
    y -= 8
    draw_lines("Legal notice", bold=True, size=header_size, gap=line + 1)
    draw_lines(
        "This document constitutes electronic acknowledgment under applicable law. "
        "The signature and metadata above form part of the audit record for this transaction.",
        bold=False,
        size=9,
        color=muted_color,
        gap=12,
    )

    c.save()
    buf.seek(0)
    return buf.read()


def _wrap(text: str, width: int) -> list[str]:
    if not text:
        return [""]
    words = text.split()
    lines, cur = [], []
    for w in words:
        test = " ".join(cur + [w])
        if len(test) <= width:
            cur.append(w)
        else:
            if cur:
                lines.append(" ".join(cur))
            cur = [w] if len(w) <= width else [w[:width]]
    if cur:
        lines.append(" ".join(cur))
    return lines or [""]


def _single_line_baseline_bottom(y: float, h: float, font_size: float) -> float:
    """
    Baseline near the bottom of the rect (footer alignment), matching the sign modal preview.
    ReportLab drawString uses baseline y; rect origin is bottom-left.
    """
    pad = max(1.5, font_size * 0.22)
    b = y + pad
    ceiling = y + h - max(2.0, font_size * 0.82)
    if ceiling >= b:
        return min(b, ceiling)
    # Very short box: fall back to vertical center to avoid clipping
    return y + h / 2.0 - 0.38 * font_size


def append_pdf_pages(main_pdf_bytes: bytes, extra_pdf_bytes: bytes) -> bytes:
    w = PdfWriter()
    for p in PdfReader(io.BytesIO(main_pdf_bytes)).pages:
        w.add_page(p)
    for p in PdfReader(io.BytesIO(extra_pdf_bytes)).pages:
        w.add_page(p)
    out = io.BytesIO()
    w.write(out)
    return out.getvalue()


def default_placement() -> dict[str, Any]:
    return {"page_index": -1, "x": 350.0, "y": 80.0, "w": 150.0, "h": 50.0}


def sort_template_fields_for_draw(fields: List[dict]) -> List[dict]:
    """Deterministic overlay order: page, then bottom-to-top (y), then x."""
    return sorted(
        fields,
        key=lambda f: (int(f["page_index"]), float(f["rect"]["y"]), float(f["rect"]["x"])),
    )


def _merge_overlay_page_fields(
    pdf_bytes: bytes,
    page_index: int,
    fields: List[dict],
    values: Dict[str, Any],
) -> bytes:
    reader = PdfReader(io.BytesIO(pdf_bytes))
    n = len(reader.pages)
    if page_index < 0 or page_index >= n:
        raise ValueError(f"page_index {page_index} out of range (pages={n})")
    target = reader.pages[page_index]
    pw, ph = _page_size(target)
    packet = io.BytesIO()
    can = canvas.Canvas(packet, pagesize=(pw, ph))

    for f in sort_template_fields_for_draw(fields):
        if int(f["page_index"]) != page_index:
            continue
        fid = f["id"]
        ftype = f["type"]
        val = values.get(fid)
        r = f["rect"]
        x, y, w, h = float(r["x"]), float(r["y"]), float(r["width"]), float(r["height"])

        if ftype in ("signature", "initials"):
            if not isinstance(val, (bytes, bytearray)) or len(val) < 10:
                continue
            sig_path = tempfile.NamedTemporaryFile(suffix=".png", delete=False)
            try:
                sig_path.write(bytes(val))
                sig_path.close()
                can.drawImage(
                    ImageReader(sig_path.name),
                    x,
                    y,
                    width=w,
                    height=h,
                    preserveAspectRatio=True,
                    anchor="c",
                    mask="auto",
                )
            finally:
                try:
                    os.unlink(sig_path.name)
                except Exception:
                    pass
            continue

        if ftype == "checkbox":
            if val is True:
                can.setFont("Helvetica-Bold", 14)
                fs_cb = 14
                can.drawString(x + w / 2 - 4, y + h / 2 - fs_cb * 0.35, "✓")
            continue

        if ftype in ("employee_info", "text", "value", "paragraph", "date"):
            text = val if isinstance(val, str) else ""
            if not text.strip() and ftype != "paragraph":
                continue
            text = text.strip() if ftype != "paragraph" else text
            if not text:
                continue
            font_size = 9 if ftype != "paragraph" else 8
            line_h = font_size + 3
            can.setFont("Helvetica", font_size)
            max_chars = max(4, int(w / (font_size * 0.45)))
            if ftype == "paragraph":
                lines = _wrap(text.replace("\r\n", "\n"), max_chars)
                max_lines = max(1, int((h - 4) // line_h))
                n = min(len(lines), max_lines)
                if n == 1:
                    can.drawString(
                        x + 2,
                        _single_line_baseline_bottom(y, h, font_size),
                        lines[0][: max_chars + 30],
                    )
                else:
                    bottom_pad = max(1.5, font_size * 0.22)
                    last_baseline = y + bottom_pad
                    first_baseline = last_baseline + (n - 1) * line_h
                    top_cap = y + h - font_size * 0.15
                    if first_baseline > top_cap:
                        last_baseline = max(y + 1.0, top_cap - (n - 1) * line_h)
                        first_baseline = last_baseline + (n - 1) * line_h
                    ty = first_baseline
                    for line in lines[:n]:
                        if ty < y - 1:
                            break
                        can.drawString(x + 2, ty, line[: max_chars + 30])
                        ty -= line_h
            else:
                s = text.replace("\n", " ")
                if len(s) > max_chars:
                    s = s[: max_chars - 1] + "…"
                baseline = _single_line_baseline_bottom(y, h, font_size)
                can.drawString(x + 2, baseline, s)

    can.save()
    packet.seek(0)
    overlay_pdf = PdfReader(packet)
    # ReportLab emits 0 pages when nothing was drawn (all fields skipped).
    if not overlay_pdf.pages:
        return pdf_bytes
    writer = PdfWriter()
    for i, page in enumerate(reader.pages):
        if i == page_index:
            page.merge_page(overlay_pdf.pages[0])
        writer.add_page(page)
    out = io.BytesIO()
    writer.write(out)
    return out.getvalue()


def apply_template_field_overlays(pdf_bytes: bytes, fields: List[dict], values: Dict[str, Any]) -> bytes:
    """Apply all template fields (same assignee batch) onto the base PDF."""
    by_page: dict[int, List[dict]] = defaultdict(list)
    for f in fields:
        by_page[int(f["page_index"])].append(f)
    current = pdf_bytes
    for pi in sorted(by_page.keys()):
        current = _merge_overlay_page_fields(current, pi, by_page[pi], values)
    return current


def make_signed_pdf_non_interactive(pdf_bytes: bytes) -> bytes:
    """
    Strip AcroForm field widgets and tighten output so the signed PDF is not a fillable / editable form.
    Base documents may still carry form fields after PyPDF2 merge; this removes them after overlays + certificate.
    """
    try:
        import fitz  # PyMuPDF
    except ImportError:
        return pdf_bytes
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    try:
        for page in doc:
            try:
                widgets = list(page.widgets() or [])
            except Exception:
                widgets = []
            for w in widgets:
                try:
                    # PyMuPDF 1.23+: Page.delete_widget; older Widget.delete() removed in 1.27+
                    if hasattr(page, "delete_widget"):
                        page.delete_widget(w)
                    elif hasattr(w, "delete"):
                        w.delete()
                except Exception:
                    pass
        if hasattr(doc, "scrub"):
            try:
                doc.scrub(reset_fields=True, javascript=True)
            except Exception:
                pass
        buf = io.BytesIO()
        doc.save(buf, garbage=4, deflate=True, clean=True)
        return buf.getvalue()
    finally:
        doc.close()


def _format_signed_times(signed_at: datetime, tz_name: str = _DEFAULT_TZ) -> Tuple[str, str]:
    utc = _utc_signed_at(signed_at)
    local = _local_signed_at(utc, tz_name)
    signed_local = local.strftime("%Y-%m-%d %H:%M %Z")
    signed_utc = utc.strftime("%Y-%m-%d %H:%M:%S UTC")
    return signed_local, signed_utc


def build_signed_pdf_with_certificate_from_merged(
    merged_pdf_bytes: bytes,
    *,
    document_name: str,
    document_id: str,
    base_doc_hash: str,
    requested_by: str,
    requested_at: datetime,
    acceptance_statement: str,
    signers: Optional[List[Dict[str, Any]]] = None,
    requested_by_email: str = "",
    requested_ip: str = "",
    # Backward-compatible single-signer kwargs
    signer_name: str = "",
    signer_email: str = "",
    signed_at: Optional[datetime] = None,
    ip_address: str = "",
    user_agent: str = "",
    tz_name: str = _DEFAULT_TZ,
    db: Any = None,
) -> Tuple[bytes, str]:
    req_utc = (
        requested_at.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
        if requested_at.tzinfo
        else requested_at.replace(tzinfo=timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    )

    cert_signers: List[Dict[str, Any]] = list(signers or [])
    if not cert_signers:
        if signed_at is None:
            signed_at = datetime.now(timezone.utc)
        _signed_local, signed_utc = _format_signed_times(signed_at, tz_name)
        cert_signers = [
            {
                "name": signer_name,
                "email": signer_email,
                "signed_utc": signed_utc,
                "ip_address": ip_address or "unknown",
            }
        ]
    else:
        # Normalize any signer entries that still have a datetime instead of formatted strings
        normalized: List[Dict[str, Any]] = []
        for s in cert_signers:
            entry = dict(s)
            sat = entry.pop("signed_at", None)
            if sat is not None and not entry.get("signed_utc"):
                if isinstance(sat, datetime):
                    _sl, su = _format_signed_times(sat, tz_name)
                    entry["signed_utc"] = su
            # Local time / user agent are not rendered on the certificate.
            entry.pop("signed_local", None)
            entry.pop("user_agent", None)
            normalized.append(entry)
        cert_signers = normalized

    background_bytes, margins, page_elements, image_bytes_by_id = (
        resolve_signature_certificate_template_assets(db)
    )

    cert = build_certificate_page_pdf(
        document_name=document_name,
        document_id=document_id,
        document_hash_before_sign=base_doc_hash,
        requested_by=requested_by,
        requested_at_utc=req_utc,
        requested_by_email=requested_by_email,
        requested_ip=requested_ip,
        acceptance_statement=acceptance_statement,
        signers=cert_signers,
        background_bytes=background_bytes,
        margins=margins,
        elements=page_elements,
        image_bytes_by_id=image_bytes_by_id,
    )
    final = append_pdf_pages(merged_pdf_bytes, cert)
    final = make_signed_pdf_non_interactive(final)
    return final, sha256_bytes(final)


def build_signed_pdf_with_certificate(
    base_pdf_bytes: bytes,
    signature_png_bytes: bytes,
    placement: dict[str, Any],
    *,
    document_name: str,
    document_id: str,
    base_doc_hash: str,
    requested_by: str,
    requested_at: datetime,
    signer_name: str,
    signer_email: str,
    signed_at: datetime,
    ip_address: str,
    user_agent: str,
    acceptance_statement: str,
    requested_by_email: str = "",
    requested_ip: str = "",
    tz_name: str = _DEFAULT_TZ,
    db: Any = None,
) -> Tuple[bytes, str]:
    local = _local_signed_at(signed_at, tz_name)
    display_dt = local.strftime("%Y-%m-%d %H:%M %Z")
    pi = int(placement.get("page_index", -1))
    x = float(placement.get("x", 350))
    y = float(placement.get("y", 80))
    w = float(placement.get("w", 150))
    h = float(placement.get("h", 50))
    merged = overlay_signature_on_pdf(
        base_pdf_bytes,
        signature_png_bytes,
        pi,
        x,
        y,
        w,
        h,
        signer_name,
        display_dt,
    )
    return build_signed_pdf_with_certificate_from_merged(
        merged,
        document_name=document_name,
        document_id=document_id,
        base_doc_hash=base_doc_hash,
        requested_by=requested_by,
        requested_at=requested_at,
        requested_by_email=requested_by_email,
        requested_ip=requested_ip,
        signer_name=signer_name,
        signer_email=signer_email,
        signed_at=signed_at,
        ip_address=ip_address,
        user_agent=user_agent,
        acceptance_statement=acceptance_statement,
        tz_name=tz_name,
        db=db,
    )
