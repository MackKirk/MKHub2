import os
from reportlab.lib.pagesizes import A4
from reportlab.platypus import (
    BaseDocTemplate, Paragraph, Spacer, Frame, PageTemplate, PageBreak, Flowable, KeepTogether,
    Table, TableStyle
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.pdfbase.pdfmetrics import stringWidth


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
fonts_path = os.path.join(BASE_DIR, "assets", "fonts")
pdfmetrics.registerFont(TTFont("Montserrat", os.path.join(fonts_path, "Montserrat-Regular.ttf")))
pdfmetrics.registerFont(TTFont("Montserrat-Bold", os.path.join(fonts_path, "Montserrat-Bold.ttf")))


def draw_template_page(c, doc, data):
    """Draw template header/footer on each page"""
    c.setFillColor(colors.white)
    # Auto-fit cover title into the available width
    title = data.get("cover_title", "ESTIMATE") or "ESTIMATE"
    max_width = 520
    size = 17.2
    while size > 8 and c.stringWidth(title, "Montserrat-Bold", size) > max_width:
        size -= 0.8
    c.setFont("Montserrat-Bold", size)
    c.drawString(40, 784, title)
    c.setFont("Montserrat-Bold", 13)
    company_name = data.get("company_name", "")
    if company_name:
        c.drawString(40, 762, company_name)

    order_number = data.get("order_number", "")
    if order_number:
        formatted_order = f"MK-{order_number}" if not order_number.startswith("MK-") else order_number
        c.setFont("Montserrat-Bold", 11.5)
        c.setFillColor(colors.black)
        c.drawRightString(580, 828, formatted_order)


def build_estimate_fixed_pages(data, output_path):
    """Build fixed pages (cover + page 2) for estimate"""
    from reportlab.lib.utils import ImageReader
    from PIL import Image, ImageOps
    
    c = canvas.Canvas(output_path, pagesize=A4)
    page_width, page_height = A4

    # Cover page - similar to proposals
    cover_img_path = data.get("cover_image")
    if cover_img_path and os.path.exists(cover_img_path):
        bw_path = os.path.join(BASE_DIR, "assets", "cover_bw_tmp.png")
        try:
            with Image.open(cover_img_path) as img:
                bw = ImageOps.grayscale(img)
                bw = ImageOps.autocontrast(bw)
                bw.save(bw_path)
            img = ImageReader(bw_path)
            c.drawImage(img, 14, 285, 566, 537, mask="auto")
            if os.path.exists(bw_path):
                os.remove(bw_path)
        except:
            pass

    logo_path = os.path.join(BASE_DIR, "assets", "logo.png")
    if os.path.exists(logo_path):
        logo = ImageReader(logo_path)
        c.drawImage(logo, 175, 690, width=230, height=125, mask="auto")

    overlay_path = os.path.join(BASE_DIR, "assets", "Asset 1@2x.png")
    if os.path.exists(overlay_path):
        overlay = ImageReader(overlay_path)
        c.drawImage(overlay, 39, 304, width=516, height=60, mask="auto")

    # Helper to auto-fit text
    def fit_size(text, font="Montserrat-Bold", max_size=17.2, min_size=8.0, max_width=516.0):
        size = max_size
        txt = text or ""
        while size > min_size and stringWidth(txt, font, size) > max_width:
            size -= 0.8
        return size

    y = 339
    for value in [data.get("company_name", ""), data.get("company_address", "")]:
        if value:
            size = fit_size(value, "Montserrat-Bold", 17.2, 8.0, 516.0)
            c.setFont("Montserrat-Bold", size)
            c.setFillColor(colors.white)
            c.drawCentredString(page_width/2, y, value)
            y -= 25

    cover_title = "ESTIMATE"
    max_width_title = page_width - 80
    size = 32
    while size > 10 and stringWidth(cover_title, "Montserrat-Bold", size) > max_width_title:
        size -= 1.0
    c.setFont("Montserrat-Bold", size)
    c.setFillColor(colors.HexColor("#d62028"))
    c.drawCentredString(page_width/2, 205, cover_title)

    order_number = data.get("order_number", "")
    if order_number:
        formatted_order = f"MK-{order_number}" if not order_number.startswith("MK-") else order_number
        c.setFont("Montserrat-Bold", 11.5)
        c.setFillColor(colors.black)
        c.drawRightString(580, 828, formatted_order)

    c.showPage()

    # Page 2 - Project details
    page2_img = data.get("page2_image")
    if page2_img and os.path.exists(page2_img):
        img = ImageReader(page2_img)
        c.drawImage(img, 28, 380, 540, 340, mask="auto")

    c.showPage()
    c.save()


def build_estimate_dynamic_pages(data, output_path):
    """Build dynamic pages with sections"""
    doc = BaseDocTemplate(output_path, pagesize=A4,
                          rightMargin=40, leftMargin=40,
                          topMargin=100, bottomMargin=150)

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle("TitleRed", parent=styles["Normal"],
        fontName="Montserrat-Bold", fontSize=11.5, textColor=colors.HexColor("#d62028"), spaceAfter=12)
    user_style = ParagraphStyle("UserGrey", parent=styles["Normal"],
        fontName="Montserrat-Bold", fontSize=9.5, leading=14, textColor=colors.grey)
    item_style = ParagraphStyle("ItemStyle", parent=styles["Normal"],
        fontName="Montserrat", fontSize=9, leading=12, textColor=colors.black)

    story = []
    sections = data.get("sections", [])
    
    for sec in sections:
        section_name = sec.get("title", sec.get("section", ""))
        items = sec.get("items", [])
        
        if section_name:
            story.append(Paragraph(section_name, title_style))
            story.append(Spacer(1, 6))
        
        # Create table for items
        if items:
            table_data = []
            # Header
            table_data.append([
                Paragraph("<b>Item</b>", item_style),
                Paragraph("<b>Quantity</b>", item_style),
                Paragraph("<b>Unit</b>", item_style),
                Paragraph("<b>Unit Price</b>", item_style),
                Paragraph("<b>Total</b>", item_style)
            ])
            
            # Items
            for item in items:
                name = item.get("name") or item.get("description") or "Item"
                quantity = item.get("quantity", 0)
                unit = item.get("unit", "")
                unit_price = item.get("unit_price", 0)
                item_total = quantity * unit_price
                
                table_data.append([
                    Paragraph(str(name)[:50], item_style),
                    Paragraph(f"{quantity:.2f}", item_style),
                    Paragraph(str(unit)[:10], item_style),
                    Paragraph(f"${unit_price:.2f}", item_style),
                    Paragraph(f"${item_total:.2f}", item_style)
                ])
            
            # Section subtotal
            section_total = sum((it.get("quantity", 0) * it.get("unit_price", 0)) for it in items)
            table_data.append([
                Paragraph("<b>Section Subtotal:</b>", item_style),
                Paragraph("", item_style),
                Paragraph("", item_style),
                Paragraph("", item_style),
                Paragraph(f"<b>${section_total:.2f}</b>", item_style)
            ])
            
            estimate_table = Table(table_data, colWidths=[200, 80, 60, 100, 100])
            estimate_table.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f0f0f0")),
                ("TEXTCOLOR", (0, 0), (-1, -1), colors.black),
                ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
                ("ALIGN", (0, 0), (0, -1), "LEFT"),
                ("FONTNAME", (0, 0), (-1, 0), "Montserrat-Bold"),
                ("FONTSIZE", (0, 0), (-1, 0), 9),
                ("BOTTOMPADDING", (0, 0), (-1, 0), 12),
                ("TOPPADDING", (0, 0), (-1, 0), 12),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ]))
            story.append(estimate_table)
            story.append(Spacer(1, 20))

    # Summary/Pricing section
    story.append(Spacer(1, 20))
    
    # Pricing table similar to proposals
    class EstimatePricingTable(Flowable):
        def __init__(self, data):
            super().__init__()
            self.data = data
            # Calculate height based on number of items
            base_height = 120
            additional_items = 0
            if data.get("pst", 0) > 0:
                additional_items += 1
            if data.get("markup", 0) > 0:
                additional_items += 1
            if data.get("gst", 0) > 0:
                additional_items += 1
            self.height = base_height + (additional_items * 20) + 50
        
        def draw(self):
            c = self.canv
            width = A4[0] - 80
            x_left = 0
            x_right = width
            top_padding = 10
            y = self.height - top_padding

            c.setFont("Montserrat-Bold", 11.5)
            c.setFillColor(colors.HexColor("#d62028"))
            c.drawString(x_left, y, "Pricing Summary")
            
            y -= 30
            
            c.setFont("Montserrat-Bold", 11.5)
            c.setFillColor(colors.black)
            c.drawString(x_left, y, "Total Direct Costs")
            c.setFont("Montserrat-Bold", 11.5)
            c.setFillColor(colors.grey)
            c.drawRightString(x_right, y, f"${float(self.data.get('total', 0)):,.2f}")
            y -= 20

            pst_rate = self.data.get("pst_rate", 0)
            pst = self.data.get("pst", 0)
            if pst > 0:
                c.setFont("Montserrat-Bold", 11.5)
                c.setFillColor(colors.black)
                c.drawString(x_left, y, f"PST ({pst_rate}%)")
                c.setFont("Montserrat-Bold", 11.5)
                c.setFillColor(colors.grey)
                c.drawRightString(x_right, y, f"${pst:,.2f}")
                y -= 20

            subtotal = self.data.get("subtotal", 0)
            c.setFont("Montserrat-Bold", 11.5)
            c.setFillColor(colors.black)
            c.drawString(x_left, y, "Subtotal")
            c.setFont("Montserrat-Bold", 11.5)
            c.setFillColor(colors.grey)
            c.drawRightString(x_right, y, f"${subtotal:,.2f}")
            y -= 20

            markup = self.data.get("markup", 0)
            markup_value = self.data.get("markup_value", 0)
            if markup > 0:
                c.setFont("Montserrat-Bold", 11.5)
                c.setFillColor(colors.black)
                c.drawString(x_left, y, f"Markup ({markup:.0f}%)")
                c.setFont("Montserrat-Bold", 11.5)
                c.setFillColor(colors.grey)
                c.drawRightString(x_right, y, f"${markup_value:,.2f}")
                y -= 20

            final_total = self.data.get("final_total", 0)
            c.setFont("Montserrat-Bold", 11.5)
            c.setFillColor(colors.black)
            c.drawString(x_left, y, "Total Estimate")
            c.setFont("Montserrat-Bold", 11.5)
            c.setFillColor(colors.grey)
            c.drawRightString(x_right, y, f"${final_total:,.2f}")
            y -= 20

            gst_rate = self.data.get("gst_rate", 0)
            gst = self.data.get("gst", 0)
            if gst > 0:
                c.setFont("Montserrat-Bold", 11.5)
                c.setFillColor(colors.black)
                c.drawString(x_left, y, f"GST ({gst_rate}%)")
                c.setFont("Montserrat-Bold", 11.5)
                c.setFillColor(colors.grey)
                c.drawRightString(x_right, y, f"${gst:,.2f}")
                y -= 30

            # Grand total line
            c.setStrokeColor(colors.HexColor("#d62028"))
            c.setLineWidth(2)
            c.line(x_right - 100, y + 10, x_right, y + 10)

            grand_total = self.data.get("grand_total", 0)
            c.setFont("Montserrat-Bold", 14)
            c.setFillColor(colors.HexColor("#d62028"))
            c.drawString(x_left, y, "GRAND TOTAL:")
            c.setFont("Montserrat-Bold", 14)
            c.setFillColor(colors.HexColor("#d62028"))
            c.drawRightString(x_right, y, f"${grand_total:,.2f}")

    story.append(EstimatePricingTable(data))
    story.append(Spacer(1, 20))

    frame = Frame(
        35,
        75,
        A4[0] - 70,
        A4[1] - (125 + 75),
        id='normal'
    )

    template_page = PageTemplate(
        id='page_template',
        frames=[frame],
        onPage=lambda c, d: draw_template_page(c, d, data)
    )

    doc.addPageTemplates([template_page])
    doc.build(story)


async def generate_estimate_pdf(data: dict, output_path: str) -> None:
    """Generate estimate PDF using same template structure as proposals"""
    from .pdf_merge import merge_pdfs, apply_templates
    
    fixed_pdf = os.path.join(BASE_DIR, "tmp_estimate_fixed.pdf")
    dynamic_pdf = os.path.join(BASE_DIR, "tmp_estimate_dynamic.pdf")

    build_estimate_fixed_pages(data, fixed_pdf)
    build_estimate_dynamic_pages(data, dynamic_pdf)

    merged_pdf = os.path.join(BASE_DIR, "tmp_estimate_merged.pdf")
    merge_pdfs(fixed_pdf, dynamic_pdf, merged_pdf)

    cover_template = os.path.join(BASE_DIR, "assets", "templates", "cover_template.pdf")
    page_template = os.path.join(BASE_DIR, "assets", "templates", "page_template.pdf")
    apply_templates(merged_pdf, output_path, cover_template, page_template)

    for f in [fixed_pdf, dynamic_pdf, merged_pdf]:
        if os.path.exists(f):
            try:
                os.remove(f)
            except:
                pass

