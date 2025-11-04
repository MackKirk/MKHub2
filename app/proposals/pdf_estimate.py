import os
import copy
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
    summary_title_style = ParagraphStyle("SummaryTitleRed", parent=styles["Normal"],
        fontName="Montserrat-Bold", fontSize=14, textColor=colors.HexColor("#d62028"), spaceAfter=20)
    user_style = ParagraphStyle("UserGrey", parent=styles["Normal"],
        fontName="Montserrat-Bold", fontSize=9.5, leading=14, textColor=colors.grey)
    item_style = ParagraphStyle("ItemStyle", parent=styles["Normal"],
        fontName="Montserrat", fontSize=9, leading=12, textColor=colors.black)

    story = []
    sections = data.get("sections", [])
    
    # Add "Summary and Analysis" title before sections
    if sections:
        story.append(Paragraph("Summary and Analysis", summary_title_style))
        story.append(Spacer(1, 10))
    
    for sec in sections:
        section_name = sec.get("title", sec.get("section", ""))
        items = sec.get("items", [])
        
        if section_name:
            story.append(Paragraph(section_name, title_style))
            story.append(Spacer(1, 6))
        
        # Determine if this is a product section (only products use different columns)
        # Labour, Sub-Contractors, Shop, and Miscellaneous all use the same columns
        is_product_section = section_name not in ['Labour', 'Sub-Contractors', 'Shop', 'Miscellaneous']
        
        # Create table for items
        if items:
            table_data = []
            
            # Get global markup from data
            global_markup = data.get("markup", 0.0)
            
            # Header - different columns for products vs other sections
            if is_product_section:
                # Product sections columns: Product/Item, Purchase Quantity, Total (with mkp), Supplier
                table_data.append([
                    Paragraph("<b>Product / Item</b>", item_style),
                    Paragraph("<b>Purchase Quantity</b>", item_style),
                    Paragraph("<b>Total (with Mkp)</b>", item_style),
                    Paragraph("<b>Supplier</b>", item_style)
                ])
            else:
                # Labour/Sub-Contractors/Shop/Miscellaneous columns
                # Use "Composition" for Labour, "Quantity Required" for Sub-Contractors/Shop/Miscellaneous
                column_header = "Composition" if section_name == "Labour" else "Quantity Required"
                table_data.append([
                    Paragraph(f"<b>{section_name}</b>", item_style),
                    Paragraph(f"<b>{column_header}</b>", item_style),
                    Paragraph("<b>Unit Price</b>", item_style),
                    Paragraph("<b>Total (with Mkp)</b>", item_style)
                ])
            
            # Items
            for item in items:
                name = item.get("name") or item.get("description") or "Item"
                item_type = item.get("item_type", "product")
                unit = item.get("unit", "")
                unit_price = item.get("unit_price", 0)
                markup = item.get("markup") if item.get("markup") is not None else global_markup
                
                # Calculate item total based on item type
                if item_type == 'labour' and item.get("labour_journey_type"):
                    if item.get("labour_journey_type") == 'contract':
                        quantity = item.get("labour_journey", 0)
                        item_total = quantity * unit_price
                        composition = f"{quantity:.2f} contract"
                    else:
                        quantity = item.get("labour_journey", 0) * item.get("labour_men", 0)
                        item_total = quantity * unit_price
                        journey_type = item.get("labour_journey_type", "days")
                        composition = f"{item.get('labour_journey', 0):.2f} {journey_type} × {item.get('labour_men', 0)} men"
                else:
                    quantity = item.get("quantity", 0)
                    item_total = quantity * unit_price
                    # For non-labour items in non-product sections, composition is empty or can show quantity and unit
                    if not is_product_section:
                        composition = f"{quantity:.2f} {unit}" if unit else f"{quantity:.2f}"
                    else:
                        composition = ""
                
                # Calculate total with markup
                total_with_markup = item_total * (1 + (markup / 100))
                
                if is_product_section:
                    # Product row: Product/Item, Purchase Quantity, Total (with mkp), Supplier
                    supplier_name = item.get("supplier_name", "")
                    table_data.append([
                        Paragraph(str(name)[:50], item_style),
                        Paragraph(f"{quantity:.2f}", item_style),
                        Paragraph(f"${total_with_markup:.2f}", item_style),
                        Paragraph(str(supplier_name)[:40], item_style)
                    ])
                else:
                    # Labour/Sub-Contractors/Shop/Miscellaneous row: Labours, Composition, Unit Price, Total (With mkp)
                    table_data.append([
                        Paragraph(str(name)[:50], item_style),
                        Paragraph(str(composition)[:40], item_style),
                        Paragraph(f"${unit_price:.2f}", item_style),
                        Paragraph(f"${total_with_markup:.2f}", item_style)
                    ])
            
            # Section subtotal - calculate correctly for all item types
            section_total = 0.0
            section_total_with_markup = 0.0
            for it in items:
                item_type = it.get("item_type", "product")
                item_markup = it.get("markup") if it.get("markup") is not None else global_markup
                
                if item_type == 'labour' and it.get("labour_journey_type"):
                    if it.get("labour_journey_type") == 'contract':
                        item_total = (it.get("labour_journey", 0) or 0) * (it.get("unit_price", 0) or 0.0)
                    else:
                        item_total = (it.get("labour_journey", 0) or 0) * (it.get("labour_men", 0) or 0) * (it.get("unit_price", 0) or 0.0)
                else:
                    item_total = (it.get("quantity", 0) or 0) * (it.get("unit_price", 0) or 0.0)
                
                section_total += item_total
                section_total_with_markup += item_total * (1 + (item_markup / 100))
            
            # Add section subtotal row
            if is_product_section:
                table_data.append([
                    Paragraph("<b>Section Subtotal:</b>", item_style),
                    Paragraph("", item_style),
                    Paragraph(f"<b>${section_total_with_markup:.2f}</b>", item_style),
                    Paragraph("", item_style)
                ])
            else:
                table_data.append([
                    Paragraph("<b>Section Subtotal:</b>", item_style),
                    Paragraph("", item_style),
                    Paragraph("", item_style),
                    Paragraph(f"<b>${section_total_with_markup:.2f}</b>", item_style)
                ])
            
            # Set table column widths based on section type
            # A4 width: 595.27 points, margins: 40 left + 40 right = 80, available: ~515
            available_width = 515  # A4[0] - 80 (left + right margins)
            if is_product_section:
                # Product sections: Product/Item, Purchase Quantity, Total (with Mkp), Supplier
                # Distribute: 50% for Product/Item, 15% for Purchase Quantity, 20% for Total, 15% for Supplier
                col_widths = [
                    int(available_width * 0.50),  # Product/Item: ~258
                    int(available_width * 0.15),  # Purchase Quantity: ~77
                    int(available_width * 0.20),  # Total (with Mkp): ~103
                    int(available_width * 0.15)   # Supplier: ~77
                ]
            else:
                # Labour/Sub-Contractors/Shop/Miscellaneous: Labours, Composition, Unit Price, Total (With mkp)
                # Distribute: 35% for Labours, 35% for Composition, 15% for Unit Price, 15% for Total
                col_widths = [
                    int(available_width * 0.35),  # Labours: ~180
                    int(available_width * 0.35),  # Composition: ~180
                    int(available_width * 0.15),  # Unit Price: ~77
                    int(available_width * 0.15)   # Total (with Mkp): ~77
                ]
            
            estimate_table = Table(table_data, colWidths=col_widths)
            estimate_table.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f0f0f0")),
                ("TEXTCOLOR", (0, 0), (-1, -1), colors.black),
                ("ALIGN", (2, 0), (-1, -1), "RIGHT"),
                ("ALIGN", (0, 0), (1, -1), "LEFT"),
                ("FONTNAME", (0, 0), (-1, 0), "Montserrat-Bold"),
                ("FONTSIZE", (0, 0), (-1, 0), 8),
                ("BOTTOMPADDING", (0, 0), (-1, 0), 8),
                ("TOPPADDING", (0, 0), (-1, 0), 8),
                ("FONTSIZE", (0, 1), (-1, -2), 8),
                ("FONTSIZE", (0, -1), (-1, -1), 9),
                ("FONTNAME", (0, -1), (-1, -1), "Montserrat-Bold"),
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
            # Calculate height based on number of items - always show all items
            base_height = 120
            # Always show: Total Direct Costs, PST, Subtotal, Sections Mark-up, Profit, Total Estimate, GST, Grand Total
            self.height = base_height + (8 * 20) + 50
        
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

            # Always show PST (even if 0)
            pst_rate = self.data.get("pst_rate", 0)
            pst = self.data.get("pst", 0)
            c.setFont("Montserrat-Bold", 11.5)
            c.setFillColor(colors.black)
            c.drawString(x_left, y, f"PST ({pst_rate}%)")
            c.setFont("Montserrat-Bold", 11.5)
            c.setFillColor(colors.grey)
            c.drawRightString(x_right, y, f"${pst:,.2f}")
            y -= 20

            # Always show Subtotal
            subtotal = self.data.get("subtotal", 0)
            c.setFont("Montserrat-Bold", 11.5)
            c.setFillColor(colors.black)
            c.drawString(x_left, y, "Subtotal")
            c.setFont("Montserrat-Bold", 11.5)
            c.setFillColor(colors.grey)
            c.drawRightString(x_right, y, f"${subtotal:,.2f}")
            y -= 20

            # Always show Sections Mark-up (even if 0)
            markup_value = self.data.get("markup_value", 0)
            c.setFont("Montserrat-Bold", 11.5)
            c.setFillColor(colors.black)
            c.drawString(x_left, y, "Sections Mark-up")
            c.setFont("Montserrat-Bold", 11.5)
            c.setFillColor(colors.grey)
            c.drawRightString(x_right, y, f"${markup_value:,.2f}")
            y -= 20

            # Always show Profit (even if 0)
            profit_rate = self.data.get("profit_rate", 0)
            profit_value = self.data.get("profit_value", 0)
            c.setFont("Montserrat-Bold", 11.5)
            c.setFillColor(colors.black)
            c.drawString(x_left, y, f"Total Profit ({profit_rate:.1f}%)")
            c.setFont("Montserrat-Bold", 11.5)
            c.setFillColor(colors.grey)
            c.drawRightString(x_right, y, f"${profit_value:,.2f}")
            y -= 20

            # Always show Total Estimate
            final_total = self.data.get("final_total", 0)
            c.setFont("Montserrat-Bold", 11.5)
            c.setFillColor(colors.black)
            c.drawString(x_left, y, "Total Estimate")
            c.setFont("Montserrat-Bold", 11.5)
            c.setFillColor(colors.grey)
            c.drawRightString(x_right, y, f"${final_total:,.2f}")
            y -= 20

            # Always show GST (even if 0)
            gst_rate = self.data.get("gst_rate", 0)
            gst = self.data.get("gst", 0)
            c.setFont("Montserrat-Bold", 11.5)
            c.setFillColor(colors.black)
            c.drawString(x_left, y, f"GST ({gst_rate}%)")
            c.setFont("Montserrat-Bold", 11.5)
            c.setFillColor(colors.grey)
            c.drawRightString(x_right, y, f"${gst:,.2f}")
            y -= 30

            # Grand total line - draw line higher to avoid overlapping text
            c.setStrokeColor(colors.HexColor("#d62028"))
            c.setLineWidth(2)
            c.line(x_right - 100, y + 25, x_right, y + 25)

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
    """Generate estimate PDF starting directly with sections (no cover or page 2)"""
    from PyPDF2 import PdfWriter, PdfReader
    
    # Only build dynamic pages with sections (skip fixed pages - cover and page 2)
    dynamic_pdf = os.path.join(BASE_DIR, "tmp_estimate_dynamic.pdf")
    build_estimate_dynamic_pages(data, dynamic_pdf)

    # Apply template only to dynamic pages (no cover template needed)
    page_template = os.path.join(BASE_DIR, "assets", "templates", "page_template.pdf")
    
    # Apply page template to all pages
    reader_content = PdfReader(dynamic_pdf)
    reader_page = PdfReader(page_template)
    writer = PdfWriter()

    for page in reader_content.pages:
        template_page = reader_page.pages[0]
        merged = copy.deepcopy(template_page)
        merged.merge_page(page)
        writer.add_page(merged)

    with open(output_path, "wb") as f:
        writer.write(f)

    # Clean up temporary files
    if os.path.exists(dynamic_pdf):
        try:
            os.remove(dynamic_pdf)
        except:
            pass

