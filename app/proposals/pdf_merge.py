import os
import structlog
from PyPDF2 import PdfMerger
from .pdf_fixed import build_fixed_pages
from .pdf_dynamic import build_dynamic_pages
from .pdf_image_optimizer import get_optimization_stats

logger = structlog.get_logger(__name__)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))


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

    # Directly merge fixed (cover + page2) and dynamic pages. Each page already
    # draws its own background template, so no additional PDF overlay is needed.
    merge_pdfs(fixed_pdf, dynamic_pdf, output_path)

    # Log optimization statistics
    stats = get_optimization_stats()
    if stats["image_count"] > 0:
        total_reduction_pct = (
            ((stats["total_original_size"] - stats["total_optimized_size"]) / stats["total_original_size"] * 100)
            if stats["total_original_size"] > 0 else 0
        )
        logger.info(
            "PDF image optimization summary",
            image_count=stats["image_count"],
            total_original_size=stats["total_original_size"],
            total_optimized_size=stats["total_optimized_size"],
            total_reduction_pct=f"{total_reduction_pct:.1f}%",
            total_reduction_bytes=stats["total_original_size"] - stats["total_optimized_size"],
        )

    for f in [fixed_pdf, dynamic_pdf]:
        if os.path.exists(f):
            try:
                os.remove(f)
            except Exception:
                pass


