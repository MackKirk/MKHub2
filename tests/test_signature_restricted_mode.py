"""Restricted mode enforcement boundary tests."""
import sys
import types
import unittest
import uuid
from unittest.mock import MagicMock, patch

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

from fastapi import HTTPException

from app.services.signature_compliance import ComplianceCheckError, ComplianceResult, SourceCounts


class TestSignatureRestrictedMode(unittest.TestCase):
    def test_fail_open_on_compliance_check_error(self):
        from app.auth.hub_access import require_hub_access

        request = MagicMock()
        request.url.path = "/projects"
        request.method = "GET"
        request.query_params = {}
        request.headers = {}
        request.scope = {"type": "http"}

        db = MagicMock()
        user = MagicMock()
        user.id = uuid.uuid4()
        user.is_active = True

        with patch("app.auth.hub_access.settings") as mock_settings:
            mock_settings.signature_restricted_mode = True
            with patch("app.auth.hub_access._optional_user", return_value=user):
                with patch(
                    "app.auth.hub_access.get_signature_compliance",
                    side_effect=ComplianceCheckError("db error"),
                ):
                    with patch("app.auth.hub_access._log_compliance_failure"):
                        require_hub_access(request, db=db)

    def test_blocked_user_denied_on_hub_route(self):
        from app.auth.hub_access import require_hub_access

        request = MagicMock()
        request.url.path = "/projects"
        request.method = "GET"
        request.query_params = {}
        request.headers = {}
        request.scope = {"type": "http"}

        db = MagicMock()
        user = MagicMock()
        user.id = uuid.uuid4()
        user.is_active = True

        blocked = ComplianceResult(
            has_pending=True,
            pending_count=1,
            overdue_count=1,
            blocked=True,
            earliest_deadline=None,
            sources={"onboarding": SourceCounts(), "document_builder": SourceCounts()},
        )

        with patch("app.auth.hub_access.settings") as mock_settings:
            mock_settings.signature_restricted_mode = True
            with patch("app.auth.hub_access._optional_user", return_value=user):
                with patch("app.auth.hub_access.get_signature_compliance", return_value=blocked):
                    with self.assertRaises(HTTPException) as ctx:
                        require_hub_access(request, db=db)
        self.assertEqual(ctx.exception.status_code, 403)

    def test_blocked_user_allowed_on_signatures_path(self):
        from app.auth.hub_access import require_hub_access

        request = MagicMock()
        request.url.path = "/auth/me/signatures"
        request.method = "GET"
        request.query_params = {}
        request.headers = {}
        request.scope = {"type": "http"}

        db = MagicMock()
        user = MagicMock()
        user.id = uuid.uuid4()
        user.is_active = True

        blocked = ComplianceResult(
            has_pending=True,
            pending_count=1,
            overdue_count=1,
            blocked=True,
            earliest_deadline=None,
            sources={"onboarding": SourceCounts(), "document_builder": SourceCounts()},
        )

        with patch("app.auth.hub_access.settings") as mock_settings:
            mock_settings.signature_restricted_mode = True
            with patch("app.auth.hub_access._optional_user", return_value=user):
                with patch("app.auth.hub_access.get_signature_compliance", return_value=blocked):
                    require_hub_access(request, db=db)

    def test_restricted_mode_off_skips_compliance(self):
        from app.auth.hub_access import require_hub_access

        request = MagicMock()
        request.url.path = "/projects"
        request.method = "GET"

        with patch("app.auth.hub_access.settings") as mock_settings:
            mock_settings.signature_restricted_mode = False
            with patch("app.auth.hub_access.get_signature_compliance") as mock_compliance:
                require_hub_access(request, db=MagicMock())
        mock_compliance.assert_not_called()

    def test_unauthenticated_user_passes_hub_guard(self):
        from app.auth.hub_access import require_hub_access

        request = MagicMock()
        request.url.path = "/projects"
        request.method = "GET"
        request.query_params = {}
        request.headers = {}
        request.scope = {"type": "http"}

        with patch("app.auth.hub_access.settings") as mock_settings:
            mock_settings.signature_restricted_mode = True
            with patch("app.auth.hub_access._optional_user", return_value=None):
                with patch("app.auth.hub_access.get_signature_compliance") as mock_compliance:
                    require_hub_access(request, db=MagicMock())
        mock_compliance.assert_not_called()

    def test_chat_ws_router_exempt_from_hub_guard(self):
        """WebSocket chat is on ws_router without require_hub_access (HTTP-only dep)."""
        from starlette.routing import WebSocketRoute
        from app.routes.chat import ws_router

        ws_routes = [r for r in ws_router.routes if isinstance(r, WebSocketRoute)]
        self.assertEqual(len(ws_routes), 1)
        self.assertIn("ws/chat", ws_routes[0].path)


if __name__ == "__main__":
    unittest.main()
