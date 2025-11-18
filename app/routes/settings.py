from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, defer
from sqlalchemy.exc import ProgrammingError
from typing import List, Optional

from ..db import get_db
from ..models.models import SettingList, SettingItem, Client
from ..auth.security import require_permissions
from ..config import settings

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("")
def get_settings_bundle(db: Session = Depends(get_db)):
    rows = db.query(SettingList).all()
    out = {}
    for lst in rows:
        items = db.query(SettingItem).filter(SettingItem.list_id == lst.id).order_by(SettingItem.sort_index.asc()).all()
        out[lst.name] = [{"id": str(i.id), "label": i.label, "value": i.value, "sort_index": i.sort_index, "meta": i.meta or None} for i in items]
    # convenience aliases
    out.setdefault("client_types", [])
    out.setdefault("client_statuses", [])
    out.setdefault("payment_terms", [])
    out.setdefault("divisions", [])
    out.setdefault("project_statuses", [])
    out.setdefault("lead_sources", [])
    out.setdefault("timesheet", [])
    # Add Google Places API key (if configured)
    if settings.google_places_api_key:
        out["google_places_api_key"] = settings.google_places_api_key
    return out


@router.get("/{list_name}")
def list_settings(list_name: str, db: Session = Depends(get_db)):
    lst = db.query(SettingList).filter(SettingList.name == list_name).first()
    if not lst:
        return []
    items = db.query(SettingItem).filter(SettingItem.list_id == lst.id).order_by(SettingItem.sort_index.asc()).all()
    return [{"id": str(i.id), "label": i.label, "value": i.value, "sort_index": i.sort_index, "meta": i.meta or None} for i in items]


@router.post("/{list_name}")
def create_setting_item(list_name: str, label: str, value: str = "", sort_index: Optional[int] = None, abbr: Optional[str] = None, color: Optional[str] = None, db: Session = Depends(get_db), _=Depends(require_permissions("users:write"))):
    lst = db.query(SettingList).filter(SettingList.name == list_name).first()
    if not lst:
        lst = SettingList(name=list_name)
        db.add(lst)
        db.flush()
    # Auto-assign sort_index if not provided to keep stable ordering and avoid renumbering
    if sort_index is None:
        last = db.query(SettingItem).filter(SettingItem.list_id == lst.id).order_by(SettingItem.sort_index.desc()).first()
        sort_index = ((last.sort_index or 0) + 1) if last and (last.sort_index is not None) else 0
    meta = {}
    if abbr:
        meta["abbr"] = abbr
    if color:
        meta["color"] = color
    it = SettingItem(list_id=lst.id, label=label, value=value, sort_index=sort_index, meta=meta or None)
    db.add(it)
    db.commit()
    return {"id": str(it.id)}


@router.delete("/{list_name}/{item_id}")
def delete_setting_item(list_name: str, item_id: str, db: Session = Depends(get_db), _=Depends(require_permissions("users:write"))):
    lst = db.query(SettingList).filter(SettingList.name == list_name).first()
    if not lst:
        return {"status": "ok"}
    db.query(SettingItem).filter(SettingItem.list_id == lst.id, SettingItem.id == item_id).delete()
    db.commit()
    return {"status": "ok"}


@router.put("/{list_name}/{item_id}")
def update_setting_item(list_name: str, item_id: str, label: str = None, value: str = None, sort_index: int | None = None, abbr: Optional[str] = None, color: Optional[str] = None, allow_edit_proposal: Optional[str] = None, sets_start_date: Optional[str] = None, sets_end_date: Optional[str] = None, db: Session = Depends(get_db), _=Depends(require_permissions("users:write"))):
    lst = db.query(SettingList).filter(SettingList.name == list_name).first()
    if not lst:
        return {"status": "ok"}
    it = db.query(SettingItem).filter(SettingItem.list_id == lst.id, SettingItem.id == item_id).first()
    if not it:
        return {"status": "ok"}
    old_label = it.label
    label_changed = label is not None and label != old_label
    if label is not None:
        it.label = label
    if value is not None:
        it.value = value
    if sort_index is not None:
        it.sort_index = sort_index
    # update meta
    meta = dict(it.meta or {})
    if abbr is not None:
        meta["abbr"] = abbr
    if color is not None:
        meta["color"] = color
    if allow_edit_proposal is not None:
        # Convert string to boolean
        meta["allow_edit_proposal"] = allow_edit_proposal.lower() in ('true', '1', 'yes')
    if sets_start_date is not None:
        # Convert string to boolean
        meta["sets_start_date"] = sets_start_date.lower() in ('true', '1', 'yes')
    if sets_end_date is not None:
        # Convert string to boolean
        meta["sets_end_date"] = sets_end_date.lower() in ('true', '1', 'yes')
    # Always set meta (even if empty dict) to ensure meta fields are preserved
    it.meta = meta
    db.commit()
    # Propagate label rename to referencing records (non-destructive; only on rename, not on delete)
    if label_changed and label:
        try:
            if list_name == "client_statuses":
                db.query(Client).filter(Client.client_status == old_label).update({Client.client_status: label}, synchronize_session=False)
                db.commit()
            elif list_name == "client_types":
                db.query(Client).filter(Client.client_type == old_label).update({Client.client_type: label}, synchronize_session=False)
                db.commit()
            elif list_name == "lead_sources":
                db.query(Client).filter(Client.lead_source == old_label).update({Client.lead_source: label}, synchronize_session=False)
                db.commit()
        except ProgrammingError as e:
            error_msg = str(e.orig) if hasattr(e, 'orig') else str(e)
            if 'is_system' in error_msg and 'does not exist' in error_msg:
                db.rollback()
                # Retry with defer to avoid loading is_system column
                if list_name == "client_statuses":
                    db.query(Client).options(defer(Client.is_system)).filter(Client.client_status == old_label).update({Client.client_status: label}, synchronize_session=False)
                    db.commit()
                elif list_name == "client_types":
                    db.query(Client).options(defer(Client.is_system)).filter(Client.client_type == old_label).update({Client.client_type: label}, synchronize_session=False)
                    db.commit()
                elif list_name == "lead_sources":
                    db.query(Client).options(defer(Client.is_system)).filter(Client.lead_source == old_label).update({Client.lead_source: label}, synchronize_session=False)
                    db.commit()
            else:
                raise
    return {"status": "ok"}
