import os
import uuid
from reportlab.lib.pagesizes import A4
from reportlab.platypus import (
    BaseDocTemplate, Paragraph, Spacer, Frame, PageTemplate, PageBreak, Flowable, KeepTogether,
    Table, TableStyle, Image
)
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


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
fonts_path = os.path.join(BASE_DIR, "assets", "fonts")
pdfmetrics.registerFont(TTFont("Montserrat", os.path.join(fonts_path, "Montserrat-Regular.ttf")))
pdfmetrics.registerFont(TTFont("Montserrat-Bold", os.path.join(fonts_path, "Montserrat-Bold.ttf")))


def draw_template_page3(c, doc, data):
    c.setFillColor(colors.white)
    # Auto-fit cover title into the available width
    title = data.get("cover_title", "") or ""
    max_width = 520  # approx available width between margins
    size = 17.2
    while size > 8:
        c.setFont("Montserrat-Bold", size)
        if c.stringWidth(title, "Montserrat-Bold", size) <= max_width:
            break
        size -= 0.8
    c.drawString(40, 784, title)
    c.setFont("Montserrat-Bold", 13)
    c.drawString(40, 762, data.get("company_name", ""))

    order_number = data.get("order_number", "")
    formatted_order = f"MK-{order_number}" if order_number else ""
    c.setFont("Montserrat-Bold", 11.5)
    c.setFillColor(colors.black)
    c.drawRightString(580, 828, formatted_order)


class PricingTable(Flowable):
    def __init__(self, data):
        super().__init__()
        self.data = data
        base_height = 90
        additional_height = len(data.get("additional_costs") or []) * 18
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
        c.drawString(x_left, y, "Pricing Table")

        y -= 30
        c.setFont("Montserrat-Bold", 11.5)
        c.setFillColor(colors.black)
        c.drawString(x_left, y, "Bid Price")

        c.setFont("Montserrat-Bold", 11.5)
        c.setFillColor(colors.grey)
        c.drawRightString(x_right, y, f"${float(self.data.get('bid_price', 0)):,.2f}")
        y -= 20

        additional_costs = self.data.get("additional_costs") or []
        if additional_costs:
            c.setFont("Montserrat-Bold", 11.5)
            c.setFillColor(colors.black)
            c.drawString(x_left, y, "Additional Cost(s)")

            for cost in additional_costs:
                c.setFont("Montserrat-Bold", 11.5)
                c.setFillColor(colors.grey)
                label = cost.get("label", "")
                value = f"${float(cost.get('value', 0)):,.2f}"
                c.drawRightString(x_right, y, f"{label} - {value}")
                y -= 16

        y -= 20
        c.setStrokeColor(colors.HexColor("#d62028"))
        c.setLineWidth(2)
        c.line(x_right - 40, y + 20, x_right, y + 20)

        c.setFont("Montserrat-Bold", 11.5)
        c.setFillColor(colors.black)
        c.drawString(x_left, y, "TOTAL:")

        c.setFillColor(colors.grey)
        c.drawRightString(x_right, y, f"${float(self.data.get('total', 0)):,.2f}")


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
                          topMargin=100, bottomMargin=150)

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle("TitleRed", parent=styles["Normal"],
        fontName="Montserrat-Bold", fontSize=11.5, textColor=colors.HexColor("#d62028"), spaceAfter=12)
    user_style = ParagraphStyle("UserGrey", parent=styles["Normal"],
        fontName="Montserrat-Bold", fontSize=9.5, leading=14, textColor=colors.grey)

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

    story = []
    temp_images: list[str] = []
    sections = data.get("sections") or []
    for sec in sections:
        if sec.get("type") == "text":
            title = sec.get("title", "")
            text = sec.get("text", "")

            if title:
                paragraphs = [p.strip() for p in text.split("\n") if p.strip()]

                block = [Paragraph(title, title_style)]
                if paragraphs:
                    block.append(Paragraph(paragraphs[0], user_style))
                    story.append(KeepTogether(block))

                    for para in paragraphs[1:]:
                        story.append(Paragraph(para, user_style))
                else:
                    story.append(Paragraph(title, title_style))

            story.append(Spacer(1, 12))

        elif sec.get("type") == "images":
            imgs = []
            row = []

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

                if caption:
                    caption = caption[:90]
                    flow.append(Spacer(1, 4))
                    flow.append(Paragraph(caption, user_style))
                if flow:
                    row.append(flow)

                if len(row) == 2:
                    imgs.append(row)
                    row = []

            if row:
                imgs.append(row)

            if imgs:
                # Ensure rows have two columns for table consistency
                for r in imgs:
                    while len(r) < 2:
                        r.append([Spacer(1, 1)])
                block = [Paragraph(sec.get("title", ""), title_style)]
                first_table = Table([imgs[0]], colWidths=[275, 275])
                first_table.setStyle(TableStyle([
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 12),
                ]))
                block.append(first_table)
                story.append(KeepTogether(block))

                if len(imgs) > 1:
                    for row_data in imgs[1:]:
                        table = Table([row_data], colWidths=[275, 275])
                        table.setStyle(TableStyle([
                            ("VALIGN", (0, 0), (-1, -1), "TOP"),
                            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                            ("BOTTOMPADDING", (0, 0), (-1, -1), 12),
                        ]))
                        story.append(table)
            story.append(Spacer(1, 20))

    story.append(YellowLine())
    story.append(Spacer(1, 20))
    story.append(PricingTable(data))

    story.append(PageBreak())
    story.append(Paragraph("General Project Terms & Conditions", title_style))
    story.append(Paragraph((data.get("terms_text", "") or "").replace("\n", "<br/>"), user_style))

    top_margin = 125
    bottom_margin = 75

    frame = Frame(
        35,
        bottom_margin,
        A4[0] - 70,
        A4[1] - (top_margin + bottom_margin),
        id='normal'
    )

    template_page3 = PageTemplate(
        id='page3',
        frames=[frame],
        onPage=lambda c, d: draw_template_page3(c, d, data)
    )

    doc.addPageTemplates([template_page3])
    doc.build(story)
    # Cleanup temp images
    for p in temp_images:
        try:
            if os.path.exists(p):
                os.remove(p)
        except Exception:
            pass


