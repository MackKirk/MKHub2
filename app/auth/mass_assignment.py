"""Drop identity / lifecycle keys from untyped PATCH dicts before setattr."""

from __future__ import annotations

from typing import Any, Iterable, Mapping

# Fields the UI never legitimately sets via generic JSON PATCH.
IMMUTABLE_ORM_FIELDS = frozenset(
    {
        "id",
        "created_at",
        "created_by",
        "created_by_id",
        "created_by_user_id",
        "updated_at",
        "updated_by",
        "deleted_at",
        "deleted_by_id",
        "is_system",
        "password_hash",
        "permissions_override",
    }
)


def sanitize_orm_patch(
    payload: Mapping[str, Any] | None,
    extra_blocked: Iterable[str] = (),
) -> dict[str, Any]:
    """Return a copy of payload without immutable keys. Unknown keys still pass (allowlist later)."""
    if not payload:
        return {}
    blocked = IMMUTABLE_ORM_FIELDS | {str(k) for k in extra_blocked}
    return {k: v for k, v in payload.items() if k not in blocked}
