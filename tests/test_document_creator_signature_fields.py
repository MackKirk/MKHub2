"""Document builder signature field extraction + token safety."""
import sys
import types
import unittest
import uuid


if "jwt" not in sys.modules:
    jwt_module = types.ModuleType("jwt")
    jwt_module.encode = lambda *args, **kwargs: "token"
    jwt_module.decode = lambda *args, **kwargs: {}
    sys.modules["jwt"] = jwt_module

if "httpx" not in sys.modules:
    try:
        import httpx  # noqa: F401
    except ImportError:
        sys.modules["httpx"] = types.ModuleType("httpx")

# Only stub Azure if the real SDK is missing (pdf_builder imports BlobStorageProvider).
try:
    from azure.storage.blob import BlobServiceClient, generate_blob_sas, BlobSasPermissions  # noqa: F401
except ImportError:
    azure = types.ModuleType("azure")
    azure_storage = types.ModuleType("azure.storage")
    azure_blob = types.ModuleType("azure.storage.blob")

    class _BlobDummy:
        @classmethod
        def from_connection_string(cls, *a, **k):
            return cls()

    azure_blob.BlobServiceClient = _BlobDummy
    azure_blob.ContentSettings = _BlobDummy
    azure_blob.BlobSasPermissions = _BlobDummy
    azure_blob.generate_blob_sas = lambda *a, **k: ""
    sys.modules["azure"] = azure
    sys.modules["azure.storage"] = azure_storage
    sys.modules["azure.storage.blob"] = azure_blob

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

if "structlog" not in sys.modules:
    try:
        import structlog  # noqa: F401
    except ImportError:
        structlog_module = types.ModuleType("structlog")

        class _Logger:
            def bind(self, **kwargs):
                return self

            def info(self, *a, **k):
                pass

            def warning(self, *a, **k):
                pass

            def error(self, *a, **k):
                pass

            def debug(self, *a, **k):
                pass

            def exception(self, *a, **k):
                pass

        structlog_module.get_logger = lambda *a, **k: _Logger()
        sys.modules["structlog"] = structlog_module


class TestDocumentCreatorSignatureFields(unittest.TestCase):
    def test_token_replace_skips_signature_atom_runs(self):
        from app.routes.document_creator import _substitute_project_tokens

        atom_id = str(uuid.uuid4())
        elements = [
            {
                "type": "text",
                "content": "Hello <Employee Name>\ufffc",
                "richLines": [
                    [
                        {"text": "Hello <Employee Name>"},
                        {
                            "text": "\ufffc",
                            "kind": "signature",
                            "atomId": atom_id,
                            "atomWidthPx": 150,
                            "atomHeightPx": 48,
                        },
                    ]
                ],
            }
        ]
        _substitute_project_tokens(elements, {"employee_name": "Ada Lovelace"})
        self.assertEqual(elements[0]["content"], "Hello Ada Lovelace\ufffc")
        self.assertEqual(elements[0]["richLines"][0][0]["text"], "Hello Ada Lovelace")
        self.assertEqual(elements[0]["richLines"][0][1]["text"], "\ufffc")
        self.assertEqual(elements[0]["richLines"][0][1]["kind"], "signature")
        self.assertEqual(elements[0]["richLines"][0][1]["atomId"], atom_id)

    def test_pct_box_to_pdf_rect(self):
        from app.document_creator.signature_fields import pct_box_to_pdf_rect

        # Full page box
        r = pct_box_to_pdf_rect(0, 0, 100, 100, 595.28, 841.89)
        self.assertAlmostEqual(r["x"], 0.0, places=2)
        self.assertAlmostEqual(r["y"], 0.0, places=2)
        self.assertAlmostEqual(r["width"], 595.28, places=2)
        self.assertAlmostEqual(r["height"], 841.89, places=2)

        # Bottom-right-ish initials default ~78,92,14,4.5
        r2 = pct_box_to_pdf_rect(78, 92, 14, 4.5, 595.28, 841.89)
        self.assertGreater(r2["x"], 400)
        self.assertLess(r2["y"], 50)
        self.assertGreater(r2["width"], 50)
        self.assertGreater(r2["height"], 20)

    def test_extract_initials_and_inline_signature(self):
        from app.document_creator.signature_fields import extract_signature_fields_from_pages

        atom_id = str(uuid.uuid4())
        init_id = str(uuid.uuid4())
        pages = [
            {
                "template_id": None,
                "elements": [
                    {
                        "id": init_id,
                        "type": "initials",
                        "content": "",
                        "x_pct": 78,
                        "y_pct": 92,
                        "width_pct": 14,
                        "height_pct": 4.5,
                        "assignee": "employee",
                        "required": True,
                    },
                    {
                        "id": str(uuid.uuid4()),
                        "type": "text",
                        "content": "Sign here:\ufffc",
                        "x_pct": 10,
                        "y_pct": 20,
                        "width_pct": 80,
                        "height_pct": 15,
                        "fontSize": 12,
                        "fontFamily": "Montserrat",
                        "richLines": [
                            [
                                {"text": "Sign here:"},
                                {
                                    "text": "\ufffc",
                                    "kind": "signature",
                                    "atomId": atom_id,
                                    "atomWidthPx": 150,
                                    "atomHeightPx": 48,
                                    "assignee": "employee",
                                    "required": True,
                                },
                            ]
                        ],
                    },
                ],
            }
        ]
        fields, sizes = extract_signature_fields_from_pages(pages)
        self.assertEqual(len(sizes), 1)
        types = {f["type"] for f in fields}
        self.assertIn("initials", types)
        self.assertIn("signature", types)
        sig = next(f for f in fields if f["type"] == "signature")
        self.assertEqual(sig["id"], atom_id)
        self.assertGreater(sig["rect"]["width"], 0)
        self.assertGreater(sig["rect"]["height"], 0)
        init = next(f for f in fields if f["type"] == "initials")
        self.assertEqual(init["id"], init_id)

    def test_extract_inline_date_atom(self):
        from app.document_creator.signature_fields import extract_signature_fields_from_pages

        atom_id = str(uuid.uuid4())
        pages = [
            {
                "elements": [
                    {
                        "type": "text",
                        "content": "Signed on:\ufffc",
                        "x_pct": 10,
                        "y_pct": 20,
                        "width_pct": 80,
                        "height_pct": 15,
                        "fontSize": 12,
                        "fontFamily": "Montserrat",
                        "richLines": [
                            [
                                {"text": "Signed on:"},
                                {
                                    "text": "\ufffc",
                                    "kind": "date",
                                    "atomId": atom_id,
                                    "atomWidthPx": 140,
                                    "atomHeightPx": 32,
                                    "assignee": "employee",
                                    "required": True,
                                },
                            ]
                        ],
                    }
                ]
            }
        ]
        fields, _ = extract_signature_fields_from_pages(pages)
        self.assertEqual(len(fields), 1)
        self.assertEqual(fields[0]["type"], "date")
        self.assertEqual(fields[0]["id"], atom_id)

    def test_extract_date_field(self):
        from app.document_creator.signature_fields import extract_signature_fields_from_pages

        date_id = str(uuid.uuid4())
        pages = [
            {
                "elements": [
                    {
                        "id": date_id,
                        "type": "date",
                        "content": "",
                        "x_pct": 60,
                        "y_pct": 92,
                        "width_pct": 16,
                        "height_pct": 4.5,
                        "assignee": "employee",
                        "required": True,
                    }
                ]
            }
        ]
        fields, _ = extract_signature_fields_from_pages(pages)
        self.assertEqual(len(fields), 1)
        self.assertEqual(fields[0]["type"], "date")
        self.assertEqual(fields[0]["id"], date_id)
        self.assertGreater(fields[0]["rect"]["width"], 0)

    def test_inline_signature_rect_centered_in_line(self):
        """Tall chips are vertically centered in the line box (vertical-align:middle)."""
        from app.document_creator.signature_fields import extract_signature_fields_from_pages
        from reportlab.lib.pagesizes import A4

        atom_id = str(uuid.uuid4())
        pages = [
            {
                "elements": [
                    {
                        "type": "text",
                        "content": "Sign here:\ufffc",
                        "x_pct": 10,
                        "y_pct": 20,
                        "width_pct": 80,
                        "height_pct": 20,
                        "fontSize": 12,
                        "fontFamily": "Montserrat",
                        "richLines": [
                            [
                                {"text": "Sign here:"},
                                {
                                    "text": "\ufffc",
                                    "kind": "signature",
                                    "atomId": atom_id,
                                    "atomWidthPx": 150,
                                    "atomHeightPx": 48,
                                },
                            ]
                        ],
                    }
                ]
            }
        ]
        fields, _ = extract_signature_fields_from_pages(pages)
        sig = next(f for f in fields if f["id"] == atom_id)
        page_h = float(A4[1])
        box_top = page_h * (1.0 - 0.20)
        pad = 4.0 * (float(A4[0]) / 910.0)
        line_top = box_top - pad
        h = sig["rect"]["height"]
        atom_mid = sig["rect"]["y"] + h / 2.0
        # With a single tall chip, leading ≈ h → mid ≈ line_top - leading/2 ≈ line_top - h/2
        expected_mid = line_top - h / 2.0
        self.assertAlmostEqual(atom_mid, expected_mid, delta=2.0)

    def test_long_name_moves_signature_rect_down(self):
        from app.document_creator.signature_fields import extract_signature_fields_from_pages

        def pages_with_name(name: str):
            atom_id = str(uuid.uuid4())
            return [
                {
                    "elements": [
                        {
                            "type": "text",
                            "content": f"{name}\n\nLorem ipsum dolor sit amet.\ufffc",
                            "x_pct": 10,
                            "y_pct": 10,
                            "width_pct": 80,
                            "height_pct": 50,
                            "fontSize": 12,
                            "fontFamily": "Montserrat",
                            "richLines": [
                                [{"text": name}],
                                [{"text": ""}],
                                [
                                    {"text": "Lorem ipsum dolor sit amet."},
                                    {
                                        "text": "\ufffc",
                                        "kind": "signature",
                                        "atomId": atom_id,
                                        "atomWidthPx": 150,
                                        "atomHeightPx": 48,
                                    },
                                ],
                            ],
                        }
                    ]
                }
            ]

        short_fields, _ = extract_signature_fields_from_pages(pages_with_name("Jo"))
        long_name = "testando um nome muito longo pra ver se quebra " * 8
        long_fields, _ = extract_signature_fields_from_pages(pages_with_name(long_name))
        short_sig = next(f for f in short_fields if f["type"] == "signature")
        long_sig = next(f for f in long_fields if f["type"] == "signature")
        # PDF y grows upward; lower on the page ⇒ smaller y.
        self.assertLess(long_sig["rect"]["y"], short_sig["rect"]["y"])

    def test_extract_signature_when_content_lost_fffc(self):
        """Editor can drop U+FFFC from content while richLines still hold the chip."""
        from app.document_creator.signature_fields import extract_signature_fields_from_pages

        atom_id = str(uuid.uuid4())
        pages = [
            {
                "elements": [
                    {
                        "type": "text",
                        "content": "Sign here:",
                        "x_pct": 10,
                        "y_pct": 20,
                        "width_pct": 80,
                        "height_pct": 15,
                        "fontSize": 12,
                        "fontFamily": "Montserrat",
                        "richLines": [
                            [
                                {"text": "Sign here:"},
                                {
                                    "text": "\ufffc",
                                    "kind": "signature",
                                    "atomId": atom_id,
                                    "atomWidthPx": 150,
                                    "atomHeightPx": 48,
                                    "assignee": "employee",
                                    "required": True,
                                },
                            ]
                        ],
                    }
                ]
            }
        ]
        fields, _ = extract_signature_fields_from_pages(pages)
        sigs = [f for f in fields if f["type"] == "signature"]
        self.assertEqual(len(sigs), 1)
        self.assertEqual(sigs[0]["id"], atom_id)

    def test_extract_signature_from_plain_fffc_without_rich_metadata(self):
        """Content has U+FFFC but richLines lost kind/atomId — repair should recover."""
        from app.document_creator.signature_fields import extract_signature_fields_from_pages

        pages = [
            {
                "elements": [
                    {
                        "type": "text",
                        "content": "Sign here:\ufffc",
                        "x_pct": 10,
                        "y_pct": 20,
                        "width_pct": 80,
                        "height_pct": 15,
                        "fontSize": 12,
                        "fontFamily": "Montserrat",
                        "richLines": [[{"text": "Sign here:\ufffc"}]],
                    }
                ]
            }
        ]
        fields, _ = extract_signature_fields_from_pages(pages)
        self.assertEqual(len([f for f in fields if f["type"] == "signature"]), 1)


if __name__ == "__main__":
    unittest.main()
