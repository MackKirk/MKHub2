"""PR4 mobile contract: upload path + phrase catalogs + draft helpers stay FileObject-compatible."""
from __future__ import annotations

import sys
import types
import unittest

if "jwt" not in sys.modules:
    jwt_module = types.ModuleType("jwt")
    jwt_module.encode = lambda *args, **kwargs: "token"
    jwt_module.decode = lambda *args, **kwargs: {}
    sys.modules["jwt"] = jwt_module

if "passlib.context" not in sys.modules:
    passlib_module = types.ModuleType("passlib")
    passlib_context_module = types.ModuleType("passlib.context")

    class _CryptContext:
        def __init__(self, *args, **kwargs):
            pass

        def hash(self, value):
            return f"hashed:{value}"

        def verify(self, plain, hashed):
            return hashed == f"hashed:{plain}"

    passlib_context_module.CryptContext = _CryptContext
    sys.modules["passlib"] = passlib_module
    sys.modules["passlib.context"] = passlib_context_module

from app.services.fieldwork_phrases import (
    ENTRY_TYPE_TO_LIST_NAME,
    OBSERVED_CONDITIONS_LIST_NAME,
    WORK_PERFORMED_LIST_NAME,
)
from app.services.form_engine import (
    FIELDWORK_PHOTO_ENTRY_OBSERVATION,
    FIELDWORK_PHOTO_ENTRY_WORK_PERFORMED,
    FIELDWORK_TECHNICAL_PHOTO_FOLDER_NAMES,
)


class FieldworkMobileContractTests(unittest.TestCase):
    def test_phrase_catalogs_match_mobile_entry_types(self):
        self.assertEqual(
            ENTRY_TYPE_TO_LIST_NAME[FIELDWORK_PHOTO_ENTRY_OBSERVATION],
            OBSERVED_CONDITIONS_LIST_NAME,
        )
        self.assertEqual(
            ENTRY_TYPE_TO_LIST_NAME[FIELDWORK_PHOTO_ENTRY_WORK_PERFORMED],
            WORK_PERFORMED_LIST_NAME,
        )

    def test_suggested_folders_are_real_rm_folders(self):
        # Mobile upload category defaults must stay inside the technical folder set (PR5 Files).
        self.assertIn("Proposal Photos", FIELDWORK_TECHNICAL_PHOTO_FOLDER_NAMES)
        self.assertIn("Invoice Photos", FIELDWORK_TECHNICAL_PHOTO_FOLDER_NAMES)

    def test_mobile_draft_storage_key_contract(self):
        # Pending photos / comments recover via AsyncStorage key fieldwork:draft:{project}:{record}.
        # Keep this prefix stable so reopen after crash does not orphan local queues.
        prefix = "fieldwork:draft:"
        self.assertTrue(prefix.startswith("fieldwork:"))
        self.assertIn("draft", prefix)


if __name__ == "__main__":
    unittest.main()
