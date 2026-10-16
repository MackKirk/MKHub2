"""Invoice PDF lines are suggested against the catalog, not inserted."""
import unittest

from app.services.invoice_product_match import (
    ParsedInvoiceLine,
    apply_labeled_quantities,
    match_invoice_pdf,
    match_invoice_text,
    parse_invoice_lines,
    parse_model_items,
    parse_positioned_rows,
)


class _Material:
    def __init__(self, id, name, supplier_name, unit="bundle", price=0):
        self.id = id
        self.name = name
        self.supplier_name = supplier_name
        self.unit = unit
        self.price = price
        self.unit_type = "package"
        self.units_per_package = 1
        self.coverage_sqs = None
        self.coverage_ft2 = None
        self.coverage_m2 = None


def _pdf(text: str) -> bytes:
    import fitz

    doc = fitz.open()
    page = doc.new_page()
    page.insert_textbox(fitz.Rect(50, 50, 560, 780), text, fontsize=11)
    data = doc.tobytes()
    doc.close()
    return data


CATALOG = [
    _Material(1, "GAF Timberline HDZ Charcoal", "ABC Supply", price=48),
    _Material(2, "GAF Timberline HDZ Weathered Wood", "ABC Supply", price=49),
    _Material(3, "Owens Corning Duration Shingles", "Beacon", price=30),
]

INVOICE = """ABC Supply
2  GAF Timberline HDZ Charcoal  45.00  90.00
1  Timberline HDZ  40.00  40.00
3  Mystery Widget 9000  10.00  10.00
GST  12.00
"""


class InvoiceProductMatchTests(unittest.TestCase):
    def test_fallback_keeps_catalog_matches_and_drops_unknown_lines(self):
        result = match_invoice_pdf(_pdf(INVOICE), CATALOG, api_key="")
        self.assertTrue(result["readable"])
        self.assertEqual(result["found_count"], 1)
        self.assertEqual(len(result["products"]), 1)
        product = result["products"][0]
        self.assertEqual(product["id"], 1)
        self.assertEqual(product["name"], "GAF Timberline HDZ Charcoal")
        self.assertEqual(product["quantity"], 1)
        self.assertEqual(product["invoice_description"], "GAF Timberline HDZ Charcoal")
        self.assertIn(2, [row["id"] for row in product["similar"]])
        self.assertEqual(product["price"], 48.0)
        self.assertNotIn("image_base64", product)

    def test_similar_list_includes_the_whole_product_family(self):
        catalog = [
            _Material(1, "Paradiene 20 EG SA", "Siplast", price=175.10),
            _Material(2, "Paradiene 20 TS SA", "Siplast", price=118.80),
            _Material(3, "Paradiene 20 HT", "Siplast", price=166.65),
            _Material(4, "Paradiene 20 TG", "Siplast", price=88.75),
            _Material(5, "Paradiene 20", "Siplast", price=107.55),
            _Material(6, "Probase SA", "Siplast", price=168),
        ]
        text = "1 PARADIENE 20EG SA 100SF 175.10 175.10\n" + ("note " * 12)
        result = match_invoice_text(text, catalog)
        self.assertEqual(result["products"][0]["id"], 1)
        self.assertEqual([row["id"] for row in result["products"][0]["similar"]], [2, 5, 3, 4])

    def test_model_lines_return_deduped_catalog_products_only(self):
        def fake_extract(_text):
            return [
                ParsedInvoiceLine("GAF Timberline HDZ Charcoal", 2, 45),
                ParsedInvoiceLine("Owens Corning Duration Shingles", 5, 30),
                ParsedInvoiceLine("Owens Corning Duration Shingles", 9, 30),
                ParsedInvoiceLine("Mystery Widget 9000", 1, 10),
                ParsedInvoiceLine("GST", 1, 12),
            ]

        result = match_invoice_pdf(
            _pdf(INVOICE),
            CATALOG,
            api_key="sk-test",
            extract_lines=fake_extract,
        )
        self.assertEqual(result["found_count"], 2)
        self.assertEqual([product["id"] for product in result["products"]], [1, 3])
        self.assertEqual(result["products"][0]["quantity"], 1)
        self.assertEqual(result["products"][1]["quantity"], 1)

    def test_missing_api_key_does_not_call_the_model(self):
        called = []

        def fake_extract(_text):
            called.append(True)
            return []

        result = match_invoice_pdf(_pdf(INVOICE), CATALOG, api_key="", extract_lines=fake_extract)
        self.assertEqual(called, [])
        self.assertEqual([product["id"] for product in result["products"]], [1])

    def test_model_json_drops_tax_lines(self):
        lines = parse_model_items(
            '{"items":[{"description":"PROBASE SA","quantity":7,"unit_price":168.4},'
            '{"description":"BCPST","quantity":1,"unit_price":385.44},'
            '{"description":"CARTAGE-EXT. F/DECK","quantity":1,"unit_price":175}]}'
        )
        self.assertEqual([line.description for line in lines], ["PROBASE SA"])

    def test_tax_line_is_not_a_product(self):
        lines = parse_invoice_lines(INVOICE)
        self.assertFalse(any("GST" in line.description for line in lines))

    def test_unreadable_pdf_has_no_products(self):
        result = match_invoice_pdf(_pdf(""), CATALOG, api_key="")
        self.assertFalse(result["readable"])
        self.assertEqual(result["found_count"], 0)
        self.assertEqual(result["products"], [])

    def test_column_invoice_keeps_products_and_drops_tax(self):
        words = [
            (57, 307, 64, 316, "7"),
            (68, 307, 90, 316, "ROLL"),
            (94, 307, 130, 316, "920660"),
            (195, 307, 250, 316, "PROBASE"),
            (238, 307, 260, 316, "SA"),
            (423, 307, 432, 316, "Y"),
            (447, 307, 490, 316, "168.4000"),
            (492, 307, 520, 316, "ROLL"),
            (539, 307, 580, 316, "1,178.80"),
            (57, 451, 64, 460, "1"),
            (68, 451, 90, 460, "EACH"),
            (94, 451, 130, 460, "98003"),
            (195, 451, 260, 460, "CARTAGE-EXT."),
            (410, 618, 450, 628, "BCPST"),
            (442, 618, 480, 628, "385.44"),
            (421, 628, 450, 638, "GST"),
            (442, 628, 480, 638, "275.32"),
        ]
        lines = parse_positioned_rows(words)
        self.assertEqual([line.description for line in lines], ["PROBASE SA"])
        self.assertIsNone(lines[0].quantity)
        self.assertEqual(lines[0].invoice_unit_price, 168.4)

        result = match_invoice_pdf(_column_pdf(), CATALOG, api_key="")
        names = [product["name"] for product in result["products"]]
        self.assertEqual(names, [])
        self.assertTrue(result["readable"])
        self.assertEqual(result["found_count"], 0)

    def test_quantity_is_taken_only_from_a_qty_column(self):
        words = [
            (40, 280, 90, 290, "PRODUCT"),
            (200, 280, 280, 290, "DESCRIPTION"),
            (360, 280, 390, 290, "QTY"),
            (400, 280, 460, 290, "SHIPPED"),
            (500, 280, 560, 290, "PRICE"),
            (40, 307, 90, 317, "37722"),
            (200, 307, 280, 317, "ELASTOCOL"),
            (290, 307, 340, 317, "STICK"),
            (350, 307, 400, 317, "SPRAY"),
            (370, 307, 400, 317, "4.00"),
            (510, 307, 560, 317, "22.35"),
        ]
        lines = apply_labeled_quantities(
            [ParsedInvoiceLine("ELASTOCOL STICK SPRAY", 37722, 22.35)],
            words,
        )
        self.assertEqual(lines[0].quantity, 4.0)

        without_header = [word for word in words if word[1] != 280]
        unlabeled = apply_labeled_quantities(
            [ParsedInvoiceLine("ELASTOCOL STICK SPRAY", 37722, 22.35)],
            without_header,
        )
        self.assertIsNone(unlabeled[0].quantity)


def _column_pdf() -> bytes:
    import fitz

    doc = fitz.open()
    page = doc.new_page()

    def put(x, y, text):
        page.insert_text((x, y), text, fontsize=9)

    put(57, 320, "7")
    put(78, 320, "ROLL")
    put(120, 320, "920660")
    put(180, 320, "PROBASE SA")
    put(340, 320, "Y")
    put(370, 320, "168.4000")
    put(430, 320, "ROLL")
    put(480, 320, "1,178.80")
    put(57, 360, "1")
    put(78, 360, "EACH")
    put(120, 360, "98003")
    put(180, 360, "CARTAGE-EXT. F/DECK")
    put(370, 360, "175.0000")
    put(480, 360, "175.00")
    put(300, 420, "BCPST")
    put(360, 420, "385.44")
    put(300, 440, "GST")
    put(360, 440, "275.32")
    data = doc.tobytes()
    doc.close()
    return data


if __name__ == "__main__":
    unittest.main()
