"""
Training certificate PDF — landscape Letter, Mack Kirk–style layout.
Supports full-page background image, logo top-left, editable headings/body,
colored placeholders, instructor + employee signature script lines.
"""
import os
import re
import qrcode
from html import escape
from io import BytesIO
from datetime import datetime
from typing import Any, Callable, Dict, Optional, Union

from reportlab.lib.pagesizes import landscape, letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.units import inch
from reportlab.lib.utils import ImageReader
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Image, Table, TableStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from PIL import Image as PILImage

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
fonts_path = os.path.join(BASE_DIR, "assets", "fonts")

BRAND = colors.HexColor("#7f1010")
BODY_GREY = colors.HexColor("#2d2d2d")
SUBGREY = colors.HexColor("#555555")
MAROON_HEX = "#7f1010"

PAGE_SIZE = landscape(letter)
PAGE_W, PAGE_H = PAGE_SIZE

DEFAULT_CERT_LAYOUT: Dict[str, float] = {
    "logoX": 14.0,
    "logoY": 38.0,
    "logoW": 164.0,
    "logoH": 72.0,
    "contentTop": 118.0,
    "contentSide": 46.0,
    "h1Size": 35.0,
    "h2Size": 20.0,
    "bodySize": 18.0,
    "titleBodyGap": 25.0,
    "signatureGap": 60.0,
    "signatureNameGap": 18.0,
    "signatureSideInset": 66.0,
}

# Register fonts
_SCRIPT_REGISTERED = False
try:
    _pacifico = os.path.join(fonts_path, "Pacifico-Regular.ttf")
    if os.path.isfile(_pacifico):
        pdfmetrics.registerFont(TTFont("CertScript", _pacifico))
        _SCRIPT_REGISTERED = True
except Exception:
    pass

try:
    _mreg = os.path.join(fonts_path, "Montserrat-Regular.ttf")
    _mbold = os.path.join(fonts_path, "Montserrat-Bold.ttf")
    if os.path.isfile(_mreg):
        pdfmetrics.registerFont(TTFont("Montserrat", _mreg))
    if os.path.isfile(_mbold):
        pdfmetrics.registerFont(TTFont("Montserrat-Bold", _mbold))
except Exception:
    pass


def _font_regular() -> str:
    return "Montserrat" if "Montserrat" in pdfmetrics.getRegisteredFontNames() else "Helvetica"


def _font_bold() -> str:
    return "Montserrat-Bold" if "Montserrat-Bold" in pdfmetrics.getRegisteredFontNames() else "Helvetica-Bold"


def _font_script() -> str:
    return "CertScript" if _SCRIPT_REGISTERED and "CertScript" in pdfmetrics.getRegisteredFontNames() else "Helvetica-Oblique"


def generate_qr_code_image(data: str, size: int = 200) -> BytesIO:
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_L,
        box_size=10,
        border=4,
    )
    qr.add_data(data)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    img = img.resize((size, size), PILImage.Resampling.LANCZOS)
    buffer = BytesIO()
    img.save(buffer, format="PNG")
    buffer.seek(0)
    return buffer


def _make_page_callback(
    bg_reader: Optional[ImageReader],
    logo_reader: Optional[ImageReader],
    *,
    has_background: bool,
    layout: Dict[str, float],
) -> Callable:
    """Full-bleed background; logo top-left (matches branded template)."""

    def draw_page(canvas, doc) -> None:  # noqa: ARG001
        W, H = PAGE_W, PAGE_H
        canvas.saveState()
        if bg_reader:
            try:
                canvas.drawImage(bg_reader, 0, 0, width=W, height=H, preserveAspectRatio=True, mask="auto")
            except Exception:
                canvas.setFillColorRGB(0.93, 0.93, 0.93)
                canvas.rect(0, 0, W, H, fill=1, stroke=0)
        else:
            canvas.setFillColorRGB(0.93, 0.93, 0.93)
            canvas.rect(0, 0, W, H, fill=1, stroke=0)

        if not has_background:
            inset = 28
            canvas.setStrokeColor(colors.HexColor("#b08d57"))
            canvas.setLineWidth(1.2)
            canvas.rect(inset, inset, W - 2 * inset, H - 2 * inset, fill=0, stroke=1)

        if logo_reader:
            try:
                lw = layout["logoW"]
                lh = layout["logoH"]
                x = layout["logoX"]
                y = H - layout["logoY"] - lh
                canvas.drawImage(logo_reader, x, y, width=lw, height=lh, preserveAspectRatio=True, mask="auto")
            except Exception:
                pass

        canvas.restoreState()

    return draw_page


DEFAULT_BODY_TEMPLATE = (
    "This certificate is awarded to {user_name} in recognition of their successful completion of "
    "{course_title} on {completion_date}.\n\n"
    "We recognize your hard work and dedication to your professional development."
)


def _placeholder_mapping(
    *,
    user_name: str,
    course_title: str,
    completion_date: datetime,
    expiry_date: Optional[datetime],
    certificate_number: str,
    instructor_name: str,
) -> Dict[str, str]:
    return {
        "user_name": user_name,
        "course_title": course_title,
        "completion_date": completion_date.strftime("%B %d, %Y"),
        "instructor_name": instructor_name or "",
        "certificate_number": certificate_number or "",
        "expiry_date": expiry_date.strftime("%B %d, %Y") if expiry_date else "—",
    }


def render_body_placeholders_colored(template: str, mapping: Dict[str, str]) -> str:
    """
    Split by {placeholder}; static segments escaped; known placeholders get maroon bold.
    """
    parts = re.split(r"(\{[a-z_]+\})", template)
    chunks = []
    for p in parts:
        m = re.fullmatch(r"\{([a-z_]+)\}", p)
        if m:
            key = m.group(1)
            val = mapping.get(key, "")
            chunks.append(f'<font color="{MAROON_HEX}"><b>{escape(str(val))}</b></font>')
        else:
            chunks.append(escape(p).replace("\n", "<br/>"))
    return "".join(chunks)


def _layout_number(layout: Dict[str, Any], key: str, default: float, *, min_v: float, max_v: float) -> float:
    raw = layout.get(key, default)
    try:
        val = float(raw)
    except (TypeError, ValueError):
        val = default
    if val < min_v:
        return min_v
    if val > max_v:
        return max_v
    return val


def create_certificate_pdf(
    course_title: str,
    user_name: str,
    completion_date: datetime,
    expiry_date: Optional[datetime] = None,
    certificate_number: str = "",
    certificate_text: Optional[str] = None,
    qr_code_data: Optional[str] = None,
    output_path: Optional[str] = None,
    background_image_bytes: Optional[bytes] = None,
    logo_image_bytes: Optional[bytes] = None,
    certificate_heading_primary: Optional[str] = None,
    certificate_heading_secondary: Optional[str] = None,
    certificate_body_template: Optional[str] = None,
    certificate_instructor_name: Optional[str] = None,
    certificate_layout: Optional[Dict[str, Any]] = None,
) -> Union[BytesIO, None]:
    """
    Landscape US Letter certificate. When a background image is set, decorative frame is omitted
    so your artwork (globe, curves, seal) shows through.
    """
    bg_reader: Optional[ImageReader] = None
    if background_image_bytes:
        try:
            bg_reader = ImageReader(BytesIO(background_image_bytes))
        except Exception:
            bg_reader = None

    logo_reader: Optional[ImageReader] = None
    if logo_image_bytes:
        try:
            logo_reader = ImageReader(BytesIO(logo_image_bytes))
        except Exception:
            logo_reader = None

    has_background = bg_reader is not None
    instructor_display = (certificate_instructor_name or "").strip()
    raw_layout = certificate_layout if isinstance(certificate_layout, dict) else {}
    layout = {
        "logoX": _layout_number(raw_layout, "logoX", DEFAULT_CERT_LAYOUT["logoX"], min_v=0, max_v=PAGE_W - 24),
        "logoY": _layout_number(raw_layout, "logoY", DEFAULT_CERT_LAYOUT["logoY"], min_v=0, max_v=PAGE_H - 24),
        "logoW": _layout_number(raw_layout, "logoW", DEFAULT_CERT_LAYOUT["logoW"], min_v=64, max_v=360),
        "logoH": _layout_number(raw_layout, "logoH", DEFAULT_CERT_LAYOUT["logoH"], min_v=20, max_v=150),
        "contentTop": _layout_number(raw_layout, "contentTop", DEFAULT_CERT_LAYOUT["contentTop"], min_v=52, max_v=220),
        "contentSide": _layout_number(raw_layout, "contentSide", DEFAULT_CERT_LAYOUT["contentSide"], min_v=28, max_v=160),
        "h1Size": _layout_number(raw_layout, "h1Size", DEFAULT_CERT_LAYOUT["h1Size"], min_v=16, max_v=56),
        "h2Size": _layout_number(raw_layout, "h2Size", DEFAULT_CERT_LAYOUT["h2Size"], min_v=12, max_v=36),
        "bodySize": _layout_number(raw_layout, "bodySize", DEFAULT_CERT_LAYOUT["bodySize"], min_v=9, max_v=24),
        "titleBodyGap": _layout_number(
            raw_layout, "titleBodyGap", DEFAULT_CERT_LAYOUT["titleBodyGap"], min_v=0, max_v=48
        ),
        "signatureGap": _layout_number(
            raw_layout, "signatureGap", DEFAULT_CERT_LAYOUT["signatureGap"], min_v=-24, max_v=120
        ),
        "signatureNameGap": _layout_number(
            raw_layout, "signatureNameGap", DEFAULT_CERT_LAYOUT["signatureNameGap"], min_v=0, max_v=36
        ),
        "signatureSideInset": _layout_number(
            raw_layout, "signatureSideInset", DEFAULT_CERT_LAYOUT["signatureSideInset"], min_v=0, max_v=160
        ),
    }

    mapping = _placeholder_mapping(
        user_name=user_name,
        course_title=course_title,
        completion_date=completion_date,
        expiry_date=expiry_date,
        certificate_number=certificate_number,
        instructor_name=instructor_display,
    )

    h1 = (certificate_heading_primary or "").strip() or "CERTIFICATE"
    h2 = (certificate_heading_secondary or "").strip() or "OF COMPLETION"

    if certificate_body_template and certificate_body_template.strip():
        body_src = certificate_body_template.strip()
    elif certificate_text and certificate_text.strip():
        body_src = certificate_text.strip()
    else:
        body_src = DEFAULT_BODY_TEMPLATE

    body_xml = render_body_placeholders_colored(body_src, mapping)

    buffer = BytesIO() if output_path is None else None
    doc = SimpleDocTemplate(
        output_path if output_path else buffer,
        pagesize=PAGE_SIZE,
        rightMargin=layout["contentSide"],
        leftMargin=layout["contentSide"],
        topMargin=layout["contentTop"],
        bottomMargin=72,
    )

    story = []
    styles = getSampleStyleSheet()

    h1_style = ParagraphStyle(
        "H1Cert",
        parent=styles["Normal"],
        fontSize=layout["h1Size"],
        textColor=BRAND,
        spaceAfter=6,
        alignment=1,
        fontName=_font_bold(),
        leading=layout["h1Size"] + 4,
    )
    h2_style = ParagraphStyle(
        "H2Cert",
        parent=styles["Normal"],
        fontSize=layout["h2Size"],
        textColor=BODY_GREY,
        spaceAfter=18,
        alignment=1,
        fontName=_font_bold(),
        leading=layout["h2Size"] + 5,
    )
    body_style = ParagraphStyle(
        "BodyCert",
        parent=styles["Normal"],
        fontSize=layout["bodySize"],
        textColor=BODY_GREY,
        spaceAfter=14,
        alignment=1,
        fontName=_font_regular(),
        leading=layout["bodySize"] + 5,
        leftIndent=12,
        rightIndent=12,
    )
    script_style = ParagraphStyle(
        "SigScript",
        parent=styles["Normal"],
        fontSize=17,
        textColor=BODY_GREY,
        alignment=1,
        fontName=_font_script(),
        leading=20,
    )
    sig_label_style = ParagraphStyle(
        "SigLbl",
        parent=styles["Normal"],
        fontSize=9,
        textColor=SUBGREY,
        alignment=1,
        fontName=_font_regular(),
        leading=11,
    )

    story.append(Spacer(1, 0.06 * inch))
    story.append(Paragraph(escape(h1), h1_style))
    story.append(Paragraph(escape(h2), h2_style))
    story.append(Spacer(1, max(0, layout["titleBodyGap"])))
    story.append(Paragraph(body_xml, body_style))

    story.append(Spacer(1, 0.12 * inch))
    meta_bits = []
    if certificate_number:
        meta_bits.append(f'<font size="9" color="#666666">Certificate no. {escape(certificate_number)}</font>')
    if expiry_date:
        meta_bits.append(
            f'<font size="9" color="#666666">Valid until {escape(expiry_date.strftime("%B %d, %Y"))}</font>'
        )
    if meta_bits:
        story.append(Paragraph("<br/>".join(meta_bits), body_style))

    story.append(Spacer(1, max(0, layout["signatureGap"])))

    left_sig = escape(instructor_display) if instructor_display else "—"
    right_sig = escape(user_name)
    sig_table_data = [
        [
            Paragraph(left_sig, script_style),
            Paragraph("", body_style),
            Paragraph(right_sig, script_style),
        ],
        [
            Paragraph(f'<font size="10" color="#2d2d2d">{left_sig}</font>', sig_label_style),
            Paragraph("", sig_label_style),
            Paragraph(f'<font size="10" color="#2d2d2d">{right_sig}</font>', sig_label_style),
        ],
    ]

    if qr_code_data:
        qr_buffer = generate_qr_code_image(qr_code_data, size=128)
        qr_img = Image(qr_buffer, width=1.05 * inch, height=1.05 * inch)
        sig_table_data[0][1] = qr_img

    content_width = PAGE_W - (2 * layout["contentSide"])
    inset = min(layout["signatureSideInset"], max(0.0, (content_width - 120.0) / 2.0))
    signature_span = max(120.0, content_width - (2 * inset))
    # Keep original visual proportion (2.85 : 1.55 : 2.85) while allowing horizontal spread control.
    sig_left = signature_span * (2.85 / 7.25)
    sig_center = signature_span * (1.55 / 7.25)
    sig_right = signature_span * (2.85 / 7.25)
    sig_table = Table(sig_table_data, colWidths=[sig_left, sig_center, sig_right])
    sig_table.hAlign = "CENTER"
    sig_table.setStyle(
        TableStyle(
            [
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
                ("TOPPADDING", (0, 1), (0, 1), layout["signatureNameGap"]),
                ("TOPPADDING", (2, 1), (2, 1), layout["signatureNameGap"]),
            ]
        )
    )
    story.append(sig_table)

    on_page = _make_page_callback(bg_reader, logo_reader, has_background=has_background, layout=layout)
    doc.build(story, onFirstPage=on_page, onLaterPages=on_page)

    if buffer:
        buffer.seek(0)
        return buffer

    return None
