import os
import uuid
import hashlib
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
from .pdf_image_optimizer import optimize_image_bytes


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
page_width, page_height = A4
fonts_path = os.path.join(BASE_DIR, "assets", "fonts")
pdfmetrics.registerFont(TTFont("Montserrat", os.path.join(fonts_path, "Montserrat-Regular.ttf")))
pdfmetrics.registerFont(TTFont("Montserrat-Bold", os.path.join(fonts_path, "Montserrat-Bold.ttf")))

_bg_reader_cache: dict[str, ImageReader] = {}
_bg_jpg_path_cache: dict[str, str] = {}
_BG_CACHE_DIR = os.path.join("var", "uploads", "pdf_template_cache")
_asset_reader_cache: dict[str, ImageReader] = {}


def _png_to_cached_jpg_path(png_path: str) -> str:
    """
    Convert A4 template PNGs into cached JPEG files on disk and return the JPEG path.
    Using a *file path* lets ReportLab embed the JPEG as DCT (much smaller) instead of raw bitmap streams.
    """
    os.makedirs(_BG_CACHE_DIR, exist_ok=True)
    abs_path = os.path.abspath(png_path)
    key = hashlib.md5(abs_path.encode("utf-8")).hexdigest()  # stable per template path
    jpg_name = f"{os.path.splitext(os.path.basename(png_path))[0]}_{key}.jpg"
    return os.path.join(_BG_CACHE_DIR, jpg_name)


def _get_cached_bg_reader(png_path: str) -> ImageReader:
    cached = _bg_reader_cache.get(png_path)
    if cached is not None:
        return cached

    try:
        jpg_path = _bg_jpg_path_cache.get(png_path)
        if not jpg_path:
            jpg_path = _png_to_cached_jpg_path(png_path)
            _bg_jpg_path_cache[png_path] = jpg_path

        # Create/refresh cache if missing
        if not os.path.exists(jpg_path):
            with Image.open(png_path) as im:
                # Flatten alpha to white and ensure RGB
                if im.mode in ("RGBA", "LA", "P"):
                    if im.mode == "P":
                        im = im.convert("RGBA")
                    rgb = Image.new("RGB", im.size, (255, 255, 255))
                    if im.mode in ("RGBA", "LA"):
                        rgb.paste(im, mask=im.split()[-1])
                    else:
                        rgb.paste(im)
                    im = rgb
                elif im.mode != "RGB":
                    im = im.convert("RGB")
                im.save(jpg_path, format="JPEG", quality=85, optimize=True, progressive=True, subsampling=2)

        reader = ImageReader(jpg_path)
        _bg_reader_cache[png_path] = reader
        return reader
    except Exception:
        # Fallback: use PNG directly
        reader = ImageReader(png_path)
        _bg_reader_cache[png_path] = reader
        return reader


def _png_to_cached_png_path(png_path: str, max_dim: int) -> str:
    os.makedirs(_BG_CACHE_DIR, exist_ok=True)
    abs_path = os.path.abspath(png_path)
    key = hashlib.md5(f"{abs_path}|{max_dim}".encode("utf-8")).hexdigest()
    out_name = f"{os.path.splitext(os.path.basename(png_path))[0]}_{key}_{max_dim}px.png"
    return os.path.join(_BG_CACHE_DIR, out_name)


def _get_cached_asset_reader(png_path: str, max_dim: int = 1200) -> ImageReader:
    """
    Cache-heavy static assets (like very large logo PNGs) are resized and re-saved as PNG
    preserving alpha. This prevents huge FlateDecode image streams in the PDF.
    """
    cache_key = f"{png_path}|{max_dim}"
    cached = _asset_reader_cache.get(cache_key)
    if cached is not None:
        return cached

    try:
        out_path = _png_to_cached_png_path(png_path, max_dim=max_dim)
        if not os.path.exists(out_path):
            with Image.open(png_path) as im:
                # Preserve alpha if present
                if im.mode == "P":
                    im = im.convert("RGBA")
                elif im.mode not in ("RGBA", "RGB"):
                    im = im.convert("RGBA")

                w, h = im.size
                m = max(w, h)
                if m > max_dim:
                    if w >= h:
                        new_w = max_dim
                        new_h = int(h * (max_dim / w))
                    else:
                        new_h = max_dim
                        new_w = int(w * (max_dim / h))
                    im = im.resize((max(1, new_w), max(1, new_h)), Image.Resampling.LANCZOS)

                # Save optimized PNG (still preserves alpha)
                im.save(out_path, format="PNG", optimize=True, compress_level=9)

        reader = ImageReader(out_path)
        _asset_reader_cache[cache_key] = reader
        return reader
    except Exception:
        reader = ImageReader(png_path)
        _asset_reader_cache[cache_key] = reader
        return reader


def build_cover_page(c, data):
    # Draw static background for cover (header, footer, globe, logos, etc.)
    try:
        cover_bg_path = os.path.join(BASE_DIR, "assets", "templates", "cover_template.png")
        if os.path.exists(cover_bg_path):
            bg = _get_cached_bg_reader(cover_bg_path)
            c.drawImage(bg, 0, 0, width=page_width, height=page_height)
    except Exception:
        # Fail gracefully if background image is missing
        pass

    # Optional: draw dynamic cover image on top of the background, reusing previous behavior
    cover_img_path = data.get("cover_image")
    if cover_img_path and os.path.exists(cover_img_path):
        # Optimize image before processing
        optimized_path = None
        try:
            with open(cover_img_path, "rb") as f:
                image_bytes = f.read()
            
            optimized_bytes = optimize_image_bytes(image_bytes, preset="cover")
            
            # Create temporary file for optimized image
            optimized_path = os.path.join(BASE_DIR, f"cover_optimized_{uuid.uuid4().hex}.jpg")
            with open(optimized_path, "wb") as f:
                f.write(optimized_bytes)
            
            # Use optimized image
            cover_img_path = optimized_path
        except Exception:
            # Fallback to original if optimization fails
            pass
        
        try:
            # Convert to grayscale for the cover style, but keep it small by saving as JPEG
            bw_path = os.path.join(BASE_DIR, f"cover_bw_{uuid.uuid4().hex}.jpg")
            with Image.open(cover_img_path) as img:
                bw = ImageOps.grayscale(img)
                bw = ImageOps.autocontrast(bw)
                # Ensure compatible mode for JPEG
                bw = bw.convert("RGB")
                bw.save(bw_path, format="JPEG", quality=80, optimize=True, progressive=True)
            img = ImageReader(bw_path)
            # Position chosen to keep within the white area of the new template
            c.drawImage(img, 14, 285, 566, 537, mask="auto")
        finally:
            # Cleanup optimized temp file if created
            if optimized_path and optimized_path != data.get("cover_image") and os.path.exists(optimized_path):
                try:
                    os.remove(optimized_path)
                except Exception:
                    pass
            try:
                if "bw_path" in locals() and bw_path and os.path.exists(bw_path):
                    os.remove(bw_path)
            except Exception:
                pass

    # Draw company logo on top of the cover image (as in the original design)
    try:
        template_style = data.get("template_style", "Mack Kirk")
        if template_style == "Mack Kirk Metals":
            logo_path = os.path.join(BASE_DIR, "assets", "MKM_logo.png")
        else:
            logo_path = os.path.join(BASE_DIR, "assets", "MK_logo.png")
        if os.path.exists(logo_path):
            # These logo PNGs can be extremely large (especially MKM). Resize/cache before embedding.
            logo = _get_cached_asset_reader(logo_path, max_dim=1200)
            c.drawImage(logo, 175, 690, width=230, height=125, mask="auto")
    except Exception:
        pass

    # Draw grey overlay bar (Asset 1) over the lower part of the hero image
    try:
        overlay_path = os.path.join(BASE_DIR, "assets", "cover_overlay.png")
        if os.path.exists(overlay_path):
            overlay = ImageReader(overlay_path)
            c.drawImage(overlay, 39, 304, width=516, height=60, mask="auto")
    except Exception:
        pass

    # Helper to auto-fit text into a max width
    def fit_size(text, font="Montserrat-Bold", max_size=17.2, min_size=8.0, max_width=516.0):
        size = max_size
        txt = text or ""
        while size > min_size and stringWidth(txt, font, size) > max_width:
            size -= 0.8
        return size

    y = 339
    # For quotes, use primary_contact_name instead of company_address in second line
    is_quote = data.get("is_quote", False)
    if is_quote:
        overlay_values = [data.get("company_name", ""), data.get("primary_contact_name", "")]
    else:
        overlay_values = [data.get("company_name", ""), data.get("company_address", "")]
    for value in overlay_values:
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
    formatted_order = order_number if order_number else ""
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


def draw_wrapped_text_right_aligned(c, text, right_x, y, max_width, font="Montserrat-Bold", size=11.5, color=colors.grey):
    """Draw text right-aligned with line wrapping and justification. Each line is justified, except the last which is right-aligned."""
    c.setFont(font, size)
    c.setFillColor(color)

    words = text.split()
    if not words:
        return y
    
    # Build lines with words
    lines_words = []
    current_line = []
    for word in words:
        test_words = current_line + [word]
        test_text = " ".join(test_words)
        if stringWidth(test_text, font, size) <= max_width:
            current_line.append(word)
        else:
            if current_line:
                lines_words.append(current_line)
            current_line = [word]
    if current_line:
        lines_words.append(current_line)
    
    # Draw each line
    for idx, line_words in enumerate(lines_words):
        is_last_line = idx == len(lines_words) - 1
        line_text = " ".join(line_words)
        
        if is_last_line or len(line_words) == 1:
            # Last line or single word: right-align
            c.drawRightString(right_x, y, line_text)
        else:
            # Justify the line by distributing space between words
            # Calculate total width of words without spaces
            word_widths = [stringWidth(word, font, size) for word in line_words]
            words_width = sum(word_widths)
            num_gaps = len(line_words) - 1
            if num_gaps > 0:
                # Total space to distribute between words
                total_space = max_width - words_width
                space_per_gap = total_space / num_gaps
                
                # Start at left edge of the text block (right_x - max_width)
                # This ensures the block is right-aligned and fills exactly max_width
                x = right_x - max_width
                for word_idx, word in enumerate(line_words):
                    c.drawString(x, y, word)
                    x += word_widths[word_idx]
                    # Add space after word (except for last word) to justify the line
                    if word_idx < len(line_words) - 1:
                        x += space_per_gap
            else:
                # Single word (shouldn't happen here, but just in case)
                c.drawRightString(right_x, y, line_text)
        
        # Only move y down if this is not the last line
        if idx < len(lines_words) - 1:
            y -= size + 4
    
    return y


def build_page2(c, data):
    # Use template based on template_style
    template_style = data.get("template_style", "Mack Kirk")
    if template_style == "Mack Kirk Metals":
        template_path = os.path.join(BASE_DIR, "assets", "templates", "page_MKM_template.png")
    else:
        template_path = os.path.join(BASE_DIR, "assets", "templates", "page_MK_template.png")
    if not os.path.exists(template_path):
        # Backwards compatibility with old file name
        template_path = os.path.join(BASE_DIR, "assets", "templates", "page_MK_template.png")
    if os.path.exists(template_path):
        bg = _get_cached_bg_reader(template_path)
        c.drawImage(bg, 0, 0, width=page_width, height=page_height)

    c.setFillColor(colors.white)
    # Auto-fit the small header title at top-left of page 2
    hdr = data.get("cover_title", "") or ""
    max_width_hdr = 360  # tighter width to avoid logo/edge
    size_hdr = 17.2
    while size_hdr > 6.0 and stringWidth(hdr, "Montserrat-Bold", size_hdr) > max_width_hdr:
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
    formatted_order = order_number if order_number else ""
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
        ("Project Name / Description:", data.get("project_name", "")),
        ("Project Address:", data.get("site_address", "")),
        ("Proposal Created For:", data.get("client_name", "")),
        ("Contact Name:", data.get("primary_contact_name", "")),
        ("Contact Phone:", data.get("primary_contact_phone", "")),
        ("Contact E-mail:", data.get("primary_contact_email", "")),
    ]
    for label, value in project_fields:
        c.setFont("Montserrat-Bold", 11.5)
        c.setFillColor(colors.black)
        c.drawString(40, y, label)
        c.setFillColor(colors.grey)
        c.drawRightString(page_width - 40, y, value)
        y -= 20

    # Check if Project Details section should be shown
    type_of_project = data.get("type_of_project", "").strip()
    other_notes = data.get("other_notes", "").strip()
    
    # Only show Project Details section if at least one field has content
    if type_of_project or other_notes:
        y -= 20
        c.setFont("Montserrat-Bold", 11.5)
        c.setFillColor(colors.HexColor("#d62028"))
        c.drawString(40, y, "Project Details")
        y -= 25

        details_fields = []
        # Only add "Type of Project" if it has content
        if type_of_project:
            details_fields.append(("Type of Project:", type_of_project))
        # Only add "Other Notes" if it has content
        if other_notes:
            details_fields.append(("Other Notes:", other_notes))
        
        for i, (label, value) in enumerate(details_fields):
            c.setFont("Montserrat-Bold", 11.5)
            c.setFillColor(colors.black)
            label_width = stringWidth(label, "Montserrat-Bold", 11.5)
            label_end_x = 40 + label_width + 20  # left margin + label width + spacing
            c.drawString(40, y, label)

            # Calculate max width for wrapped text
            # The text will be right-aligned, but must not overlap the label
            # So available width is from label_end_x to right margin
            available_width = (page_width - 40) - label_end_x  # from label end to right margin

            y = draw_wrapped_text_right_aligned(
                c, value, page_width - 40, y,
                available_width,
                font="Montserrat-Bold", size=11, color=colors.grey
            )
            
            # Add spacing between fields (only if not the last field)
            if i < len(details_fields) - 1:
                y -= 20

    page2_img = data.get("page2_image")
    if page2_img and os.path.exists(page2_img):
        # Optimize image before processing
        optimized_path = None
        try:
            with open(page2_img, "rb") as f:
                image_bytes = f.read()
            
            optimized_bytes = optimize_image_bytes(image_bytes, preset="section")
            
            # Create temporary file for optimized image
            optimized_path = os.path.join(BASE_DIR, f"page2_optimized_{uuid.uuid4().hex}.jpg")
            with open(optimized_path, "wb") as f:
                f.write(optimized_bytes)
            
            # Use optimized image
            page2_img = optimized_path
        except Exception:
            # Fallback to original if optimization fails
            pass
        
        try:
            img = ImageReader(page2_img)
            c.drawImage(img, 28, 380, 540, 340, mask="auto")
        finally:
            # Cleanup optimized temp file if created
            if optimized_path and optimized_path != data.get("page2_image") and os.path.exists(optimized_path):
                try:
                    os.remove(optimized_path)
                except Exception:
                    pass


def build_fixed_pages(data, output_path):
    # pageCompression helps reduce PDF size for streams; safe and should not affect rendering
    c = canvas.Canvas(output_path, pagesize=A4, pageCompression=1)
    build_cover_page(c, data)
    c.showPage()
    # For quotes, only build cover page (1 fixed page)
    # For proposals, build both cover and page2
    is_quote = data.get("is_quote", False)
    if not is_quote:
        build_page2(c, data)
        c.showPage()
    c.save()


