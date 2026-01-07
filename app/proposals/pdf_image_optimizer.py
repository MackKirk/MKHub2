"""
Centralized image optimization module for PDF generation.
Optimizes images before embedding in PDFs to reduce file size significantly.
"""
import io
import structlog
from PIL import Image
try:
    from pillow_heif import register_heif_opener  # HEIC/HEIF support
    register_heif_opener()
except Exception:
    pass

from ..config import settings

logger = structlog.get_logger(__name__)

# Track optimization stats per PDF generation
_optimization_stats = {
    "total_original_size": 0,
    "total_optimized_size": 0,
    "image_count": 0,
}


def get_optimization_stats():
    """Get current optimization statistics and reset them."""
    stats = _optimization_stats.copy()
    # Reset stats
    _optimization_stats["total_original_size"] = 0
    _optimization_stats["total_optimized_size"] = 0
    _optimization_stats["image_count"] = 0
    return stats


def optimize_image_bytes(image_bytes: bytes, preset: str = "section") -> bytes:
    """
    Optimize image bytes for PDF embedding.
    
    Args:
        image_bytes: Original image bytes
        preset: Optimization preset ("cover", "section", or "thumb")
    
    Returns:
        Optimized image bytes as JPEG
    """
    # Check if optimization is enabled
    if not settings.pdf_image_optimize_enabled:
        return image_bytes
    
    if not image_bytes or len(image_bytes) == 0:
        logger.warning("Empty image bytes provided, returning as-is")
        return image_bytes
    
    original_size = len(image_bytes)
    
    try:
        # Open image from bytes
        img = Image.open(io.BytesIO(image_bytes))
        
        # Get preset configuration
        if preset == "cover":
            max_dim = settings.pdf_image_max_dim_cover
            quality = settings.pdf_image_jpeg_quality_cover
        elif preset == "thumb":
            max_dim = settings.pdf_image_max_dim_thumb
            quality = settings.pdf_image_jpeg_quality_thumb
        else:  # section (default)
            max_dim = settings.pdf_image_max_dim_section
            quality = settings.pdf_image_jpeg_quality_section
        
        # Convert to RGB (removes alpha channel if present)
        if img.mode in ("RGBA", "LA", "P"):
            # Create white background for transparent images
            rgb_img = Image.new("RGB", img.size, (255, 255, 255))
            if img.mode == "P":
                img = img.convert("RGBA")
            rgb_img.paste(img, mask=img.split()[-1] if img.mode in ("RGBA", "LA") else None)
            img = rgb_img
        elif img.mode != "RGB":
            img = img.convert("RGB")
        
        # Remove EXIF metadata by saving without it
        # PIL automatically strips EXIF when saving as JPEG
        
        # Resize proportionally (no upscaling)
        width, height = img.size
        max_dimension = max(width, height)
        
        if max_dimension > max_dim:
            # Calculate new dimensions maintaining aspect ratio
            if width > height:
                new_width = max_dim
                new_height = int((height * max_dim) / width)
            else:
                new_height = max_dim
                new_width = int((width * max_dim) / height)
            
            # Use high-quality resampling
            img = img.resize((new_width, new_height), Image.Resampling.LANCZOS)
        
        # Save as JPEG with specified quality
        output = io.BytesIO()
        # progressive + subsampling reduce size further with minimal visual impact for photos
        img.save(output, format="JPEG", quality=quality, optimize=True, progressive=True, subsampling=2)
        optimized_bytes = output.getvalue()
        optimized_size = len(optimized_bytes)
        
        # If we didn't actually reduce size, keep the original to avoid regressions
        if optimized_size >= original_size:
            logger.info(
                "Image optimization skipped (would not reduce size)",
                preset=preset,
                original_size=original_size,
                optimized_size=optimized_size,
                original_dimensions=f"{width}x{height}",
            )
            return image_bytes

        # Update stats (only when we actually keep optimized bytes)
        _optimization_stats["total_original_size"] += original_size
        _optimization_stats["total_optimized_size"] += optimized_size
        _optimization_stats["image_count"] += 1
        
        # Calculate reduction
        reduction_pct = ((original_size - optimized_size) / original_size * 100) if original_size > 0 else 0
        
        logger.info(
            "Image optimized",
            preset=preset,
            original_size=original_size,
            optimized_size=optimized_size,
            reduction_pct=f"{reduction_pct:.1f}%",
            original_dimensions=f"{width}x{height}",
            optimized_dimensions=f"{img.width}x{img.height}" if optimized_size < original_size else "unchanged",
        )
        
        return optimized_bytes
        
    except Exception as e:
        # Fallback to original image if optimization fails
        logger.warning(
            "Image optimization failed, using original",
            error=str(e),
            preset=preset,
            original_size=original_size,
        )
        return image_bytes


def optimize_image_file(input_path: str, output_path: str, preset: str = "section") -> bool:
    """
    Optimize an image file and save to output path.
    
    Args:
        input_path: Path to input image file
        output_path: Path to save optimized image
        preset: Optimization preset
    
    Returns:
        True if optimization succeeded, False otherwise
    """
    try:
        with open(input_path, "rb") as f:
            image_bytes = f.read()
        
        optimized_bytes = optimize_image_bytes(image_bytes, preset)
        
        with open(output_path, "wb") as f:
            f.write(optimized_bytes)
        
        return True
    except Exception as e:
        logger.warning("File optimization failed", error=str(e), input_path=input_path)
        return False

