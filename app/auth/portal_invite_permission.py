"""Staff permission gate for inviting customers to the Hub portal."""
from __future__ import annotations

from fastapi import Depends, HTTPException

from ..models.models import User
from .security import _has_permission, _user_is_admin, get_current_user


def staff_can_invite_to_portal(user: User) -> bool:
    if _user_is_admin(user):
        return True
    if not _has_permission(user, "business:customers:write"):
        return False
    return (
        _has_permission(user, "business:projects:write")
        or _has_permission(user, "business:construction:projects:write")
        or _has_permission(user, "business:rm:projects:write")
    )


def require_portal_invite_permission(user: User = Depends(get_current_user)) -> User:
    if not staff_can_invite_to_portal(user):
        raise HTTPException(
            status_code=403,
            detail="Forbidden: requires business:customers:write and projects write",
        )
    return user
