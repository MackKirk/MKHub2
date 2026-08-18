"""Image-section captions wrap to three PDF lines."""
import unittest

from app.proposals.pdf_dynamic import CAPTION_MAX_LINES, caption_text_for_pdf


class TestProposalImageCaption(unittest.TestCase):
    def test_short_caption_is_unchanged(self):
        self.assertEqual(caption_text_for_pdf("Replace damaged flashing"), "Replace damaged flashing")

    def test_long_caption_keeps_three_lines(self):
        text = (
            "Remove and replace deteriorated metal flashing at the north wall, "
            "reseal all penetrations, and install new drip edge along the eaves "
            "after the existing membrane is prepared and primed for overlay."
        )
        rendered = caption_text_for_pdf(text)
        self.assertGreaterEqual(rendered.count("<br/>"), 2)
        self.assertEqual(rendered.count("<br/>") + 1, CAPTION_MAX_LINES)
        self.assertTrue(len(rendered.replace("<br/>", " ")) > 90)

    def test_empty_caption(self):
        self.assertEqual(caption_text_for_pdf(""), "")
        self.assertEqual(caption_text_for_pdf("   "), "")
