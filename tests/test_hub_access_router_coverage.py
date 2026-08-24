"""Pre-Phase-4B gate: every OpenAPI route must be classified for hub access enforcement."""
import sys
import types
import unittest
from unittest.mock import MagicMock

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
    slowapi_middleware.SlowAPIMiddleware = type("SlowAPIMiddleware", (), {})
    sys.modules["slowapi.middleware"] = slowapi_middleware
    sys.modules["slowapi.util"] = types.ModuleType("slowapi.util")
    sys.modules["slowapi.util"].get_remote_address = lambda request: "127.0.0.1"

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

from app.auth.hub_route_manifest import (
    RESTRICTED_MODE_ALLOWLIST,
    RouteClass,
    classify_route,
    is_public_path,
    is_restricted_allowed,
    iter_openapi_paths,
)


class TestHubAccessRouterCoverage(unittest.TestCase):
    def test_all_openapi_routes_classified(self):
        from app.main import app

        openapi = app.openapi()
        paths = list(iter_openapi_paths(openapi))
        self.assertGreater(len(paths), 50, "Expected substantial route inventory")

        public_count = 0
        restricted_count = 0
        protected_count = 0

        for method, path in paths:
            cls = classify_route(method, path)
            self.assertIn(
                cls,
                (RouteClass.public, RouteClass.hub_protected, RouteClass.restricted_allowed),
                msg=f"Unclassified route: {method} {path}",
            )
            if cls == RouteClass.public:
                public_count += 1
                self.assertTrue(is_public_path(method, path), msg=f"public class mismatch: {method} {path}")
            elif cls == RouteClass.restricted_allowed:
                restricted_count += 1
                self.assertTrue(
                    is_restricted_allowed(method, path),
                    msg=f"restricted_allowed not in allowlist: {method} {path}",
                )
            else:
                protected_count += 1
                if not is_public_path(method, path):
                    self.assertFalse(
                        is_restricted_allowed(method, path),
                        msg=f"hub_protected route incorrectly allowlisted: {method} {path}",
                    )

        self.assertGreater(protected_count, 0)
        self.assertGreater(public_count, 0)

    def test_restricted_allowlist_entries_are_documented(self):
        for method, prefix in RESTRICTED_MODE_ALLOWLIST:
            self.assertTrue(method in ("GET", "POST", "PATCH", "PUT", "*"))
            self.assertTrue(prefix.startswith("/"))

    def test_critical_signing_paths_allowlisted(self):
        critical = [
            ("GET", "/auth/me/signature-status"),
            ("GET", "/auth/me/signatures"),
            ("GET", "/auth/me/onboarding/documents"),
            ("POST", "/auth/me/onboarding/sign"),
            ("GET", "/auth/me/document-signature-requests/abc/signing-context"),
            ("POST", "/auth/me/document-signature-requests/abc/sign"),
        ]
        for method, path in critical:
            self.assertTrue(
                is_restricted_allowed(method, path),
                msg=f"Signing path must be allowlisted: {method} {path}",
            )


if __name__ == "__main__":
    unittest.main()
