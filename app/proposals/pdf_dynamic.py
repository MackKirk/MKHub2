import os
import uuid
from reportlab.lib.pagesizes import A4
from reportlab.platypus import (
    BaseDocTemplate, Paragraph, Spacer, Frame, PageTemplate, PageBreak, Flowable, KeepTogether,
    Table, TableStyle, Image, CondPageBreak, NextPageTemplate
)
from reportlab.lib.utils import ImageReader
from PIL import Image as PILImage
try:
    from pillow_heif import register_heif_opener  # HEIC/HEIF support
    register_heif_opener()
except Exception:
    pass
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfmetrics import stringWidth


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
fonts_path = os.path.join(BASE_DIR, "assets", "fonts")
pdfmetrics.registerFont(TTFont("Montserrat", os.path.join(fonts_path, "Montserrat-Regular.ttf")))
pdfmetrics.registerFont(TTFont("Montserrat-Bold", os.path.join(fonts_path, "Montserrat-Bold.ttf")))


def draw_template_page3(c, doc, data):
    # Draw static background template (header, footer, globe, etc.)
    try:
        page_width, page_height = A4
        template_style = data.get("template_style", "Mack Kirk")
        if template_style == "Mack Kirk Metals":
            bg_path = os.path.join(BASE_DIR, "assets", "templates", "page_MKM_template.png")
        else:
            bg_path = os.path.join(BASE_DIR, "assets", "templates", "page_MK_template.png")
        if os.path.exists(bg_path):
            bg = ImageReader(bg_path)
            c.drawImage(bg, 0, 0, width=page_width, height=page_height)
    except Exception:
        # Fail gracefully – if background can't be drawn, continue with text only
        pass

    c.setFillColor(colors.white)
    # Auto-fit cover title into the available width
    title = data.get("cover_title", "") or ""
    max_width = 520  # approx available width between margins
    size = 17.2
    while size > 8 and c.stringWidth(title, "Montserrat-Bold", size) > max_width:
        size -= 0.8
    c.setFont("Montserrat-Bold", size)
    c.drawString(40, 784, title)
    c.setFont("Montserrat-Bold", 13)
    c.drawString(40, 762, data.get("company_name", ""))

    order_number = data.get("order_number", "")
    formatted_order = order_number if order_number else ""
    c.setFont("Montserrat-Bold", 11.5)
    c.setFillColor(colors.black)
    c.drawRightString(580, 828, formatted_order)


def wrap_text(text, font_name, font_size, max_width):
    """Break text into multiple lines that fit within max_width."""
    if not text:
        return [""]
    
    words = text.split()
    lines = []
    current_line = []
    
    for word in words:
        test_line = " ".join(current_line + [word])
        if stringWidth(test_line, font_name, font_size) <= max_width:
            current_line.append(word)
        else:
            if current_line:
                lines.append(" ".join(current_line))
            # If single word is too long, add it anyway (will overflow but won't break)
            if stringWidth(word, font_name, font_size) > max_width:
                lines.append(word)
                current_line = []
            else:
                current_line = [word]
    
    if current_line:
        lines.append(" ".join(current_line))
    
    return lines if lines else [""]


class PricingTable(Flowable):
    def __init__(self, data):
        super().__init__()
        self.data = data
        pricing_type = data.get('pricing_type', 'pricing')
        
        if pricing_type == 'estimate':
            # For estimate: Bid Price (16) + GST (16) + TOTAL with spacing (36) + title/padding (46) = 114
            show_total = data.get('show_total_in_pdf', True)
            show_gst = data.get('show_gst_in_pdf', True)
            height = 46  # Title and padding
            height += 16  # Bid Price
            if show_gst:
                height += 16  # GST
            if show_total:
                height += 36  # TOTAL with spacing and line
            self.height = height
        else:
            # For manual pricing: calculate based on additional costs, PST, GST, TOTAL
            additional_costs = data.get("additional_costs") or []
            show_total = data.get('show_total_in_pdf', True)
            show_pst = data.get('show_pst_in_pdf', True)
            show_gst = data.get('show_gst_in_pdf', True)
            base_height = 70 if show_total else 50  # Reduced height if total is hidden
            
            # Calculate height considering wrapped text for each cost item
            # Reserve space for price on right (about 100px width)
            max_label_width = (A4[0] - 80) - 100  # Total width minus space for price
            font_name = "Montserrat-Bold"
            font_size = 11.5
            additional_height = 0
            for cost in additional_costs:
                label = cost.get("label", "")
                wrapped_lines = wrap_text(label, font_name, font_size, max_label_width)
                # Each line takes 16px, with 2px spacing between lines
                additional_height += len(wrapped_lines) * 16 + (len(wrapped_lines) - 1) * 2
            
            # Add height for PST and GST lines if they should be shown
            pst_gst_height = 0
            if show_pst:
                pst_gst_height += 16
            if show_gst:
                pst_gst_height += 16
            self.height = base_height + additional_height + pst_gst_height
        
        self.top_padding = 10

    def draw(self):
        c = self.canv
        width = A4[0] - 80
        x_left = 0
        x_right = width
        y = self.height - self.top_padding

        c.setFont("Montserrat-Bold", 11.5)
        c.setFillColor(colors.HexColor("#d62028"))
        c.drawString(x_left, y, "Pricing Table")

        y -= 30

        pricing_type = self.data.get('pricing_type', 'pricing')
        
        # For estimate pricing, show simplified format: Bid Price, GST, TOTAL
        if pricing_type == 'estimate':
            # Bid Price (Total Estimate)
            estimate_total_estimate = self.data.get('estimate_total_estimate', 0.0)
            try:
                estimate_total_estimate = float(estimate_total_estimate)
            except Exception:
                estimate_total_estimate = 0.0
            
            c.setFont("Montserrat-Bold", 11.5)
            c.setFillColor(colors.black)
            c.drawString(x_left, y, "Bid Price")
            c.setFont("Montserrat-Bold", 11.5)
            c.setFillColor(colors.grey)
            c.drawRightString(x_right, y, f"${estimate_total_estimate:,.2f}")
            y -= 16

            # GST
            show_gst = self.data.get('show_gst_in_pdf', True)
            if show_gst:
                gst_value = self.data.get('gst_value', 0.0)
                try:
                    gst_value = float(gst_value)
                except Exception:
                    gst_value = 0.0
                c.setFont("Montserrat-Bold", 11.5)
                c.setFillColor(colors.black)
                c.drawString(x_left, y, "GST")
                c.setFont("Montserrat-Bold", 11.5)
                c.setFillColor(colors.grey)
                c.drawRightString(x_right, y, f"${gst_value:,.2f}")
                y -= 16

            # TOTAL
            show_total = self.data.get('show_total_in_pdf', True)
            if show_total:
                y -= 20
                c.setStrokeColor(colors.HexColor("#d62028"))
                c.setLineWidth(2)
                c.line(x_right - 40, y + 20, x_right, y + 20)

                total_val = self.data.get('total')
                try:
                    total_val = float(total_val)
                    if not (total_val == total_val):  # Check for NaN
                        total_val = 0.0
                except Exception:
                    total_val = 0.0

                c.setFont("Montserrat-Bold", 11.5)
                c.setFillColor(colors.black)
                c.drawString(x_left, y, "TOTAL")

                c.setFillColor(colors.grey)
                c.drawRightString(x_right, y, f"${total_val:,.2f}")
        else:
            # For manual pricing, show the full format
            additional_costs = self.data.get("additional_costs") or []
            if additional_costs:
                # Reserve space for price on right (about 100px width)
                max_label_width = width - 100
                font_name = "Montserrat-Bold"
                font_size = 11.5
                
                for cost in additional_costs:
                    c.setFont(font_name, font_size)
                    c.setFillColor(colors.black)
                    label = cost.get("label", "")
                    value = f"${float(cost.get('value', 0)):,.2f}"
                    
                    # Wrap text into multiple lines
                    wrapped_lines = wrap_text(label, font_name, font_size, max_label_width)
                    
                    # Draw each line of the label
                    line_y = y
                    for i, line in enumerate(wrapped_lines):
                        c.drawString(x_left, line_y, line)
                        if i < len(wrapped_lines) - 1:
                            line_y -= 16 + 2  # 16px line height + 2px spacing
                    
                    # Draw price aligned to the right, on the last line of the label
                    c.setFont(font_name, font_size)
                    c.setFillColor(colors.grey)
                    c.drawRightString(x_right, line_y, value)
                    
                    # Move y down by the total height of this item (all lines)
                    y -= len(wrapped_lines) * 16 + (len(wrapped_lines) - 1) * 2

            # Show PST if enabled
            show_pst = self.data.get('show_pst_in_pdf', True)
            if show_pst:
                pst_value = self.data.get('pst_value', 0.0)
                try:
                    pst_value = float(pst_value)
                except Exception:
                    pst_value = 0.0
                c.setFont("Montserrat-Bold", 11.5)
                c.setFillColor(colors.black)
                c.drawString(x_left, y, "PST")
                c.setFont("Montserrat-Bold", 11.5)
                c.setFillColor(colors.grey)
                c.drawRightString(x_right, y, f"${pst_value:,.2f}")
                y -= 16

            # Show GST if enabled
            show_gst = self.data.get('show_gst_in_pdf', True)
            if show_gst:
                gst_value = self.data.get('gst_value', 0.0)
                try:
                    gst_value = float(gst_value)
                except Exception:
                    gst_value = 0.0
                c.setFont("Montserrat-Bold", 11.5)
                c.setFillColor(colors.black)
                c.drawString(x_left, y, "GST")
                c.setFont("Montserrat-Bold", 11.5)
                c.setFillColor(colors.grey)
                c.drawRightString(x_right, y, f"${gst_value:,.2f}")
                y -= 16

            # Check if total should be shown in PDF
            show_total = self.data.get('show_total_in_pdf', True)
            if show_total:
                y -= 20
                c.setStrokeColor(colors.HexColor("#d62028"))
                c.setLineWidth(2)
                c.line(x_right - 40, y + 20, x_right, y + 20)

                # Use the provided total value (which is the Final Total with GST from the app)
                total_val = self.data.get('total')
                try:
                    total_val = float(total_val)
                    if not (total_val == total_val):  # Check for NaN
                        total_val = 0.0
                except Exception:
                    total_val = 0.0

                c.setFont("Montserrat-Bold", 11.5)
                c.setFillColor(colors.black)
                c.drawString(x_left, y, "TOTAL:")

                c.setFillColor(colors.grey)
                c.drawRightString(x_right, y, f"${total_val:,.2f}")


class OptionalServicesTable(Flowable):
    def __init__(self, data):
        super().__init__()
        self.data = data
        optional_services = data.get("optional_services") or []
        base_height = 50
        
        # Calculate height considering wrapped text for each service
        # Reserve space for price on right (about 100px width)
        max_label_width = (A4[0] - 80) - 100  # Total width minus space for price
        font_name = "Montserrat-Bold"
        font_size = 11.5
        additional_height = 0
        for service in optional_services:
            service_name = service.get("service", "")
            wrapped_lines = wrap_text(service_name, font_name, font_size, max_label_width)
            # Each line takes 16px, with 2px spacing between lines
            additional_height += len(wrapped_lines) * 16 + (len(wrapped_lines) - 1) * 2
        
        self.height = base_height + additional_height
        self.top_padding = 10

    def draw(self):
        c = self.canv
        width = A4[0] - 80
        x_left = 0
        x_right = width
        y = self.height - self.top_padding

        c.setFont("Montserrat-Bold", 11.5)
        c.setFillColor(colors.HexColor("#d62028"))
        c.drawString(x_left, y, "Optional Services")

        y -= 30

        optional_services = self.data.get("optional_services") or []
        if optional_services:
            # Reserve space for price on right (about 100px width)
            max_label_width = width - 100
            font_name = "Montserrat-Bold"
            font_size = 11.5
            
            for service in optional_services:
                c.setFont(font_name, font_size)
                c.setFillColor(colors.black)
                service_name = service.get("service", "")
                service_price = f"${float(service.get('price', 0)):,.2f}"
                
                # Wrap text into multiple lines
                wrapped_lines = wrap_text(service_name, font_name, font_size, max_label_width)
                
                # Draw each line of the service name
                line_y = y
                for i, line in enumerate(wrapped_lines):
                    c.drawString(x_left, line_y, line)
                    if i < len(wrapped_lines) - 1:
                        line_y -= 16 + 2  # 16px line height + 2px spacing
                
                # Draw price aligned to the right, on the last line of the service name
                c.setFont(font_name, font_size)
                c.setFillColor(colors.grey)
                c.drawRightString(x_right, line_y, service_price)
                
                # Move y down by the total height of this item (all lines)
                y -= len(wrapped_lines) * 16 + (len(wrapped_lines) - 1) * 2


class YellowLine(Flowable):
    def __init__(self, width=30, height=15):
        super().__init__()
        self.width = width
        self.height = height

    def draw(self):
        c = self.canv
        x_left = 40
        y = 0
        c.setStrokeColor(colors.HexColor("#FFB200"))
        c.setLineWidth(2)
        c.line(x_left + 200, y + self.height/2, x_left + 250, y + self.height/2)


def build_dynamic_pages(data, output_path):
    doc = BaseDocTemplate(output_path, pagesize=A4,
                          rightMargin=40, leftMargin=40,
                          topMargin=100, bottomMargin=180,
                          allowSplitting=1)  # Allow content to split across pages to avoid layout issues

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle("TitleRed", parent=styles["Normal"],
        fontName="Montserrat-Bold", fontSize=11.5, textColor=colors.HexColor("#d62028"), spaceAfter=12)
    user_style = ParagraphStyle("UserGrey", parent=styles["Normal"],
        fontName="Montserrat-Bold", fontSize=9.5, leading=14, textColor=colors.grey, alignment=4)  # 4 = TA_JUSTIFY
    user_style_centered = ParagraphStyle("UserGreyCentered", parent=styles["Normal"],
        fontName="Montserrat-Bold", fontSize=9.5, leading=14, textColor=colors.grey, alignment=1)  # 1 = TA_CENTER

    class YellowLine2(Flowable):
        def __init__(self, width=20, height=2):
            super().__init__()
            self.width = width
            self.height = height

        def draw(self):
            c = self.canv
            c.setStrokeColor(colors.HexColor("#FFB200"))
            c.setLineWidth(2)
            c.line(0, 0, self.width, 0)

    frame_width = A4[0] - 70  # Must match Frame width defined later

    story = []
    temp_images: list[str] = []
    sections = data.get("sections") or []
    for sec in sections:
        if sec.get("type") == "text":
            title = sec.get("title", "")
            text = sec.get("text", "")

            if title:
                # Preserve empty lines by splitting and keeping all lines
                lines = text.split("\n")
                paragraphs = []
                for line in lines:
                    # Count leading spaces/tabs BEFORE stripping
                    leading_spaces = 0
                    leading_tabs = 0
                    for char in line:
                        if char == ' ':
                            leading_spaces += 1
                        elif char == '\t':
                            leading_tabs += 1
                        else:
                            break  # Stop at first non-space/tab character
                    
                    stripped = line.strip()
                    if stripped:
                        # Calculate indentation: 4 spaces or 1 tab = 1 level (20 points)
                        indent_level = (leading_spaces // 4) + leading_tabs
                        paragraphs.append(("text", stripped, indent_level))
                    else:
                        # Empty line - mark it to add spacing later
                        paragraphs.append(("empty", None, 0))

                if paragraphs:
                    # Keep title with at least first paragraph to avoid orphaned titles
                    first_para = paragraphs[0]
                    if first_para[0] == "text":
                        title_para = Paragraph(title, title_style)
                        
                        # Create paragraph with indentation if needed
                        para_text, indent_level = first_para[1], first_para[2]
                        if indent_level > 0:
                            # Create style with first line indent only (20 points per level)
                            indent_style = ParagraphStyle("UserGreyIndent", parent=user_style,
                                firstLineIndent=indent_level * 20, alignment=4)  # 4 = TA_JUSTIFY
                            first_para_flow = Paragraph(para_text, indent_style)
                        else:
                            first_para_flow = Paragraph(para_text, user_style)
                        
                        # Compute exact height needed for title + first paragraph
                        _, th = title_para.wrap(frame_width, 0)
                        _, ph = first_para_flow.wrap(frame_width, 0)
                        story.append(CondPageBreak(th + ph + 12))
                        # Title + first paragraph must stay together
                        title_and_first = [title_para, first_para_flow]
                        story.append(KeepTogether(title_and_first))

                    # Add remaining paragraphs
                    for para_type, para_text, indent_level in paragraphs[1:]:
                        if para_type == "empty":
                            # Add a spacer for empty lines to preserve spacing
                            story.append(Spacer(1, 14))
                        else:
                            # Create paragraph with indentation if needed
                            if indent_level > 0:
                                # Create style with first line indent only (20 points per level)
                                indent_style = ParagraphStyle("UserGreyIndent", parent=user_style,
                                    firstLineIndent=indent_level * 20, alignment=4)  # 4 = TA_JUSTIFY
                                story.append(Paragraph(para_text, indent_style))
                            else:
                                story.append(Paragraph(para_text, user_style))
                else:
                    # No content, just add title (but this shouldn't happen in practice)
                    story.append(Paragraph(title, title_style))

            story.append(Spacer(1, 12))

        elif sec.get("type") == "images":
            imgs = []
            row = []
            # Store flow-to-caption mapping for later processing
            flow_captions = {}  # Maps flow object id to caption text

            for i, img in enumerate(sec.get("images", [])):
                flow = []
                # Prefer direct path from uploaded temp; future: support direct blob fetch for file_object_id
                img_path = img.get("path", "")
                if img_path and os.path.exists(img_path):
                    try:
                        with PILImage.open(img_path) as im:
                            im = im.convert("RGB")
                            tmp_path = os.path.join(BASE_DIR, f"tmp_img_{uuid.uuid4().hex}.png")
                            im.save(tmp_path, format="PNG", optimize=True)
                            flow.append(Image(tmp_path, width=260, height=150))
                            flow.append(YellowLine2(width=260))
                            temp_images.append(tmp_path)
                    except Exception:
                        pass
                caption = img.get("caption", "")
                caption_text = caption[:90] if caption else None

                if caption:
                    flow.append(Spacer(1, 4))
                    flow.append(Paragraph(caption_text, user_style))
                    # Store caption for this flow using id() as key
                    flow_captions[id(flow)] = caption_text
                if flow:
                    row.append(flow)

                if len(row) == 2:
                    imgs.append(row)
                    row = []

            if row:
                imgs.append(row)
            
            # Second pass: fix captions for rows that have only 1 image
            for r in imgs:
                if len(r) == 1:
                    # This row has only 1 image, replace caption paragraph with centered version
                    for flow in r:
                        if flow and id(flow) in flow_captions:
                            # Find and replace Paragraph with centered version
                            caption_text = flow_captions[id(flow)]
                            for idx, item in enumerate(flow):
                                if isinstance(item, Paragraph):
                                    # Replace with centered version
                                    flow[idx] = Paragraph(caption_text, user_style_centered)
                                    break  # Only replace first paragraph (the caption)

            if imgs:
                first_row = imgs[0]

                # Check if first row has only 1 image
                if len(first_row) == 1:
                    # Single image: use 3-column structure (empty, image, empty) to center without SPAN
                    # This avoids layout issues that SPAN can cause
                    empty_cell = [Spacer(1, 1)]
                    centered_row = [empty_cell, first_row[0], empty_cell]
                    first_table = Table([centered_row], colWidths=[137.5, 275, 137.5])  # Total: 550 (same as 275+275)
                    first_style = [
                        ("VALIGN", (0, 0), (-1, -1), "TOP"),
                        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                        ("ALIGN", (1, 0), (1, 0), "CENTER"),  # Center the image column
                        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
                        ("LEFTPADDING", (0, 0), (0, 0), 0),
                        ("RIGHTPADDING", (0, 0), (0, 0), 0),
                        ("LEFTPADDING", (2, 0), (2, 0), 0),
                        ("RIGHTPADDING", (2, 0), (2, 0), 0),
                    ]
                else:
                    # Two images: use standard two-column structure
                    first_table = Table([first_row], colWidths=[275, 275])
                    first_style = [
                        ("VALIGN", (0, 0), (-1, -1), "TOP"),
                        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
                    ]
                first_table.setStyle(TableStyle(first_style))

                # Compute exact height needed for title + first image row
                title_para = Paragraph(sec.get("title", ""), title_style)
                _, th = title_para.wrap(frame_width, 0)
                _, ih = first_table.wrap(frame_width, 0)
                story.append(CondPageBreak(th + ih + 12))

                # Keep title and first image together to avoid splitting across pages
                # This prevents title from staying on one page while image goes to next
                title_and_first = [title_para, first_table]
                story.append(KeepTogether(title_and_first))

                if len(imgs) > 1:
                    for row_data in imgs[1:]:
                        # Build table for this row (1 or 2 images)
                        if len(row_data) == 1:
                            empty_cell = [Spacer(1, 1)]
                            centered_row = [empty_cell, row_data[0], empty_cell]
                            table = Table([centered_row], colWidths=[137.5, 275, 137.5])  # Total: 550
                            row_style = [
                                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                                ("ALIGN", (1, 0), (1, 0), "CENTER"),  # Center the image column
                                ("BOTTOMPADDING", (0, 0), (-1, -1), 12),
                                ("LEFTPADDING", (0, 0), (0, 0), 0),
                                ("RIGHTPADDING", (0, 0), (0, 0), 0),
                                ("LEFTPADDING", (2, 0), (2, 0), 0),
                                ("RIGHTPADDING", (2, 0), (2, 0), 0),
                            ]
                        else:
                            table = Table([row_data], colWidths=[275, 275])
                            row_style = [
                                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                                ("BOTTOMPADDING", (0, 0), (-1, -1), 12),
                            ]

                        # Compute exact height for this row and ensure there is enough space
                        _, rh = table.wrap(frame_width, 0)
                        story.append(CondPageBreak(rh + 8))

                        table.setStyle(TableStyle(row_style))
                        story.append(table)
                # Add extra spacer after image section to ensure proper page layout
                story.append(Spacer(1, 15))
            else:
                # No images, just add normal spacer
                story.append(Spacer(1, 15))

    # --- Pricing (conditional) - independent from Optional Services
    try:
        add_costs = data.get("additional_costs") or []
        # Filter out empty costs
        valid_costs = [c for c in add_costs if c.get("label") and c.get("label").strip()]
        # Show pricing if there are valid costs
        show_pricing = len(valid_costs) > 0
        
        # Calculate total
        sum_costs = 0.0
        for c in valid_costs:
            try:
                sum_costs += float(c.get("value") or 0)
            except Exception:
                pass
        total_val = data.get("total")
        try:
            total_val = float(total_val)
        except Exception:
            total_val = sum_costs
    except Exception:
        show_pricing = False

    if show_pricing:
        story.append(YellowLine())
        story.append(Spacer(1, 20))
        story.append(PricingTable({ **data, "total": total_val, "additional_costs": valid_costs }))

    # Optional Services Table (only if there are optional services)
    optional_services = data.get("optional_services") or []
    if optional_services and len(optional_services) > 0:
        # Filter out empty services
        valid_services = [s for s in optional_services if s.get("service") and s.get("service").strip()]
        if valid_services:
            story.append(Spacer(1, 20))
            story.append(OptionalServicesTable({ **data, "optional_services": valid_services }))

    # --- Final Terms Page ---
    story.append(NextPageTemplate('page3_terms'))
    story.append(PageBreak())
    terms_title_para = Paragraph("General Project Terms & Conditions", title_style)
    terms_body_para = Paragraph((data.get("terms_text", "") or "").replace("\n", "<br/>"), user_style)
    # Ensure there is enough space for title + first chunk of terms on this page
    _, tth = terms_title_para.wrap(frame_width, 0)
    _, tbh = terms_body_para.wrap(frame_width, 0)
    story.append(CondPageBreak(tth + min(tbh, 80)))  # require some body text below title
    story.append(KeepTogether([terms_title_para, terms_body_para]))

    top_margin = 115
    # Bottom margin large enough to stay clear of the footer/globe, but still allow 3 rows of images.
    bottom_margin = 80

    # Main content frame (sections, images, pricing, etc.)
    frame_main = Frame(
        35,
        bottom_margin,
        A4[0] - 70,
        A4[1] - (top_margin + bottom_margin),
        id='page3_main',
        leftPadding=0,
        rightPadding=0,
        topPadding=0,
        bottomPadding=0
    )

    # Slightly smaller frame for the final terms page to stay further from the footer/globe
    frame_terms = Frame(
        35,
        bottom_margin + 40,  # Push content further up on the terms page
        A4[0] - 70,
        A4[1] - (top_margin + bottom_margin + 40),
        id='page3_terms',
        leftPadding=0,
        rightPadding=0,
        topPadding=0,
        bottomPadding=0
    )

    template_main = PageTemplate(
        id='page3_main',
        frames=[frame_main],
        onPage=lambda c, d: draw_template_page3(c, d, data)
    )

    template_terms = PageTemplate(
        id='page3_terms',
        frames=[frame_terms],
        onPage=lambda c, d: draw_template_page3(c, d, data)
    )

    doc.addPageTemplates([template_main, template_terms])
    doc.build(story)
    # Cleanup temp images
    for p in temp_images:
        try:
            if os.path.exists(p):
                os.remove(p)
        except Exception:
            pass


