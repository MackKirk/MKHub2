"""Build signed PDF: original + signature overlay + certificate page."""
import io
import os
import tempfile
from datetime import datetime, timezone
from typing import Any, Optional, Tuple

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
    signed_local = local.strftime("%Y-%m-%d %H:%M %Z")
    signed_utc = signed_at.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    req_utc = requested_at.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC") if requested_at.tzinfo else requested_at.replace(tzinfo=timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    display_dt = signed_local
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
    final = append_pdf_pages(merged, cert)
    return final, sha256_bytes(final)
