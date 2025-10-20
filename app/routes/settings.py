from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List, Optional

from ..db import get_db
from ..models.models import SettingList, SettingItem, Client
from ..auth.security import require_permissions

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("")
def get_settings_bundle(db: Session = Depends(get_db)):
    rows = db.query(SettingList).all()
    out = {}
    for lst in rows:
        items = db.query(SettingItem).filter(SettingItem.list_id == lst.id).order_by(SettingItem.sort_index.asc()).all()
        out[lst.name] = [{"id": str(i.id), "label": i.label, "value": i.value, "sort_index": i.sort_index} for i in items]
    # convenience aliases
    out.setdefault("client_types", [])
    out.setdefault("client_statuses", [])
    out.setdefault("payment_terms", [])
    return out


@router.get("/{list_name}")
def list_settings(list_name: str, db: Session = Depends(get_db)):
    lst = db.query(SettingList).filter(SettingList.name == list_name).first()
    if not lst:
        return []
    items = db.query(SettingItem).filter(SettingItem.list_id == lst.id).order_by(SettingItem.sort_index.asc()).all()
    return [{"id": str(i.id), "label": i.label, "value": i.value, "sort_index": i.sort_index} for i in items]


@router.post("/{list_name}")
def create_setting_item(list_name: str, label: str, value: str = "", sort_index: Optional[int] = None, db: Session = Depends(get_db), _=Depends(require_permissions("users:write"))):
    lst = db.query(SettingList).filter(SettingList.name == list_name).first()
    if not lst:
        lst = SettingList(name=list_name)
        db.add(lst)
        db.flush()
    # Auto-assign sort_index if not provided to keep stable ordering and avoid renumbering
    if sort_index is None:
        last = db.query(SettingItem).filter(SettingItem.list_id == lst.id).order_by(SettingItem.sort_index.desc()).first()
        sort_index = ((last.sort_index or 0) + 1) if last and (last.sort_index is not None) else 0
    it = SettingItem(list_id=lst.id, label=label, value=value, sort_index=sort_index)
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
def update_setting_item(list_name: str, item_id: str, label: str = None, value: str = None, sort_index: int | None = None, db: Session = Depends(get_db), _=Depends(require_permissions("users:write"))):
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
    db.commit()
    # Propagate label rename to referencing records (non-destructive; only on rename, not on delete)
    if label_changed and label:
        if list_name == "client_statuses":
            db.query(Client).filter(Client.client_status == old_label).update({Client.client_status: label}, synchronize_session=False)
            db.commit()
        elif list_name == "client_types":
            db.query(Client).filter(Client.client_type == old_label).update({Client.client_type: label}, synchronize_session=False)
            db.commit()
    return {"status": "ok"}
