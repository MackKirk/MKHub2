import os
import qrcode
from io import BytesIO
from datetime import datetime
from typing import Optional
from reportlab.lib.pagesizes import A4, letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Image, Table, TableStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from PIL import Image as PILImage

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
fonts_path = os.path.join(BASE_DIR, "assets", "fonts")

# Register fonts
try:
    pdfmetrics.registerFont(TTFont("Montserrat", os.path.join(fonts_path, "Montserrat-Regular.ttf")))
    pdfmetrics.registerFont(TTFont("Montserrat-Bold", os.path.join(fonts_path, "Montserrat-Bold.ttf")))
except Exception:
    # Fallback to default fonts if custom fonts not available
    pass


def generate_qr_code_image(data: str, size: int = 200) -> BytesIO:
    """Generate QR code image as BytesIO"""
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
    img.save(buffer, format='PNG')
    buffer.seek(0)
    return buffer


def create_certificate_pdf(
    course_title: str,
    user_name: str,
    completion_date: datetime,
    expiry_date: Optional[datetime] = None,
    certificate_number: str = "",
    certificate_text: Optional[str] = None,
    qr_code_data: Optional[str] = None,
    output_path: str = None
) -> BytesIO:
    """
    Create a training certificate PDF
    
    Args:
        course_title: Title of the completed course
        user_name: Name of the user receiving the certificate
        completion_date: Date when course was completed
        expiry_date: Optional expiry date for certificate
        certificate_number: Unique certificate number
        certificate_text: Optional custom certificate text
        qr_code_data: Optional QR code data for validation
        output_path: Optional file path to save PDF (if None, returns BytesIO)
    
    Returns:
        BytesIO buffer with PDF content
    """
    buffer = BytesIO() if output_path is None else None
    doc = SimpleDocTemplate(
        output_path if output_path else buffer,
        pagesize=letter,
        rightMargin=72,
        leftMargin=72,
        topMargin=72,
        bottomMargin=72,
    )
    
    # Build story
    story = []
    styles = getSampleStyleSheet()
    
    # Title style
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=36,
        textColor=colors.HexColor('#7f1010'),
        spaceAfter=30,
        alignment=1,  # Center
        fontName='Montserrat-Bold' if 'Montserrat-Bold' in pdfmetrics.getRegisteredFontNames() else 'Helvetica-Bold',
    )
    
    # Subtitle style
    subtitle_style = ParagraphStyle(
        'CustomSubtitle',
        parent=styles['Normal'],
        fontSize=18,
        textColor=colors.HexColor('#333333'),
        spaceAfter=20,
        alignment=1,  # Center
        fontName='Montserrat' if 'Montserrat' in pdfmetrics.getRegisteredFontNames() else 'Helvetica',
    )
    
    # Body style
    body_style = ParagraphStyle(
        'CustomBody',
        parent=styles['Normal'],
        fontSize=14,
        textColor=colors.HexColor('#333333'),
        spaceAfter=12,
        alignment=1,  # Center
        fontName='Montserrat' if 'Montserrat' in pdfmetrics.getRegisteredFontNames() else 'Helvetica',
    )
    
    # Certificate title
    story.append(Spacer(1, 1.5 * inch))
    story.append(Paragraph("CERTIFICATE OF COMPLETION", title_style))
    story.append(Spacer(1, 0.3 * inch))
    
    # Certificate text (custom or default)
    if certificate_text:
        # Use custom text, replacing placeholders
        cert_text = certificate_text.replace("{user_name}", user_name)
        cert_text = cert_text.replace("{course_title}", course_title)
        cert_text = cert_text.replace("{completion_date}", completion_date.strftime("%B %d, %Y"))
        story.append(Paragraph(cert_text, body_style))
    else:
        # Default certificate text
        story.append(Paragraph("This is to certify that", subtitle_style))
        story.append(Spacer(1, 0.2 * inch))
        story.append(Paragraph(f"<b>{user_name}</b>", ParagraphStyle(
            'UserName',
            parent=body_style,
            fontSize=24,
            fontName='Montserrat-Bold' if 'Montserrat-Bold' in pdfmetrics.getRegisteredFontNames() else 'Helvetica-Bold',
        )))
        story.append(Spacer(1, 0.3 * inch))
        story.append(Paragraph("has successfully completed", body_style))
        story.append(Spacer(1, 0.2 * inch))
        story.append(Paragraph(f"<b>{course_title}</b>", ParagraphStyle(
            'CourseTitle',
            parent=body_style,
            fontSize=20,
            fontName='Montserrat-Bold' if 'Montserrat-Bold' in pdfmetrics.getRegisteredFontNames() else 'Helvetica-Bold',
        )))
    
    story.append(Spacer(1, 0.3 * inch))
    
    # Completion date
    date_text = f"Completed on {completion_date.strftime('%B %d, %Y')}"
    if expiry_date:
        date_text += f"<br/>Valid until {expiry_date.strftime('%B %d, %Y')}"
    story.append(Paragraph(date_text, body_style))
    
    story.append(Spacer(1, 0.5 * inch))
    
    # Certificate number and QR code
    if certificate_number or qr_code_data:
        # Create table for certificate number and QR code
        qr_table_data = []
        
        if qr_code_data:
            # Generate QR code
            qr_buffer = generate_qr_code_image(qr_code_data, size=150)
            qr_img = Image(qr_buffer, width=1.5*inch, height=1.5*inch)
            qr_table_data.append([qr_img])
        
        if certificate_number:
            cert_num_text = f"Certificate #: {certificate_number}"
            qr_table_data.append([Paragraph(cert_num_text, ParagraphStyle(
                'CertNumber',
                parent=body_style,
                fontSize=10,
                textColor=colors.HexColor('#666666'),
            ))])
        
        if qr_table_data:
            qr_table = Table(qr_table_data, colWidths=[3*inch])
            qr_table.setStyle(TableStyle([
                ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ]))
            story.append(qr_table)
    
    story.append(Spacer(1, 0.5 * inch))
    
    # Signature area
    signature_data = [
        ['', ''],
        ['_________________________', '_________________________'],
        ['Signature', 'Date'],
    ]
    signature_table = Table(signature_data, colWidths=[3*inch, 3*inch])
    signature_table.setStyle(TableStyle([
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTSIZE', (0, 1), (-1, -1), 10),
        ('FONTSIZE', (0, 2), (-1, -1), 9),
        ('TEXTCOLOR', (0, 2), (-1, -1), colors.HexColor('#666666')),
    ]))
    story.append(signature_table)
    
    # Build PDF
    doc.build(story)
    
    if buffer:
        buffer.seek(0)
        return buffer
    
    return None

