"""Business line (Construction vs Repairs & Maintenance) for projects/opportunities."""
from __future__ import annotations

from typing import TYPE_CHECKING, Optional, Set

from sqlalchemy.orm import Session

if TYPE_CHECKING:
    from ..models.models import Project

BUSINESS_LINE_CONSTRUCTION = "construction"
BUSINESS_LINE_REPAIRS_MAINTENANCE = "repairs_maintenance"

VALID_BUSINESS_LINES = frozenset({BUSINESS_LINE_CONSTRUCTION, BUSINESS_LINE_REPAIRS_MAINTENANCE})


def normalize_business_line(raw: Optional[str]) -> str:
    if not raw or str(raw).strip() == "":
        return BUSINESS_LINE_CONSTRUCTION
    s = str(raw).strip().lower().replace("-", "_")
    if s in ("rm", "repairs_maintenance", "repairsandmaintenance"):
        return BUSINESS_LINE_REPAIRS_MAINTENANCE
    if s in ("construction", "default", "core"):
        return BUSINESS_LINE_CONSTRUCTION
    return BUSINESS_LINE_CONSTRUCTION if s not in VALID_BUSINESS_LINES else s


def repairs_maintenance_division_ids(db: Session) -> Set[str]:
    """UUID strings for Repairs & Maintenance division and its subdivisions (if any)."""
    from ..models.models import SettingList, SettingItem

    out: Set[str] = set()
    divisions_list = db.query(SettingList).filter(SettingList.name == "project_divisions").first()
    if not divisions_list:
        return out
    rm_item = (
        db.query(SettingItem)
        .filter(
            SettingItem.list_id == divisions_list.id,
            SettingItem.parent_id.is_(None),
            SettingItem.label == "Repairs & Maintenance",
        )
        .first()
    )
    if not rm_item:
        return out
    out.add(str(rm_item.id))
    for child in db.query(SettingItem).filter(SettingItem.parent_id == rm_item.id).all():
        out.add(str(child.id))
    return out


def project_linked_to_rm_division(p: Project, rm_ids: Set[str]) -> bool:
    """True if project references Repairs & Maintenance in any legacy field."""
    if not rm_ids:
        return False
    did = getattr(p, "division_id", None)
    if did is not None and str(did) in rm_ids:
        return True
    for key in ("division_ids", "project_division_ids"):
        arr = getattr(p, key, None) or []
        if isinstance(arr, list):
            for x in arr:
                if x is not None and str(x) in rm_ids:
                    return True
    return False


def backfill_business_line_column(db: Session, *, do_commit: bool = True) -> None:
    """Set business_line from Repairs & Maintenance division match; default construction."""
    from ..models.models import Project

    rm_ids = repairs_maintenance_division_ids(db)
    q = db.query(Project).filter(Project.deleted_at.is_(None))
    for p in q.all():
        line = BUSINESS_LINE_REPAIRS_MAINTENANCE if project_linked_to_rm_division(p, rm_ids) else BUSINESS_LINE_CONSTRUCTION
        if getattr(p, "business_line", None) != line:
            p.business_line = line
    if do_commit:
        db.commit()
