import uuid
import time
from datetime import datetime, timedelta, timezone
from typing import Optional, List, Literal, Any

import jwt
from fastapi import Depends, HTTPException, Query, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from passlib.context import CryptContext
import re
try:
    import bcrypt as _bcrypt
except Exception:
    _bcrypt = None
from sqlalchemy.orm import Session

from ..config import settings
from ..db import get_db
from ..models.models import User
from ..services.business_line import (
    BUSINESS_LINE_CONSTRUCTION,
    BUSINESS_LINE_REPAIRS_MAINTENANCE,
    normalize_business_line,
)


pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")
http_bearer = HTTPBearer(auto_error=False)


def get_password_hash(password: str) -> str:
    # Use pbkdf2_sha256 to avoid native bcrypt backend issues
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    # Fast-path legacy bcrypt ($2a$/$2b$/$2y$) using the bcrypt module directly to avoid passlib backend init quirks
    if hashed.startswith("$2a$") or hashed.startswith("$2b$") or hashed.startswith("$2y$"):
        if not _bcrypt:
            return False
        try:
            pb = plain.encode("utf-8")
        except Exception:
            pb = plain.encode()
        if len(pb) > 72:
            pb = pb[:72]
        try:
            return _bcrypt.checkpw(pb, hashed.encode("utf-8"))
        except Exception:
            return False
    # Otherwise, verify using pbkdf2_sha256 (current scheme)
    try:
        return pwd_context.verify(plain, hashed)
    except Exception:
        return False


def _create_token(sub: str, ttl_seconds: int, extra: Optional[dict] = None) -> str:
    now = datetime.now(tz=timezone.utc)
    payload = {
        "sub": sub,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(seconds=ttl_seconds)).timestamp()),
        "jti": str(uuid.uuid4()),
    }
    if extra:
        payload.update(extra)
    token = jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)
    return token


def create_access_token(user_id: str, roles: Optional[List[str]] = None) -> str:
    return _create_token(user_id, settings.jwt_ttl_seconds, extra={"roles": roles or []})


def create_refresh_token(user_id: str) -> str:
    return _create_token(user_id, settings.refresh_ttl_seconds, extra={"type": "refresh"})


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")


def get_current_user(
    creds: Optional[HTTPAuthorizationCredentials] = Depends(http_bearer),
    db: Session = Depends(get_db),
):
    if creds is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    payload = decode_token(creds.credentials)
    user_id_raw = payload.get("sub")
    try:
        user_uuid = uuid.UUID(str(user_id_raw))
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid subject")
    user = db.query(User).filter(User.id == user_uuid).first()
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not active")
    from ..services.offboarding_service import enforce_due_revocation_for_user

    enforce_due_revocation_for_user(db, user.id)
    db.refresh(user)
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not active")
    return user


def get_current_user_bearer_or_query_token(
    access_token: Optional[str] = Query(None, description="JWT when Authorization header is unavailable (e.g. img src)"),
    creds: Optional[HTTPAuthorizationCredentials] = Depends(http_bearer),
    db: Session = Depends(get_db),
):
    """Same as get_current_user but also accepts ?access_token= for <img> and similar."""
    raw = (creds.credentials if creds else None) or (access_token or "").strip() or None
    if not raw:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    payload = decode_token(raw)
    user_id_raw = payload.get("sub")
    try:
        user_uuid = uuid.UUID(str(user_id_raw))
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid subject")
    user = db.query(User).filter(User.id == user_uuid).first()
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not active")
    from ..services.offboarding_service import enforce_due_revocation_for_user

    enforce_due_revocation_for_user(db, user.id)
    db.refresh(user)
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not active")
    return user


def require_roles(*required_roles: str):
    def _dep(user: User = Depends(get_current_user)):
        role_names = {r.name for r in user.roles}
        if not set(required_roles).issubset(role_names):
            raise HTTPException(status_code=403, detail="Forbidden")
        return user

    return _dep


def expand_project_permission_aliases(perm: str) -> List[str]:
    """Map legacy business:projects:* to line-specific keys for route guards."""
    if not perm.startswith("business:projects:"):
        return [perm]
    suffix = perm[len("business:projects:") :]
    return [
        f"business:construction:projects:{suffix}",
        f"business:rm:projects:{suffix}",
        perm,
    ]


def _project_line_perm_prefix(line: Optional[str]) -> str:
    ln = normalize_business_line(line)
    if ln == BUSINESS_LINE_REPAIRS_MAINTENANCE:
        return "business:rm:projects"
    return "business:construction:projects"


def require_permissions(*required_permissions: str):
    """
    Require at least one of the specified permissions (OR logic).
    If multiple permissions are provided, user needs at least one.
    """
    expanded: List[str] = []
    for perm in required_permissions:
        expanded.extend(expand_project_permission_aliases(perm))

    def _dep(user: User = Depends(get_current_user)):
        # Admin role bypass
        if _user_is_admin(user):
            return user

        # Check if user has at least one of the required permissions
        has_any = any(_has_permission(user, perm) for perm in expanded)
        if not has_any:
            raise HTTPException(status_code=403, detail="Forbidden")
        return user

    return _dep


def _get_user_permission_map(user: User) -> dict:
    """Get combined permission map from roles and user overrides"""
    perm_map = {}
    for r in user.roles:
        if getattr(r, 'permissions', None):
            try:
                perm_map.update(r.permissions)
            except Exception:
                pass
    if getattr(user, 'permissions_override', None):
        try:
            perm_map.update(user.permissions_override)
        except Exception:
            pass
    return perm_map


def _permission_config_keys() -> frozenset:
    from ..routes.permissions import PERMISSION_CONFIG_KEYS

    return PERMISSION_CONFIG_KEYS


def is_granted_perm_value(value: Any) -> bool:
    """True only for boolean grants — not category config arrays or other JSON blobs."""
    if isinstance(value, list):
        return False
    if value is True:
        return True
    if value is False or value is None:
        return False
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return value != 0
    if isinstance(value, str):
        return value.strip().lower() in ("true", "1", "yes")
    return False


def _legacy_project_sub_feature_key(key: str) -> bool:
    """Legacy business:projects:<feature>:* — UI uses line-scoped keys; omit from /me."""
    if not key.startswith("business:projects:"):
        return False
    if key in (
        "business:projects:read",
        "business:projects:write",
        "business:projects:members:write",
    ):
        return False
    if ":categories:" in key:
        return False
    return True


def granted_permission_keys_from_map(perm_map: dict) -> List[str]:
    """Keys granted for /auth/me and frontend permission sets."""
    config_keys = _permission_config_keys()
    granted: List[str] = []
    for key, value in (perm_map or {}).items():
        if key in config_keys:
            continue
        if _legacy_project_sub_feature_key(key):
            continue
        if is_granted_perm_value(value):
            granted.append(key)
    return sorted(granted)


def _line_has_any_project_access(perm_map: dict, line: Optional[str]) -> bool:
    """Line access from main read/write or any sub-permission (e.g. files:read only)."""
    if is_granted_perm_value(perm_map.get("business:projects:read")) or is_granted_perm_value(
        perm_map.get("business:projects:write")
    ):
        return True
    prefix = _project_line_perm_prefix(line)
    if is_granted_perm_value(perm_map.get(f"{prefix}:read")) or is_granted_perm_value(
        perm_map.get(f"{prefix}:write")
    ):
        return True
    for key, value in perm_map.items():
        if not key.startswith(f"{prefix}:") or ":categories:" in key:
            continue
        if is_granted_perm_value(value):
            return True
    return False


def _line_has_project_write(perm_map: dict, line: Optional[str]) -> bool:
    if is_granted_perm_value(perm_map.get("business:projects:write")):
        return True
    prefix = _project_line_perm_prefix(line)
    if is_granted_perm_value(perm_map.get(f"{prefix}:write")):
        return True
    for key, value in perm_map.items():
        if not key.startswith(f"{prefix}:") or ":categories:" in key:
            continue
        if key.endswith(":write") and is_granted_perm_value(value):
            return True
    return False


def _fleet_area_unlocked(perm_map: dict) -> bool:
    """True if user may use Fleet scoped permissions (UI + legacy keys)."""
    if is_granted_perm_value(perm_map.get("fleet:access")) or is_granted_perm_value(perm_map.get("fleet:read")):
        return True
    return bool(
        is_granted_perm_value(perm_map.get("fleet:dashboard:read"))
        or is_granted_perm_value(perm_map.get("fleet:vehicles:read"))
        or is_granted_perm_value(perm_map.get("fleet:vehicles:write"))
        or is_granted_perm_value(perm_map.get("fleet:work_orders:read"))
        or is_granted_perm_value(perm_map.get("fleet:work_orders:write"))
        or is_granted_perm_value(perm_map.get("fleet:inspections:read"))
        or is_granted_perm_value(perm_map.get("fleet:inspections:write"))
    )


def _company_assets_area_unlocked(perm_map: dict) -> bool:
    """True if user may use Company Assets scoped permissions."""
    if is_granted_perm_value(perm_map.get("company_assets:access")):
        return True
    return bool(
        is_granted_perm_value(perm_map.get("fleet:equipment:read"))
        or is_granted_perm_value(perm_map.get("fleet:equipment:write"))
        or is_granted_perm_value(perm_map.get("company_cards:read"))
        or is_granted_perm_value(perm_map.get("company_cards:write"))
    )


def _perm_matches_map(perm_map: dict, perm: str) -> bool:
    """Whether perm_map grants `perm`, including granular Fleet & Equipment aliases."""
    if is_granted_perm_value(perm_map.get(perm)):
        return True
    if perm == "fleet:access":
        return _fleet_area_unlocked(perm_map)
    if perm == "fleet:read":
        return bool(
            is_granted_perm_value(perm_map.get("fleet:vehicles:read"))
            or is_granted_perm_value(perm_map.get("fleet:dashboard:read"))
        )
    if perm == "fleet:write":
        return bool(is_granted_perm_value(perm_map.get("fleet:vehicles:write")))
    if perm == "company_assets:access":
        return _company_assets_area_unlocked(perm_map)
    if perm == "equipment:read":
        return bool(
            is_granted_perm_value(perm_map.get("fleet:equipment:read"))
            and _company_assets_area_unlocked(perm_map)
        )
    if perm == "equipment:write":
        return bool(
            is_granted_perm_value(perm_map.get("fleet:equipment:write"))
            and _company_assets_area_unlocked(perm_map)
        )
    # Work orders & inspections — new tab keys with legacy aliases
    if perm == "work_orders:read":
        return bool(
            is_granted_perm_value(perm_map.get("fleet:work_orders:read"))
            or is_granted_perm_value(perm_map.get("work_orders:read"))
            or _fleet_area_unlocked(perm_map)
        )
    if perm == "work_orders:write":
        return bool(
            is_granted_perm_value(perm_map.get("fleet:work_orders:write"))
            or is_granted_perm_value(perm_map.get("work_orders:write"))
            or is_granted_perm_value(perm_map.get("fleet:write"))
            or is_granted_perm_value(perm_map.get("fleet:vehicles:write"))
        )
    if perm == "work_orders:assign":
        return bool(
            is_granted_perm_value(perm_map.get("fleet:work_orders:assign"))
            or is_granted_perm_value(perm_map.get("work_orders:assign"))
            or is_granted_perm_value(perm_map.get("work_orders:write"))
            or is_granted_perm_value(perm_map.get("fleet:work_orders:write"))
            or is_granted_perm_value(perm_map.get("fleet:write"))
            or is_granted_perm_value(perm_map.get("fleet:vehicles:write"))
        )
    if perm == "inspections:read":
        return bool(
            is_granted_perm_value(perm_map.get("fleet:inspections:read"))
            or is_granted_perm_value(perm_map.get("inspections:read"))
            or _fleet_area_unlocked(perm_map)
        )
    if perm == "inspections:write":
        return bool(
            is_granted_perm_value(perm_map.get("fleet:inspections:write"))
            or is_granted_perm_value(perm_map.get("inspections:write"))
            or is_granted_perm_value(perm_map.get("fleet:write"))
            or is_granted_perm_value(perm_map.get("fleet:vehicles:write"))
        )
    if perm == "company_cards:read":
        return bool(perm_map.get("company_cards:read"))
    if perm == "company_cards:write":
        return bool(perm_map.get("company_cards:write"))
    if perm == "training:manage":
        return bool(perm_map.get("training:manage") or perm_map.get("users:write"))
    return False


def _user_is_admin(user: User) -> bool:
    return any((getattr(r, "name", None) or "").lower() == "admin" for r in user.roles)


def _has_permission(user: User, perm: str) -> bool:
    # Admin role bypass
    if _user_is_admin(user):
        return True
    
    perm_map = _get_user_permission_map(user)
    
    # Check hierarchical permissions: if permission belongs to an area, check area access first
    # Format: area:sub:permission (e.g., hr:users:read)
    # Area access permission format: area:access (e.g., hr:access)
    # Exception: business:customers:* and business:projects:* don't require business:access
    if ':' in perm:
        parts = perm.split(':')
        if len(parts) >= 2:
            area = parts[0]
            area_access_key = f"{area}:access"
            
            # If this is not the area access permission itself, check area access first
            if perm != area_access_key:
                # business:access is deprecated; granular business:* permissions stand alone
                if area == 'business' and perm != 'business:access':
                    pass
                # Special case: inventory:products:* and inventory:suppliers:* don't require inventory:access
                # They are standalone permissions
                elif area == 'inventory' and (perm.startswith('inventory:products:') or perm.startswith('inventory:suppliers:')):
                    # Skip area access check for inventory products/suppliers permissions
                    pass
                # Fleet: allow granular tab permissions without a stored fleet:access row (legacy UI gap)
                elif perm.startswith("fleet:equipment:"):
                    if "company_assets:access" in perm_map and not perm_map.get("company_assets:access"):
                        return False
                    if not _company_assets_area_unlocked(perm_map):
                        return False
                elif area == 'fleet' and perm != 'fleet:access':
                    if area_access_key in perm_map and not perm_map.get(area_access_key):
                        return False
                    if not _fleet_area_unlocked(perm_map):
                        return False
                elif area == 'company_assets' and perm != 'company_assets:access':
                    if area_access_key in perm_map and not perm_map.get(area_access_key):
                        return False
                    if not _company_assets_area_unlocked(perm_map):
                        return False
                # Equipment API uses equipment:read/write; those are granted via fleet:equipment:* + company assets
                elif area == 'equipment' and perm in ('equipment:read', 'equipment:write'):
                    pass
                elif area == 'company_cards' and perm in ('company_cards:read', 'company_cards:write'):
                    pass
                # No work_orders:access / inspections:access in product; rules are in _perm_matches_map
                elif area == 'work_orders':
                    pass
                elif area == 'inspections':
                    pass
                elif area == 'training':
                    pass
                else:
                    # Check if area access is explicitly denied (False in override)
                    if area_access_key in perm_map and not perm_map.get(area_access_key):
                        return False
                    # Check if area access is granted
                    if area_access_key not in perm_map or not perm_map.get(area_access_key):
                        # Area access not granted, deny all sub-permissions
                        return False
    
    return _perm_matches_map(perm_map, perm)


def can_access_business_line(user: User, line: Optional[str]) -> bool:
    """Whether user may view resources for this business line (Construction vs R&M)."""
    if _user_is_admin(user):
        return True
    pm = _get_user_permission_map(user)
    return _line_has_any_project_access(pm, line)


def can_write_business_line(user: User, line: Optional[str]) -> bool:
    """Whether user may create/update/delete resources for this business line."""
    if _user_is_admin(user):
        return True
    pm = _get_user_permission_map(user)
    return _line_has_project_write(pm, line)


def has_project_permission(user: User, project: Any, perm: str) -> bool:
    """
    Granular project permission AND business-line access.
    `project` must have .business_line (Construction vs R&M).
    Checks line-scoped keys first, then legacy business:projects:* fallback.
    """
    line = getattr(project, "business_line", None)
    for key in expand_project_permission_aliases(perm):
        if _has_permission(user, key) and can_access_business_line(user, line):
            return True
    return False


def has_any_project_permission(user: User, project: Any, *perms: str) -> bool:
    return any(has_project_permission(user, project, p) for p in perms if p)


CUSTOMER_TAB_KEYS: tuple[str, ...] = (
    "overview",
    "general",
    "contacts",
    "files",
    "sites",
    "opportunities",
    "projects",
)


def _has_any_project_line_read_permission(user: User) -> bool:
    return bool(
        _has_permission(user, "business:projects:read")
        or _has_permission(user, "business:construction:projects:read")
        or _has_permission(user, "business:rm:projects:read")
        or _has_permission(user, "business:construction:projects:write")
        or _has_permission(user, "business:rm:projects:write")
        or _has_permission(user, "business:projects:write")
    )


def has_customer_list_permission(user: User) -> bool:
    """Access to /customers list and create/delete customer records."""
    return _has_permission(user, "business:customers:read") or _has_permission(
        user, "business:customers:write"
    )


def has_customer_detail_access(user: User) -> bool:
    """Open a customer record (at least one tab or list permission)."""
    if has_customer_list_permission(user):
        return True
    for tab in CUSTOMER_TAB_KEYS:
        if has_customer_tab_permission(user, tab, "read"):
            return True
    return False


def has_customer_tab_permission(
    user: User,
    tab: str,
    action: Literal["read", "write"] = "read",
) -> bool:
    """
    Tab-level access for Customer detail (Overview, General, Contacts, Files, etc.).

    Read may use legacy fallbacks (main customer read, project line read).
    Write requires the tab-specific business:customers:{tab}:write key.
    """
    if action not in ("read", "write"):
        return False
    t = (tab or "").strip().lower()
    if t not in CUSTOMER_TAB_KEYS:
        return False

    read_key = f"business:customers:{t}:read"
    write_key = f"business:customers:{t}:write"

    if action == "write":
        return _has_permission(user, write_key)

    if _has_permission(user, read_key) or _has_permission(user, write_key):
        return True

    if t == "general" or t == "contacts":
        if _has_permission(user, "business:customers:read") or _has_permission(
            user, "business:customers:write"
        ):
            return True
    if t == "files":
        if _has_permission(user, "business:projects:files:read") or _has_permission(
            user, "business:projects:files:write"
        ):
            return True
        if _has_permission(user, "business:customers:read") or _has_permission(
            user, "business:customers:write"
        ):
            return True
    if t in ("overview", "sites", "opportunities", "projects"):
        if _has_any_project_line_read_permission(user):
            return True
    return False


def assert_customer_tab(
    user: User,
    tab: str,
    action: Literal["read", "write"] = "read",
) -> None:
    if not has_customer_tab_permission(user, tab, action):
        raise HTTPException(status_code=403, detail="Forbidden")


SUPPLIER_TAB_KEYS: tuple[str, ...] = ("overview", "contacts", "products")
PRODUCT_TAB_KEYS: tuple[str, ...] = ("details", "usage", "related")


def has_supplier_list_permission(user: User) -> bool:
    return _has_permission(user, "inventory:suppliers:read") or _has_permission(
        user, "inventory:suppliers:write"
    )


def has_supplier_detail_access(user: User) -> bool:
    if has_supplier_list_permission(user):
        return True
    for tab in SUPPLIER_TAB_KEYS:
        if has_supplier_tab_permission(user, tab, "read"):
            return True
    return False


def has_supplier_tab_permission(
    user: User,
    tab: str,
    action: Literal["read", "write"] = "read",
) -> bool:
    if action not in ("read", "write"):
        return False
    t = (tab or "").strip().lower()
    if t not in SUPPLIER_TAB_KEYS:
        return False

    read_key = f"inventory:suppliers:{t}:read"
    write_key = f"inventory:suppliers:{t}:write"

    if action == "write":
        if _has_permission(user, write_key):
            return True
        if t in ("overview", "contacts") and _has_permission(user, "inventory:suppliers:write"):
            return True
        if t == "products" and _has_permission(user, "inventory:products:write"):
            return True
        return False

    if _has_permission(user, read_key) or _has_permission(user, write_key):
        return True

    if t in ("overview", "contacts"):
        if _has_permission(user, "inventory:suppliers:read") or _has_permission(
            user, "inventory:suppliers:write"
        ):
            return True
    if t == "products":
        if _has_permission(user, "inventory:products:read") or _has_permission(
            user, "inventory:products:write"
        ):
            return True
    return False


def assert_supplier_tab(
    user: User,
    tab: str,
    action: Literal["read", "write"] = "read",
) -> None:
    if not has_supplier_tab_permission(user, tab, action):
        raise HTTPException(status_code=403, detail="Forbidden")


def has_product_list_permission(user: User) -> bool:
    return _has_permission(user, "inventory:products:read") or _has_permission(
        user, "inventory:products:write"
    )


def has_product_detail_access(user: User) -> bool:
    if has_product_list_permission(user):
        return True
    for tab in PRODUCT_TAB_KEYS:
        if has_product_tab_permission(user, tab, "read"):
            return True
    return False


def has_product_tab_permission(
    user: User,
    tab: str,
    action: Literal["read", "write"] = "read",
) -> bool:
    if action not in ("read", "write"):
        return False
    t = (tab or "").strip().lower()
    if t not in PRODUCT_TAB_KEYS:
        return False

    read_key = f"inventory:products:{t}:read"
    write_key = f"inventory:products:{t}:write"

    if action == "write":
        if t == "usage":
            return False
        if _has_permission(user, write_key):
            return True
        if _has_permission(user, "inventory:products:write"):
            return True
        return False

    if _has_permission(user, read_key) or _has_permission(user, write_key):
        return True

    if _has_permission(user, "inventory:products:read") or _has_permission(
        user, "inventory:products:write"
    ):
        return True
    return False


def assert_product_tab(
    user: User,
    tab: str,
    action: Literal["read", "write"] = "read",
) -> None:
    if not has_product_tab_permission(user, tab, action):
        raise HTTPException(status_code=403, detail="Forbidden")


def assert_project_workload_permission(
    user: User,
    project: Any,
    action: Literal["read", "write"],
    db: Optional[Any] = None,
) -> None:
    """Project > Workload tab: line-scoped read/write (admin bypasses)."""
    if db is not None:
        from ..services.project_visibility import is_project_visible_to_user

        if not is_project_visible_to_user(db, user, project):
            raise HTTPException(status_code=403, detail="Forbidden")
    line = getattr(project, "business_line", None)
    if not can_access_business_line(user, line):
        raise HTTPException(status_code=403, detail="Forbidden")
    if not _has_project_feature_permission(user, line, "workload", action):
        raise HTTPException(status_code=403, detail="Forbidden")


def _has_project_feature_permission(
    user: User,
    line: Optional[str],
    feature: str,
    action: Literal["read", "write"],
) -> bool:
    """Line-scoped feature permission (no legacy business:projects:* fallback)."""
    if _user_is_admin(user):
        return True
    prefix = _project_line_perm_prefix(line)
    read_k = f"{prefix}:{feature}:read"
    write_k = f"{prefix}:{feature}:write"
    if action == "write":
        return _has_permission(user, write_k)
    return _has_permission(user, read_k) or _has_permission(user, write_k)


def user_has_any_project_documents_permission(
    user: User, action: Literal["read", "write"]
) -> bool:
    """Global document-creator API guard when project line is unknown."""
    if _user_is_admin(user):
        return True
    keys = list(expand_project_permission_aliases(f"business:projects:documents:{action}"))
    if action == "read":
        keys.extend(expand_project_permission_aliases("business:projects:documents:write"))
    return any(_has_permission(user, k) for k in keys)


def user_has_any_project_safety_permission(
    user: User, action: Literal["read", "write"]
) -> bool:
    """Safety module / templates when project business line is unknown."""
    if _user_is_admin(user):
        return True
    keys = list(expand_project_permission_aliases(f"business:projects:safety:{action}"))
    if action == "read":
        keys.extend(expand_project_permission_aliases("business:projects:safety:write"))
    return any(_has_permission(user, k) for k in keys)


def _project_category_allow_list(
    perm_map: dict,
    line: Optional[str],
    feature: str,
    action: Literal["read", "write"],
):
    prefix = _project_line_perm_prefix(line)
    cfg_key = f"{prefix}:{feature}:categories:{action}"
    allow_list = perm_map.get(cfg_key, None)
    if isinstance(allow_list, list):
        return allow_list
    return None


def has_project_files_category_permission(
    user: User,
    category_id: Optional[str],
    action: Literal["read", "write"] = "read",
    project: Optional[Any] = None,
) -> bool:
    """
    Category-level access control for Project > Files.

    Rules:
    - Requires line-scoped (or legacy) files read/write for the project's business line.
    - If allow-list config exists in permissions_override, category must be included.
    - If allow-list config is missing, it means "all categories allowed" (default / compatibility).

    Notes:
    - Uncategorized files use `None` category; we treat it as "uncategorized" when comparing.
    - If `project` is passed, business-line access is checked.
    """
    if _user_is_admin(user):
        return True
    line = getattr(project, "business_line", None) if project is not None else None
    if project is not None and not can_access_business_line(user, line):
        return False
    if action not in ("read", "write"):
        return False

    if not _has_project_feature_permission(user, line, "files", action):
        return False

    perm_map = _get_user_permission_map(user)
    allow_list = _project_category_allow_list(perm_map, line, "files", action)

    # Missing config => allow all categories
    if not isinstance(allow_list, list):
        return True

    cat = (category_id or "uncategorized").strip() or "uncategorized"
    allowed = [str(x) for x in allow_list if isinstance(x, str)]
    if cat in allowed:
        return True
    cat_l = cat.lower()
    if cat_l in {a.lower() for a in allowed}:
        return True
    # Legacy slug overlap (Pictures vs photos)
    if cat_l in {"pictures", "photos"} and any(a.lower() in {"pictures", "photos"} for a in allowed):
        return True
    return False


def has_project_reports_category_permission(
    user: User,
    category_id: Optional[str],
    action: Literal["read", "write"] = "read",
    project: Optional[Any] = None,
) -> bool:
    """
    Category-level access control for Project > Notes/History (reports).

    Rules mirror Project > Files:
    - read: business:projects:reports:read OR business:projects:reports:write
    - write: business:projects:reports:write
    - Missing allow-list config => all categories allowed (default).
    """
    if _user_is_admin(user):
        return True
    line = getattr(project, "business_line", None) if project is not None else None
    if project is not None and not can_access_business_line(user, line):
        return False
    if action not in ("read", "write"):
        return False

    if not _has_project_feature_permission(user, line, "reports", action):
        return False

    perm_map = _get_user_permission_map(user)
    allow_list = _project_category_allow_list(perm_map, line, "reports", action)

    if not isinstance(allow_list, list):
        return True

    cat = (category_id or "uncategorized").strip() or "uncategorized"
    return cat in [str(x) for x in allow_list if isinstance(x, str)]


def can_approve_timesheet(approver: User, target_user_id: str, db: Session) -> bool:
    """Returns True if approver can approve target user's timesheet.
    Criteria: has timesheet:approve OR is in the manager chain of target (direct or indirect).
    """
    # Permission path
    if _has_permission(approver, "hr:timesheet:approve") or _has_permission(approver, "timesheet:approve"):
        return True
    # Supervisor chain path
    try:
        import uuid as _uuid
        from ..models.models import EmployeeProfile
        target = db.query(EmployeeProfile).filter(EmployeeProfile.user_id == _uuid.UUID(str(target_user_id))).first()
        visited = set()
        depth = 0
        while target and getattr(target, 'manager_user_id', None) and depth < 8:
            mgr_id = str(getattr(target, 'manager_user_id'))
            if not mgr_id or mgr_id in visited:
                break
            if str(approver.id) == mgr_id:
                return True
            visited.add(mgr_id)
            depth += 1
            target = db.query(EmployeeProfile).filter(EmployeeProfile.user_id == _uuid.UUID(mgr_id)).first()
    except Exception:
        return False
    return False