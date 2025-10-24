import os
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from reportlab.lib import colors
from reportlab.lib.utils import ImageReader
from PIL import Image, ImageOps
try:
    from pillow_heif import register_heif_opener  # HEIC/HEIF support
    register_heif_opener()
except Exception:
    pass
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from datetime import datetime
from reportlab.pdfbase.pdfmetrics import stringWidth


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
page_width, page_height = A4
fonts_path = os.path.join(BASE_DIR, "assets", "fonts")
pdfmetrics.registerFont(TTFont("Montserrat", os.path.join(fonts_path, "Montserrat-Regular.ttf")))
pdfmetrics.registerFont(TTFont("Montserrat-Bold", os.path.join(fonts_path, "Montserrat-Bold.ttf")))


def build_cover_page(c, data):
    cover_img_path = data.get("cover_image")
    if cover_img_path and os.path.exists(cover_img_path):
        bw_path = os.path.join(BASE_DIR, "assets", "cover_bw_tmp.png")
        with Image.open(cover_img_path) as img:
            bw = ImageOps.grayscale(img)
            bw = ImageOps.autocontrast(bw)
            bw.save(bw_path)
        img = ImageReader(bw_path)
        c.drawImage(img, 14, 285, 566, 537, mask="auto")
        os.remove(bw_path)

    logo_path = os.path.join(BASE_DIR, "assets", "logo.png")
    if os.path.exists(logo_path):
        logo = ImageReader(logo_path)
        c.drawImage(logo, 175, 690, width=230, height=125, mask="auto")

    overlay_path = os.path.join(BASE_DIR, "assets", "Asset 1@2x.png")
    if os.path.exists(overlay_path):
        overlay = ImageReader(overlay_path)
        c.drawImage(overlay, 39, 304, width=516, height=60, mask="auto")

    # Helper to auto-fit text into a max width
    def fit_size(text, font="Montserrat-Bold", max_size=17.2, min_size=8.0, max_width=516.0):
        size = max_size
        txt = text or ""
        while size > min_size and stringWidth(txt, font, size) > max_width:
            size -= 0.8
        return size

    y = 339
    for value in [data.get("company_name", ""), data.get("company_address", "")]:
        size = fit_size(value, "Montserrat-Bold", 17.2, 8.0, 516.0)
        c.setFont("Montserrat-Bold", size)
        c.setFillColor(colors.white)
        c.drawCentredString(585/2, y, value)
        y -= 25

    cover_title = data.get("cover_title", "") or ""
    # Fit the main red title within page margins
    max_width_title = page_width - 80  # 40pt margins
    size = 32
    while size > 10 and stringWidth(cover_title, "Montserrat-Bold", size) > max_width_title:
        size -= 1.0
    c.setFont("Montserrat-Bold", size)
    c.setFillColor(colors.HexColor("#d62028"))
    c.drawCentredString(page_width/2, 205, cover_title)

    order_number = data.get("order_number", "")
    formatted_order = f"MK-{order_number}" if order_number else ""
    c.setFont("Montserrat-Bold", 11.5)
    c.setFillColor(colors.black)
    c.drawRightString(580, 828, formatted_order)


def format_date(date_str):
    try:
        dt = datetime.strptime(date_str, "%Y-%m-%d")
        day = dt.day
        if 10 <= day % 100 <= 20:
            suffix = "th"
        else:
            suffix = {1: "st", 2: "nd", 3: "rd"}.get(day % 10, "th")
        return dt.strftime(f"%b {day}{suffix}, %Y")
    except Exception:
        return date_str


def draw_wrapped_text(c, text, x, y, max_width, font="Montserrat-Bold", size=11.5, color=colors.grey):
    c.setFont(font, size)
    c.setFillColor(color)

    words = text.split()
    line = ""
    for word in words:
        test_line = (line + " " + word).strip()
        if stringWidth(test_line, font, size) <= max_width:
            line = test_line
        else:
            c.drawString(x, y, line)
            y -= size + 4
            line = word
    if line:
        c.drawString(x, y, line)
    return y


def build_page2(c, data):
    template_path = os.path.join(BASE_DIR, "assets", "templates", "page2_template.png")
    if os.path.exists(template_path):
        bg = ImageReader(template_path)
        c.drawImage(bg, 0, 0, width=page_width, height=page_height)

    c.setFillColor(colors.white)
    # Auto-fit the small header title at top-left of page 2
    hdr = data.get("cover_title", "") or ""
    max_width_hdr = 420  # safe width to avoid logo area
    size_hdr = 17.2
    while size_hdr > 8.0 and stringWidth(hdr, "Montserrat-Bold", size_hdr) > max_width_hdr:
        size_hdr -= 0.8
    # If still overflowing at min size, truncate with ellipsis
    if stringWidth(hdr, "Montserrat-Bold", size_hdr) > max_width_hdr:
        # binary search truncate
        lo, hi = 0, len(hdr)
        ell = "…"
        while lo < hi:
            mid = (lo+hi)//2
            txt = hdr[:mid] + ell
            if stringWidth(txt, "Montserrat-Bold", size_hdr) <= max_width_hdr:
                lo = mid + 1
            else:
                hi = mid
        hdr = hdr[:max(0, lo-1)] + ell
    c.setFont("Montserrat-Bold", size_hdr)
    c.drawString(40, 784, hdr)
    c.setFont("Montserrat-Bold", 13)
    c.drawString(40, 762, data.get("company_name", ""))

    order_number = data.get("order_number", "")
    formatted_order = f"MK-{order_number}" if order_number else ""
    c.setFont("Montserrat-Bold", 11.5)
    c.setFillColor(colors.black)
    c.drawRightString(580, 828, formatted_order)

    y = 350
    c.setFont("Montserrat-Bold", 11.5)
    c.setFillColor(colors.HexColor("#d62028"))
    c.drawString(40, y, "General Proposal Details")
    c.setFont("Montserrat-Bold", 11.5)
    c.setFillColor(colors.HexColor("#d62028"))
    date_value = data.get("date", "")
    formatted_date = format_date(date_value)
    c.drawRightString(page_width - 40, y, formatted_date)
    y -= 30

    project_fields = [
        ("Project Name / Description:", data.get("company_name", "")),
        ("Project Address:", data.get("company_address", "")),
        ("Proposal Created For:", data.get("proposal_created_for", "")),
        ("Primary Contact Phone:", data.get("primary_contact_phone", "")),
        ("Primary Contact Name:", data.get("primary_contact_name", "")),
        ("Primary Contact E-mail:", data.get("primary_contact_email", "")),
    ]
    for label, value in project_fields:
        c.setFont("Montserrat-Bold", 11.5)
        c.setFillColor(colors.black)
        c.drawString(40, y, label)
        c.setFillColor(colors.grey)
        c.drawRightString(page_width - 40, y, value)
        y -= 20

    y -= 20
    c.setFont("Montserrat-Bold", 11.5)
    c.setFillColor(colors.HexColor("#d62028"))
    c.drawString(40, y, "Project Details")
    y -= 25

    details_fields = [
        ("Type of Project:", data.get("type_of_project", "")),
        ("Other Notes (If Any):", data.get("other_notes", "")),
    ]
    for i, (label, value) in enumerate(details_fields):
        c.setFont("Montserrat-Bold", 11.5)
        c.setFillColor(colors.black)
        c.drawString(40, y, label)

        y = draw_wrapped_text(
            c, value, 180, y,
            page_width - 200,
            font="Montserrat-Bold", size=11, color=colors.grey
        )

        if i == 0:
            y -= 20
        else:
            y -= 10

    page2_img = data.get("page2_image")
    if page2_img and os.path.exists(page2_img):
        img = ImageReader(page2_img)
        c.drawImage(img, 28, 380, 540, 340, mask="auto")


def build_fixed_pages(data, output_path):
    c = canvas.Canvas(output_path, pagesize=A4)
    build_cover_page(c, data)
    c.showPage()
    build_page2(c, data)
    c.showPage()
    c.save()


