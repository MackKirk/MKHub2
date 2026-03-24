"""Build signed PDF: original + signature overlay + certificate page."""
import io
import os
import tempfile
from datetime import datetime, timezone
from collections import defaultdict
from typing import Any, Dict, List, Tuple

from PyPDF2 import PdfReader, PdfWriter
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader

from ..utils.pdf_hash import sha256_bytes


def _page_size(page) -> tuple[float, float]:
    mb = page.mediabox
    return float(mb.width), float(mb.height)


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
        can.drawImage(ImageReader(sig_path.name), x, y, width=w, height=h, preserveAspectRatio=True, mask="auto")
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
    signer_name: str,
    signer_email: str,
    signed_local: str,
    signed_utc: str,
    ip_address: str,
    user_agent: str,
    acceptance_statement: str,
) -> bytes:
    buf = io.BytesIO()
    w, h = letter
    c = canvas.Canvas(buf, pagesize=letter)
    c.setFont("Helvetica-Bold", 14)
    c.drawString(50, h - 50, "Electronic Signature Certificate")
    c.setFont("Helvetica", 9)
    y = h - 80
    line = 14

    def block(title: str, lines: list[str]):
        nonlocal y
        c.setFont("Helvetica-Bold", 10)
        c.drawString(50, y, title)
        y -= line
        c.setFont("Helvetica", 9)
        for t in lines:
            for chunk in _wrap(t, 90):
                c.drawString(50, y, chunk)
                y -= line
        y -= 6

    block(
        "Document",
        [
            f"Name: {document_name}",
            f"ID: {document_id}",
            f"SHA-256 (base document): {document_hash_before_sign}",
        ],
    )
    block("Assignment", [f"Assigned by: {requested_by}", f"Assigned at (UTC): {requested_at_utc}"])
    block(
        "Signature",
        [
            f"Signer: {signer_name}",
            f"Email: {signer_email}",
            f"Signed (local): {signed_local}",
            f"Signed (UTC): {signed_utc}",
            f"IP address: {ip_address}",
            f"User agent: {(user_agent or '')[:200]}",
        ],
    )
    block("Acceptance", [acceptance_statement or "I have read and agree to this document."])
    block(
        "Legal notice",
        [
            "This document constitutes electronic acknowledgment under applicable law.",
            "The signature and metadata above form part of the audit record for this transaction.",
        ],
    )
    c.showPage()
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


def build_signed_pdf_with_certificate_from_merged(
    merged_pdf_bytes: bytes,
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
    tz_name: str = "America/Vancouver",
) -> Tuple[bytes, str]:
    try:
        from zoneinfo import ZoneInfo

        tz = ZoneInfo(tz_name)
    except Exception:
        tz = timezone.utc
    if signed_at.tzinfo is None:
        signed_at = signed_at.replace(tzinfo=timezone.utc)
    local = signed_at.astimezone(tz)
    signed_local = local.strftime("%Y-%m-%d %H:%M %Z")
    signed_utc = signed_at.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    req_utc = (
        requested_at.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
        if requested_at.tzinfo
        else requested_at.replace(tzinfo=timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    )
    cert = build_certificate_page_pdf(
        document_name=document_name,
        document_id=document_id,
        document_hash_before_sign=base_doc_hash,
        requested_by=requested_by,
        requested_at_utc=req_utc,
        signer_name=signer_name,
        signer_email=signer_email,
        signed_local=signed_local,
        signed_utc=signed_utc,
        ip_address=ip_address or "unknown",
        user_agent=user_agent or "",
        acceptance_statement=acceptance_statement,
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
    tz_name: str = "America/Vancouver",
) -> Tuple[bytes, str]:
    try:
        from zoneinfo import ZoneInfo

        tz = ZoneInfo(tz_name)
    except Exception:
        tz = timezone.utc
    if signed_at.tzinfo is None:
        signed_at = signed_at.replace(tzinfo=timezone.utc)
    local = signed_at.astimezone(tz)
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
        signer_name=signer_name,
        signer_email=signer_email,
        signed_at=signed_at,
        ip_address=ip_address,
        user_agent=user_agent,
        acceptance_statement=acceptance_statement,
        tz_name=tz_name,
    )
