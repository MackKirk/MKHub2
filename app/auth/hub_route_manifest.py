"""Route classification for hub access enforcement and coverage tests."""
from __future__ import annotations

import re
from enum import Enum
from typing import Iterable, List, Optional, Tuple


class RouteClass(str, Enum):
    public = "public"
    hub_protected = "hub_protected"
    restricted_allowed = "restricted_allowed"


# Explicit restricted-mode allowlist: (METHOD, path_prefix)
# When user is blocked, ONLY these paths are reachable (plus public).
RESTRICTED_MODE_ALLOWLIST: Tuple[Tuple[str, str], ...] = (
    ("POST", "/auth/logout"),
    ("GET", "/auth/me"),
    ("GET", "/auth/me/profile"),
    ("PATCH", "/auth/me/profile"),
    ("PUT", "/auth/me/profile"),
    ("GET", "/auth/me/signature-status"),
    ("GET", "/auth/me/signatures"),
    ("GET", "/auth/me/settings-permissions"),
    ("GET", "/auth/me/onboarding"),
    ("POST", "/auth/me/onboarding"),
    ("GET", "/auth/me/document-signature-requests"),
    ("POST", "/auth/me/document-signature-requests"),
)

# Prefix patterns treated as public (no auth required for hub guard skip)
PUBLIC_PATH_PREFIXES: Tuple[str, ...] = (
    "/auth/login",
    "/auth/register",
    "/auth/forgot-password",
    "/auth/reset-password",
    "/auth/refresh",
    "/auth/invite",
    "/docs",
    "/openapi.json",
    "/redoc",
    "/health",
    "/metrics",
    "/ui/",
    "/assets/",
    "/static/",
)

# Regex patterns for public auth endpoints
PUBLIC_PATH_PATTERNS: Tuple[re.Pattern, ...] = (
    re.compile(r"^/auth/login/?$"),
    re.compile(r"^/auth/register/?$"),
    re.compile(r"^/auth/forgot-password/?$"),
    re.compile(r"^/auth/reset-password/?$"),
    re.compile(r"^/auth/refresh/?$"),
    re.compile(r"^/auth/invite/[^/]+/?$"),
    re.compile(r"^/auth/accept-invite/?$"),
)


def is_public_path(method: str, path: str) -> bool:
    p = path.split("?")[0].rstrip("/") or "/"
    m = (method or "GET").upper()
    if m == "OPTIONS":
        return True
    for prefix in PUBLIC_PATH_PREFIXES:
        if p.startswith(prefix.rstrip("/")):
            return True
    for pat in PUBLIC_PATH_PATTERNS:
        if pat.match(p):
            return True
    return False


def is_restricted_allowed(method: str, path: str) -> bool:
    p = path.split("?")[0]
    m = (method or "GET").upper()
    for allow_m, prefix in RESTRICTED_MODE_ALLOWLIST:
        if m != allow_m and allow_m != "*":
            continue
        if p == prefix.rstrip("/") or p.startswith(prefix.rstrip("/") + "/"):
            return True
    return False


def classify_route(method: str, path: str) -> RouteClass:
    if is_public_path(method, path):
        return RouteClass.public
    if is_restricted_allowed(method, path):
        return RouteClass.restricted_allowed
    return RouteClass.hub_protected


# Routers mounted without hub dependency (must all classify as public or documented exempt)
ROUTERS_EXEMPT_FROM_HUB_GUARD: Tuple[str, ...] = ("chat_ws",)

# Additional manual overrides for routes that FastAPI lists with params
MANUAL_ROUTE_OVERRIDES: dict[tuple[str, str], RouteClass] = {}


def effective_route_class(method: str, path: str, *, has_hub_dependency: bool) -> RouteClass:
    key = (method.upper(), path)
    if key in MANUAL_ROUTE_OVERRIDES:
        return MANUAL_ROUTE_OVERRIDES[key]
    if is_public_path(method, path):
        return RouteClass.public
    if not has_hub_dependency:
        # Authenticated route on router without hub guard — coverage test fails
        return RouteClass.hub_protected
    if is_restricted_allowed(method, path):
        return RouteClass.restricted_allowed
    return RouteClass.hub_protected


def iter_openapi_paths(openapi: dict) -> Iterable[tuple[str, str]]:
    paths = openapi.get("paths") or {}
    for path, methods in paths.items():
        for method in methods.keys():
            if method.startswith("x-"):
                continue
            yield method.upper(), path
