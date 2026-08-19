"""Memory-safe image thumbnails with a local disk cache.

Phone JPEGs (often 12–48MP, including Samsung Multi-Picture / MPF files) must not be
fully decoded for every gallery request. Render starter instances have ~512MB RAM;
the default FastAPI thread pool can run dozens of sync thumbnail handlers at once.
"""
from __future__ import annotations

import io
import logging
import os
import threading
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from PIL import Image, ImageFile, ImageOps

try:
    from pillow_heif import register_heif_opener

    register_heif_opener()
except Exception:
    pass

logger = logging.getLogger(__name__)

ImageFile.LOAD_TRUNCATED_IMAGES = True
# ~40MP: reject pathological files; real phone photos still go through JPEG draft().
Image.MAX_IMAGE_PIXELS = 40_000_000

THUMB_CACHE_DIR = Path(os.getenv("THUMBNAIL_CACHE_DIR", "var/cache/thumbnails"))
THUMB_CONCURRENCY = max(1, int(os.getenv("THUMBNAIL_CONCURRENCY", "2")))
_thumb_sema = threading.BoundedSemaphore(THUMB_CONCURRENCY)

_JPEG_FORMATS = {"JPEG", "MPO", "JFIF"}


@dataclass(frozen=True)
class ThumbnailResult:
    content: bytes
    media_type: str


def clamp_thumb_width(w: Optional[int]) -> int:
    return max(32, min(1024, int(w or 200)))


def _cache_stem(file_id: str, width: int, size_bytes: Optional[int]) -> str:
    return f"{file_id}_w{width}_{int(size_bytes or 0)}"


def cache_lookup(file_id: str, width: int, size_bytes: Optional[int]) -> Optional[ThumbnailResult]:
    stem = _cache_stem(file_id, width, size_bytes)
    jpeg_path = THUMB_CACHE_DIR / f"{stem}.jpg"
    png_path = THUMB_CACHE_DIR / f"{stem}.png"
    try:
        if jpeg_path.is_file():
            return ThumbnailResult(jpeg_path.read_bytes(), "image/jpeg")
        if png_path.is_file():
            return ThumbnailResult(png_path.read_bytes(), "image/png")
    except OSError:
        return None
    return None


def cache_store(file_id: str, width: int, size_bytes: Optional[int], result: ThumbnailResult) -> None:
    try:
        THUMB_CACHE_DIR.mkdir(parents=True, exist_ok=True)
        ext = "png" if result.media_type == "image/png" else "jpg"
        path = THUMB_CACHE_DIR / f"{_cache_stem(file_id, width, size_bytes)}.{ext}"
        path.write_bytes(result.content)
        _evict_cache_if_needed()
    except OSError as e:
        logger.warning("thumbnail cache write failed: %s", e)


def _evict_cache_if_needed(max_files: int = 2000) -> None:
    try:
        files = [p for p in THUMB_CACHE_DIR.iterdir() if p.is_file()]
    except OSError:
        return
    overflow = len(files) - max_files
    if overflow <= 0:
        return
    files.sort(key=lambda p: p.stat().st_mtime)
    for p in files[: overflow + 100]:
        try:
            p.unlink()
        except OSError:
            pass


def thumbnail_slot():
    """Limit concurrent full thumbnail renders so the process cannot OOM."""
    return _thumb_sema


def _open_image(
    image_bytes: bytes,
    original_name: str = "",
    content_type: str = "",
) -> Image.Image:
    buf = io.BytesIO(image_bytes)
    try:
        return Image.open(buf)
    except Exception as open_err:
        name = (original_name or "").lower()
        ctype = (content_type or "").lower()
        maybe_heic = (
            name.endswith((".heic", ".heif"))
            or "heic" in ctype
            or "heif" in ctype
            or "cannot identify image file" in str(open_err).lower()
        )
        if not maybe_heic:
            raise
        try:
            from pillow_heif import register_heif_opener

            register_heif_opener()
            buf.seek(0)
            return Image.open(buf)
        except Exception:
            return _open_heic_via_cli(image_bytes)


def _open_heic_via_cli(image_bytes: bytes) -> Image.Image:
    import subprocess
    import tempfile

    with tempfile.TemporaryDirectory() as td:
        src_path = os.path.join(td, "in.heic")
        dst_path = os.path.join(td, "out.jpg")
        with open(src_path, "wb") as fsrc:
            fsrc.write(image_bytes)
        subprocess.run(["heif-convert", "-q", "90", src_path, dst_path], check=True, timeout=30)
        with open(dst_path, "rb") as fdst:
            jpeg_bytes = fdst.read()
    return Image.open(io.BytesIO(jpeg_bytes))


def _has_alpha(im: Image.Image) -> bool:
    if im.mode in ("RGBA", "LA"):
        return True
    if im.mode == "P" and "transparency" in im.info:
        return True
    return False


def render_thumbnail(
    image_bytes: bytes,
    target_w: int,
    original_name: str = "",
    content_type: str = "",
) -> ThumbnailResult:
    """Decode at reduced resolution when possible, then emit a small JPEG or PNG."""
    if not image_bytes:
        raise ValueError("Downloaded file is empty")

    im = _open_image(image_bytes, original_name=original_name, content_type=content_type)
    try:
        fmt = (im.format or "").upper()
        if fmt in _JPEG_FORMATS:
            try:
                # libjpeg IDCT scale (1/2, 1/4, 1/8) — avoids allocating the full RGB bitmap.
                im.draft("RGB", (target_w * 2, target_w * 2))
            except Exception:
                pass
        try:
            transposed = ImageOps.exif_transpose(im)
            if transposed is not None:
                im = transposed
        except Exception:
            pass

        keep_png = _has_alpha(im)
        if keep_png:
            if im.mode != "RGBA":
                im = im.convert("RGBA")
        elif im.mode != "RGB":
            im = im.convert("RGB")

        if im.width > target_w:
            im.thumbnail((target_w, 8192), Image.Resampling.LANCZOS)

        out = io.BytesIO()
        if keep_png:
            im.save(out, format="PNG", optimize=True)
            return ThumbnailResult(out.getvalue(), "image/png")
        im.save(out, format="JPEG", quality=80, optimize=False)
        return ThumbnailResult(out.getvalue(), "image/jpeg")
    finally:
        im.close()
