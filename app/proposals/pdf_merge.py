import os
from PyPDF2 import PdfMerger, PdfReader, PdfWriter
from .pdf_fixed import build_fixed_pages
from .pdf_dynamic import build_dynamic_pages
import copy


BASE_DIR = os.path.dirname(os.path.abspath(__file__))


def apply_templates(content_pdf: str, output_pdf: str, cover_template: str, page_template: str) -> None:
    reader_content = PdfReader(content_pdf)
    reader_cover = PdfReader(cover_template)
    reader_page = PdfReader(page_template)
    writer = PdfWriter()

    for i, page in enumerate(reader_content.pages):
        if i == 0:
            template_page = reader_cover.pages[0]
        else:
            template_page = reader_page.pages[0]

        merged = copy.deepcopy(template_page)
        # Merge content onto template (template is base, content overlays)
        # This ensures template footer is preserved
        merged.merge_page(page)
        writer.add_page(merged)

    with open(output_pdf, "wb") as f:
        writer.write(f)


def merge_pdfs(fixed_pdf: str, dynamic_pdf: str, output_pdf: str) -> None:
    merger = PdfMerger()
    merger.append(fixed_pdf)
    merger.append(dynamic_pdf)
    merger.write(output_pdf)
    merger.close()


async def generate_pdf(data: dict, output_path: str) -> None:
    fixed_pdf = os.path.join(BASE_DIR, "tmp_fixed.pdf")
    dynamic_pdf = os.path.join(BASE_DIR, "tmp_dynamic.pdf")

    build_fixed_pages(data, fixed_pdf)
    build_dynamic_pages(data, dynamic_pdf)

    merged_pdf = os.path.join(BASE_DIR, "tmp_merged.pdf")
    merger = PdfMerger()
    merger.append(fixed_pdf)
    merger.append(dynamic_pdf)
    merger.write(merged_pdf)
    merger.close()

    cover_template = os.path.join(BASE_DIR, "assets", "templates", "cover_template.pdf")
    page_template = os.path.join(BASE_DIR, "assets", "templates", "page_template.pdf")
    apply_templates(merged_pdf, output_path, cover_template, page_template)

    for f in [fixed_pdf, dynamic_pdf, merged_pdf]:
        if os.path.exists(f):
            try:
                os.remove(f)
            except Exception:
                pass


