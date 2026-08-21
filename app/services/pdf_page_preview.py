"""Shared first-page PNG thumbnail and inline PDF responses."""
from __future__ import annotations

import re

from fastapi import HTTPException
from fastapi.responses import Response


def pdf_first_page_png(pdf_bytes: bytes, w: int = 200) -> bytes:
    try:
        import fitz  # PyMuPDF
    except ImportError:
        raise HTTPException(503, "PDF thumbnails unavailable")
    tw = max(80, min(480, int(w or 200)))
    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    except Exception:
        raise HTTPException(400, "Invalid PDF")
    try:
        if doc.page_count < 1:
            raise HTTPException(400, "Empty PDF")
        page = doc[0]
        pw = float(page.rect.width) or 1.0
        scale = tw / pw
        mat = fitz.Matrix(scale, scale)
        pix = page.get_pixmap(matrix=mat, alpha=False)
        return pix.tobytes("png")
    finally:
        doc.close()


def inline_pdf_response(pdf_bytes: bytes, name: str) -> Response:
    safe = re.sub(r"[^\w\s.-]", "_", (name or "document").strip())[:120] or "document"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{safe}.pdf"'},
    )
