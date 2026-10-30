"""Thumbnail generation stays within a small RAM budget and caches on disk."""
import os
import io
import tempfile
import unittest
from pathlib import Path

from PIL import Image

from app.services import image_thumbnails as thumbs


class TestImageThumbnails(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self._orig_cache = thumbs.THUMB_CACHE_DIR
        self._orig_budget = thumbs.THUMB_CACHE_MAX_BYTES
        thumbs.THUMB_CACHE_DIR = Path(self.tmp.name)

    def tearDown(self):
        thumbs.THUMB_CACHE_DIR = self._orig_cache
        thumbs.THUMB_CACHE_MAX_BYTES = self._orig_budget
        self.tmp.cleanup()

    def _jpeg_bytes(self, size=(2400, 1800), color=(20, 90, 160)) -> bytes:
        im = Image.new("RGB", size, color)
        buf = io.BytesIO()
        im.save(buf, format="JPEG", quality=88)
        return buf.getvalue()

    def test_jpeg_thumbnail_is_narrow_and_smaller(self):
        src = self._jpeg_bytes()
        result = thumbs.render_thumbnail(src, 64)
        self.assertEqual(result.media_type, "image/jpeg")
        self.assertLess(len(result.content), len(src) // 4)
        out = Image.open(io.BytesIO(result.content))
        self.assertLessEqual(out.width, 64)
        self.assertGreater(out.width, 0)
        self.assertGreater(out.height, 0)

    def test_png_alpha_stays_png(self):
        im = Image.new("RGBA", (200, 120), (10, 20, 30, 0))
        buf = io.BytesIO()
        im.save(buf, format="PNG")
        result = thumbs.render_thumbnail(buf.getvalue(), 64)
        self.assertEqual(result.media_type, "image/png")
        out = Image.open(io.BytesIO(result.content))
        self.assertEqual(out.mode, "RGBA")
        self.assertLessEqual(out.width, 64)

    def test_cache_roundtrip(self):
        src = self._jpeg_bytes((800, 600))
        result = thumbs.render_thumbnail(src, 80)
        thumbs.cache_store("abc", 80, len(src), result)
        hit = thumbs.cache_lookup("abc", 80, len(src))
        self.assertIsNotNone(hit)
        self.assertEqual(hit.content, result.content)
        self.assertEqual(hit.media_type, result.media_type)
        self.assertIsNone(thumbs.cache_lookup("abc", 80, len(src) + 1))

    def test_clamp_width(self):
        self.assertEqual(thumbs.clamp_thumb_width(64), 64)
        self.assertEqual(thumbs.clamp_thumb_width(8), 32)
        self.assertEqual(thumbs.clamp_thumb_width(4000), thumbs.DISPLAY_THUMB_WIDTH)
        self.assertEqual(thumbs.clamp_thumb_width(None), 200)

    def test_cache_evicts_oldest_past_byte_budget(self):
        thumbs.THUMB_CACHE_MAX_BYTES = 500
        older = thumbs.ThumbnailResult(b"a" * 400, "image/jpeg")
        newer = thumbs.ThumbnailResult(b"b" * 400, "image/jpeg")
        thumbs.cache_store("old", 1600, 1, older)
        for path in Path(self.tmp.name).iterdir():
            os.utime(path, (1_000, 1_000))
        thumbs.cache_store("new", 1600, 1, newer)
        self.assertIsNone(thumbs.cache_lookup("old", 1600, 1))
        hit = thumbs.cache_lookup("new", 1600, 1)
        self.assertIsNotNone(hit)
        self.assertEqual(hit.content, newer.content)


if __name__ == "__main__":
    unittest.main()
