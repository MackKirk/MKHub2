from fastapi import APIRouter, Depends

from ..auth.security import get_current_user


router = APIRouter(prefix="/calendar", tags=["calendar"])


@router.get("/me")
def calendar_me(user=Depends(get_current_user)):
    return []


@router.get("/shared")
def calendar_shared(account: str | None = None):
    return []


@router.post("/sync")
def calendar_sync():
    return {"status": "scheduled"}

