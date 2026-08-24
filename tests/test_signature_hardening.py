"""Hardening-phase tests: integration boundaries, concurrency losers, admin races."""
from __future__ import annotations

import asyncio
import sys
import types
import unittest
import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

# --- minimal import stubs (match other signature tests) ---
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

if "jwt" not in sys.modules:
    jwt_module = types.ModuleType("jwt")
    jwt_module.encode = lambda *args, **kwargs: "token"
    jwt_module.decode = lambda *args, **kwargs: {}
    sys.modules["jwt"] = jwt_module

if "prometheus_fastapi_instrumentator" not in sys.modules:
    prom = types.ModuleType("prometheus_fastapi_instrumentator")

    class Instrumentator:
        def instrument(self, app):
            return self

        def expose(self, app):
            return self

    prom.Instrumentator = Instrumentator
    sys.modules["prometheus_fastapi_instrumentator"] = prom

if "slowapi" not in sys.modules:
    slowapi = types.ModuleType("slowapi")
    slowapi_errors = types.ModuleType("slowapi.errors")

    class RateLimitExceeded(Exception):
        pass

    slowapi_errors.RateLimitExceeded = RateLimitExceeded
    slowapi.Limiter = lambda *args, **kwargs: MagicMock()
    slowapi._rate_limit_exceeded_handler = lambda *args, **kwargs: None
    sys.modules["slowapi"] = slowapi
    sys.modules["slowapi.errors"] = slowapi_errors
    slowapi_middleware = types.ModuleType("slowapi.middleware")

    class SlowAPIMiddleware:
        def __init__(self, app, *args, **kwargs):
            self.app = app

        async def __call__(self, scope, receive, send):
            await self.app(scope, receive, send)

    slowapi_middleware.SlowAPIMiddleware = SlowAPIMiddleware
    sys.modules["slowapi.middleware"] = slowapi_middleware
    sys.modules["slowapi.util"] = types.ModuleType("slowapi.util")
    sys.modules["slowapi.util"].get_remote_address = lambda request: "127.0.0.1"

from fastapi import HTTPException

from app.services.signature_compliance import (
    ComplianceCheckError,
    ComplianceResult,
    SourceCounts,
    set_participant_turn_deadline,
)


class TestSignatureStatusEndpoint(unittest.TestCase):
    def test_signature_status_fail_open_returns_status_available_false(self):
        from app.routes.signature_compliance import me_signature_status

        db = MagicMock()
        user = MagicMock()
        user.id = uuid.uuid4()

        with patch(
            "app.routes.signature_compliance.get_signature_compliance",
            side_effect=ComplianceCheckError("db unavailable"),
        ):
            out = me_signature_status(db=db, user=user)

        self.assertFalse(out["status_available"])
        self.assertEqual(out["error"], "compliance_unavailable")
        self.assertEqual(out["action_required_count"], 0)
        self.assertFalse(out["blocked"])


class TestCancelPreservation(unittest.TestCase):
    def test_me_sign_rejects_cancelled_request(self):
        from app.routes.document_signature_requests import me_sign

        row = MagicMock()
        row.status = "cancelled"
        part = MagicMock()
        part.status = "ready"
        db = MagicMock()
        user = MagicMock()
        user.id = uuid.uuid4()
        request = MagicMock()

        with patch(
            "app.routes.document_signature_requests._row_for_participant_user",
            return_value=(row, part),
        ):
            with self.assertRaises(HTTPException) as ctx:
                asyncio.run(
                    me_sign(
                        uuid.uuid4(),
                        request,
                        agreement="true",
                        field_values_json="{}",
                        db=db,
                        user=user,
                    )
                )
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("cancelled", str(ctx.exception.detail).lower())

    def test_me_signing_context_rejects_cancelled_request(self):
        from app.routes.document_signature_requests import me_signing_context

        row = MagicMock()
        row.status = "cancelled"
        part = MagicMock()
        part.status = "ready"

        with patch(
            "app.routes.document_signature_requests._row_for_participant_user",
            return_value=(row, part),
        ):
            with self.assertRaises(HTTPException) as ctx:
                me_signing_context(uuid.uuid4(), db=MagicMock(), user=MagicMock())
        self.assertEqual(ctx.exception.status_code, 400)


class TestExtendDeadlineSemantics(unittest.TestCase):
    def test_next_signer_gets_fresh_turn_deadline_after_prior_signs(self):
        from app.models.models import DocumentSignatureParticipant, DocumentSignatureRequest

        now = datetime(2026, 3, 1, 12, 0, tzinfo=timezone.utc)
        row = DocumentSignatureRequest()
        row.signing_deadline_days = 7
        nxt = DocumentSignatureParticipant()
        nxt.status = "ready"

        set_participant_turn_deadline(nxt, row, now=now)

        self.assertEqual(nxt.available_at, now)
        self.assertEqual(nxt.deadline_at, now + timedelta(days=7))

    def test_extend_deadline_updates_ready_participant_only(self):
        from app.routes.document_signature_requests import extend_signature_deadline

        row = MagicMock()
        row.id = uuid.uuid4()
        row.status = "in_progress"
        ready = MagicMock()
        ready.status = "ready"
        ready.deadline_at = datetime(2026, 1, 1, tzinfo=timezone.utc)
        db = MagicMock()
        user = MagicMock()
        user.id = uuid.uuid4()

        q = MagicMock()
        q.filter.return_value.first.return_value = ready
        db.query.return_value = q

        with patch(
            "app.routes.document_signature_requests._get_request_or_404",
            return_value=row,
        ):
            with patch("app.routes.document_signature_requests.create_audit_log"):
                extend_signature_deadline(
                    row.id,
                    {"extend_days": 7},
                    db=db,
                    user=user,
                )

        self.assertEqual(ready.deadline_at, datetime(2026, 1, 8, tzinfo=timezone.utc))
        db.commit.assert_called_once()


class TestPreMigrationBlocking(unittest.TestCase):
    def test_legacy_rows_without_block_hub_access_do_not_block(self):
        from app.services.signature_compliance import _builder_blockers

        db = MagicMock()
        uid = uuid.uuid4()
        now = datetime.now(timezone.utc)
        db.query.return_value.join.return_value.filter.return_value.all.return_value = []

        with patch("app.services.signature_compliance.settings") as mock_settings:
            mock_settings.signature_builder_blocking_enabled = True
            blockers, src = _builder_blockers(db, uid, now)

        self.assertEqual(blockers, [])
        self.assertEqual(src.blocking_count, 0)


class TestSignConcurrencyLosers(unittest.IsolatedAsyncioTestCase):
    async def test_me_sign_loses_race_when_row_lock_missing(self):
        from app.routes.document_signature_requests import me_sign

        row = MagicMock()
        row.status = "pending"
        part = MagicMock()
        part.id = uuid.uuid4()
        part.status = "ready"
        db = MagicMock()
        user = MagicMock()
        user.id = uuid.uuid4()
        request = MagicMock()

        def query_side_effect(model):
            q = MagicMock()
            name = getattr(model, "__name__", str(model))
            if name == "DocumentSignatureParticipant":
                q.filter.return_value.with_for_update.return_value.first.return_value = None
            elif name == "DocumentSignatureRequest":
                q.filter.return_value.with_for_update.return_value.first.return_value = row
            return q

        db.query.side_effect = query_side_effect

        with patch(
            "app.routes.document_signature_requests._row_for_participant_user",
            return_value=(row, part),
        ):
            with self.assertRaises(HTTPException) as ctx:
                await me_sign(
                    uuid.uuid4(),
                    request,
                    agreement="true",
                    field_values_json="{}",
                    db=db,
                    user=user,
                )
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("already signed", str(ctx.exception.detail).lower())


class TestAdminConcurrency(unittest.TestCase):
    def test_double_cancel_rejected(self):
        from app.routes.document_signature_requests import cancel_signature_request

        row = MagicMock()
        row.id = uuid.uuid4()
        row.status = "cancelled"

        with patch(
            "app.routes.document_signature_requests._get_request_or_404",
            return_value=row,
        ):
            with self.assertRaises(HTTPException) as ctx:
                cancel_signature_request(row.id, {}, db=MagicMock(), user=MagicMock())
        self.assertEqual(ctx.exception.status_code, 400)

    def test_extend_on_cancelled_request_rejected(self):
        from app.routes.document_signature_requests import extend_signature_deadline

        row = MagicMock()
        row.id = uuid.uuid4()
        row.status = "cancelled"

        with patch(
            "app.routes.document_signature_requests._get_request_or_404",
            return_value=row,
        ):
            with self.assertRaises(HTTPException) as ctx:
                extend_signature_deadline(
                    row.id,
                    {"extend_days": 3},
                    db=MagicMock(),
                    user=MagicMock(),
                )
        self.assertEqual(ctx.exception.status_code, 400)

    def test_cancel_then_extend_race_loser(self):
        """After cancel, extend-deadline must fail (admin race loser path)."""
        from app.routes.document_signature_requests import extend_signature_deadline

        row = MagicMock()
        row.id = uuid.uuid4()
        row.status = "cancelled"

        with patch(
            "app.routes.document_signature_requests._get_request_or_404",
            return_value=row,
        ):
            with self.assertRaises(HTTPException) as ctx:
                extend_signature_deadline(
                    row.id,
                    {"deadline_at": "2026-12-31T00:00:00Z"},
                    db=MagicMock(),
                    user=MagicMock(),
                )
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("not active", str(ctx.exception.detail).lower())


class TestRestrictedModeIntegration(unittest.TestCase):
    def setUp(self):
        from app.main import app

        self.app = app
        self.app.dependency_overrides.clear()

    def tearDown(self):
        self.app.dependency_overrides.clear()

    def _blocked_compliance(self) -> ComplianceResult:
        return ComplianceResult(
            has_pending=True,
            pending_count=1,
            overdue_count=1,
            blocked=True,
            earliest_deadline=None,
            sources={"onboarding": SourceCounts(), "document_builder": SourceCounts()},
        )

    def test_blocked_user_gets_403_on_projects(self):
        from fastapi.testclient import TestClient
        from app.auth.security import get_current_user
        from app.db import get_db

        user = MagicMock()
        user.id = uuid.uuid4()
        user.is_active = True
        self.app.dependency_overrides[get_current_user] = lambda: user

        def override_db():
            yield MagicMock()

        self.app.dependency_overrides[get_db] = override_db

        with patch("app.auth.hub_access.settings") as mock_settings:
            mock_settings.signature_restricted_mode = True
            with patch(
                "app.auth.hub_access._optional_user",
                return_value=user,
            ):
                with patch(
                    "app.auth.hub_access.get_signature_compliance",
                    return_value=self._blocked_compliance(),
                ):
                    client = TestClient(self.app, raise_server_exceptions=True)
                    resp = client.get(
                        "/projects",
                        headers={"Authorization": "Bearer test-token"},
                    )
        self.assertEqual(resp.status_code, 403)

    def test_blocked_user_reaches_signature_status_allowlist(self):
        from fastapi.testclient import TestClient
        from app.auth.security import get_current_user
        from app.db import get_db

        user = MagicMock()
        user.id = uuid.uuid4()
        user.is_active = True
        self.app.dependency_overrides[get_current_user] = lambda: user

        def override_db():
            yield MagicMock()

        self.app.dependency_overrides[get_db] = override_db

        with patch("app.auth.hub_access.settings") as mock_settings:
            mock_settings.signature_restricted_mode = True
            with patch("app.auth.hub_access._optional_user", return_value=user):
                with patch(
                    "app.auth.hub_access.get_signature_compliance",
                    return_value=self._blocked_compliance(),
                ):
                    with patch(
                        "app.routes.signature_compliance.get_signature_compliance",
                        return_value=self._blocked_compliance(),
                    ):
                        client = TestClient(self.app, raise_server_exceptions=True)
                        resp = client.get(
                            "/auth/me/signature-status",
                            headers={"Authorization": "Bearer test-token"},
                        )
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.json()["status_available"])


class TestRestrictedModeStructuralCoverage(unittest.TestCase):
    def test_hub_protected_routes_not_allowlisted_when_blocked(self):
        from app.auth.hub_route_manifest import (
            RouteClass,
            classify_route,
            is_restricted_allowed,
            iter_openapi_paths,
        )
        from app.main import app

        openapi = app.openapi()
        sample_protected = [
            (m, p)
            for m, p in iter_openapi_paths(openapi)
            if classify_route(m, p) == RouteClass.hub_protected
        ]
        self.assertGreater(len(sample_protected), 10)
        for method, path in sample_protected[:25]:
            self.assertFalse(
                is_restricted_allowed(method, path),
                msg=f"hub_protected must not be allowlisted: {method} {path}",
            )

    def test_restricted_allowlist_paths_classified_correctly(self):
        from app.auth.hub_route_manifest import RouteClass, classify_route

        allowlisted = [
            ("GET", "/auth/me/signature-status"),
            ("GET", "/auth/me/signatures"),
            ("GET", "/auth/me/onboarding/documents"),
            ("POST", "/auth/me/onboarding/sign"),
        ]
        for method, path in allowlisted:
            cls = classify_route(method, path)
            self.assertEqual(
                cls,
                RouteClass.restricted_allowed,
                msg=f"{method} {path} should be restricted_allowed",
            )


if __name__ == "__main__":
    unittest.main()
