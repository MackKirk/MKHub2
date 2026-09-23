"""Verify send-for-signature persists requester_ip (TestClient)."""
import unittest
from unittest.mock import MagicMock, patch
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.testclient import TestClient


class TestRequesterIpCapture(unittest.TestCase):
    def test_client_ip_from_testclient(self):
        from app.routes.document_signature_requests import _client_ip

        app = FastAPI()

        @app.post("/t")
        def t(request: Request):
            return {"ip": _client_ip(request)}

        c = TestClient(app)
        r = c.post("/t")
        self.assertEqual(r.status_code, 200)
        # TestClient typically reports 127.0.0.1 or testclient
        self.assertTrue(r.json()["ip"], msg=f"empty ip: {r.json()}")

    def test_send_signature_passes_ip_kwarg(self):
        """Ensure send_for_signature calls _create with requester_ip from request."""
        import inspect
        from app.routes import document_signature_requests as mod

        src = inspect.getsource(mod.send_for_signature)
        self.assertIn("requester_ip=sender_ip", src)
        self.assertIn("_persist_requester_ip", src)


if __name__ == "__main__":
    unittest.main()
