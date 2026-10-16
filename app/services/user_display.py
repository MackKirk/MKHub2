"""Labels and text match for people search (preferred name plus legal name)."""

from typing import Optional

from sqlalchemy import func, literal, or_

from ..models.models import EmployeeProfile, User


def user_search_label(
    *,
    preferred_name: Optional[str] = None,
    first_name: Optional[str] = None,
    last_name: Optional[str] = None,
    username: Optional[str] = None,
    email: Optional[str] = None,
    fallback: Optional[str] = None,
) -> str:
    """Preferred name, with legal first and last in parentheses when they differ."""
    first = (first_name or "").strip()
    last = (last_name or "").strip()
    legal = " ".join(part for part in (first, last) if part).strip()
    preferred = (preferred_name or "").strip()
    if preferred and legal:
        if preferred.casefold() == legal.casefold():
            return preferred
        return f"{preferred} ({legal})"
    if preferred:
        return preferred
    if legal:
        return legal
    handle = (username or "").strip()
    if handle:
        return handle
    mail = (email or "").strip()
    if mail:
        return mail
    return (fallback or "").strip()


def profile_search_label(user: User, profile: Optional[EmployeeProfile]) -> str:
    return user_search_label(
        preferred_name=getattr(profile, "preferred_name", None) if profile else None,
        first_name=getattr(profile, "first_name", None) if profile else None,
        last_name=getattr(profile, "last_name", None) if profile else None,
        username=getattr(user, "username", None),
        email=getattr(user, "email_personal", None),
        fallback=str(getattr(user, "id", "") or ""),
    )


def employee_name_match(like: str, *, include_email: bool = True):
    """Match username, preferred name, first, last, middle, and 'first last' together."""
    full_name = func.trim(
        func.concat(
            func.coalesce(EmployeeProfile.first_name, ""),
            literal(" "),
            func.coalesce(EmployeeProfile.last_name, ""),
        )
    )
    clauses = [
        User.username.ilike(like),
        EmployeeProfile.first_name.ilike(like),
        EmployeeProfile.last_name.ilike(like),
        EmployeeProfile.middle_name.ilike(like),
        EmployeeProfile.preferred_name.ilike(like),
        full_name.ilike(like),
    ]
    if include_email:
        clauses.append(User.email_personal.ilike(like))
    return or_(*clauses)
