"""Display copies are stored once and reused without the original."""
import io
import tempfile
import unittest
from pathlib import Path

from PIL import Image

from app.services import document_display_image as display
from app.services import image_thumbnails as thumbs
from app.storage.local_provider import LocalStorageProvider


class TestDocumentDisplayImage(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self._orig_cache = thumbs.THUMB_CACHE_DIR
        thumbs.THUMB_CACHE_DIR = Path(self.tmp.name) / "cache"
        self.storage = LocalStorageProvider(base_dir=str(Path(self.tmp.name) / "storage"))

    def tearDown(self):
        thumbs.THUMB_CACHE_DIR = self._orig_cache
        self.tmp.cleanup()

    def _put_original(self, key: str) -> None:
        image = Image.new("RGB", (2400, 1600), (30, 80, 140))
        buf = io.BytesIO()
        image.save(buf, format="JPEG", quality=85)
        self.storage.copy_in(io.BytesIO(buf.getvalue()), key)

    def test_display_copy_is_stored_once_and_survives_without_original(self):
        source_key = "org/2026/misc/files/photo.jpg"
        self._put_original(source_key)
        first = display.ensure_display_copy(
            self.storage,
            file_id="file-1",
            source_key=source_key,
            size_bytes=10,
            content_type="image/jpeg",
        )
        stored_key = display.display_object_key("file-1", first.media_type)
        self.assertTrue(self.storage.exists(stored_key))
        self.storage.delete(source_key)
        for cached in thumbs.THUMB_CACHE_DIR.iterdir():
            cached.unlink()

        second = display.ensure_display_copy(
            self.storage,
            file_id="file-1",
            source_key=source_key,
            size_bytes=10,
            content_type="image/jpeg",
        )
        self.assertEqual(second.content, first.content)
        opened = Image.open(io.BytesIO(second.content))
        self.assertLessEqual(opened.width, thumbs.DISPLAY_THUMB_WIDTH)

    def test_delete_display_copies_removes_the_derivative(self):
        source_key = "org/2026/misc/files/photo.jpg"
        self._put_original(source_key)
        display.ensure_display_copy(
            self.storage,
            file_id="file-2",
            source_key=source_key,
            size_bytes=10,
            content_type="image/jpeg",
        )
        display.delete_display_copies(self.storage, "file-2")
        self.assertFalse(self.storage.exists(display.display_object_key("file-2", "image/jpeg")))
        self.assertFalse(self.storage.exists(display.display_object_key("file-2", "image/png")))
