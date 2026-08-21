"""signing_order permutation validation for send-for-signature."""
import unittest
import uuid

from fastapi import HTTPException


class TestSigningOrderParse(unittest.TestCase):
    def test_omitted_keeps_catalog_order(self):
        from app.routes.document_signature_requests import _parse_signing_order

        a, b, c = str(uuid.uuid4()), str(uuid.uuid4()), str(uuid.uuid4())
        required = [a, b, c]
        self.assertEqual(_parse_signing_order({}, required), required)
        self.assertEqual(_parse_signing_order({"signing_order": []}, required), required)
        self.assertEqual(_parse_signing_order({"signing_order": None}, required), required)

    def test_valid_permutation(self):
        from app.routes.document_signature_requests import _parse_signing_order

        a, b, c = str(uuid.uuid4()), str(uuid.uuid4()), str(uuid.uuid4())
        required = [a, b, c]
        out = _parse_signing_order({"signing_order": [c, a, b]}, required)
        self.assertEqual(out, [c, a, b])

    def test_missing_id_raises(self):
        from app.routes.document_signature_requests import _parse_signing_order

        a, b = str(uuid.uuid4()), str(uuid.uuid4())
        with self.assertRaises(HTTPException) as ctx:
            _parse_signing_order({"signing_order": [a]}, [a, b])
        self.assertEqual(ctx.exception.status_code, 400)

    def test_extra_id_raises(self):
        from app.routes.document_signature_requests import _parse_signing_order

        a, b, extra = str(uuid.uuid4()), str(uuid.uuid4()), str(uuid.uuid4())
        with self.assertRaises(HTTPException) as ctx:
            _parse_signing_order({"signing_order": [a, b, extra]}, [a, b])
        self.assertEqual(ctx.exception.status_code, 400)

    def test_duplicate_raises(self):
        from app.routes.document_signature_requests import _parse_signing_order

        a, b = str(uuid.uuid4()), str(uuid.uuid4())
        with self.assertRaises(HTTPException) as ctx:
            _parse_signing_order({"signing_order": [a, a, b]}, [a, b])
        self.assertEqual(ctx.exception.status_code, 400)

    def test_not_a_list_raises(self):
        from app.routes.document_signature_requests import _parse_signing_order

        a = str(uuid.uuid4())
        with self.assertRaises(HTTPException) as ctx:
            _parse_signing_order({"signing_order": a}, [a])
        self.assertEqual(ctx.exception.status_code, 400)


if __name__ == "__main__":
    unittest.main()
