"""Global reusable custom lists for safety form template dropdown fields."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..auth.security import get_current_user, require_permissions
from ..db import get_db
from ..models.models import FormCustomList, FormCustomListItem, FormTemplate, FormTemplateVersion, User

router = APIRouter(prefix="/form-custom-lists", tags=["form-custom-lists"])

MAX_DEPTH = 3


def _definition_references_custom_list(definition: Any, list_id: uuid.UUID) -> bool:
    if not isinstance(definition, dict):
        return False
    lid = str(list_id)
    for sec in definition.get("sections") or []:
        if not isinstance(sec, dict):
            continue
        for f in sec.get("fields") or []:
            if not isinstance(f, dict):
                continue
            osrc = f.get("optionsSource")
            if isinstance(osrc, dict) and osrc.get("type") == "custom_list":
                if str(osrc.get("customListId") or "") == lid:
                    return True
    return False


def _template_ids_referencing_custom_list(db: Session, list_id: uuid.UUID) -> Set[uuid.UUID]:
    seen: Set[uuid.UUID] = set()
    for v in db.query(FormTemplateVersion).all():
        if _definition_references_custom_list(v.definition, list_id):
            seen.add(v.form_template_id)
    return seen


def _form_template_names_for_ids(db: Session, template_ids: Set[uuid.UUID]) -> List[str]:
    if not template_ids:
        return []
    rows = (
        db.query(FormTemplate.name)
        .filter(FormTemplate.id.in_(template_ids))
        .order_by(FormTemplate.name.asc())
        .all()
    )
    return [str(r[0] or "").strip() for r in rows if str(r[0] or "").strip()]


def count_forms_using_list(db: Session, list_id: uuid.UUID) -> int:
    return len(_template_ids_referencing_custom_list(db, list_id))


def _item_to_dict(row: FormCustomListItem, include_children: bool = False) -> dict:
    out: Dict[str, Any] = {
        "id": str(row.id),
        "list_id": str(row.list_id),
        "parent_id": str(row.parent_id) if row.parent_id else None,
        "name": row.name or "",
        "sort_order": int(row.sort_order),
        "depth": int(row.depth),
        "status": row.status or "active",
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }
    if include_children:
        out["children"] = []
    return out


def _list_to_dict(
    lst: FormCustomList,
    used_count: Optional[int] = None,
    used_form_names: Optional[List[str]] = None,
) -> dict:
    out = {
        "id": str(lst.id),
        "name": lst.name or "",
        "description": lst.description or "",
        "status": lst.status or "active",
        "created_at": lst.created_at.isoformat() if lst.created_at else None,
        "updated_at": lst.updated_at.isoformat() if lst.updated_at else None,
        "created_by": str(lst.created_by) if lst.created_by else None,
    }
    if used_count is not None:
        out["used_in_form_count"] = used_count
    if used_form_names is not None:
        out["used_in_form_names"] = used_form_names
    return out


def _build_tree(
    rows: List[FormCustomListItem],
    parent_id: Optional[uuid.UUID],
    for_runtime: bool,
) -> List[dict]:
    children = [r for r in rows if r.parent_id == parent_id]
    children.sort(key=lambda x: (x.sort_order, x.name or ""))
    out: List[dict] = []
    for r in children:
        if for_runtime and (r.status or "").lower() != "active":
            continue
        node = _item_to_dict(r, include_children=True)
        sub = _build_tree(rows, r.id, for_runtime)
        node["children"] = sub
        out.append(node)
    return out


def _ancestor_chain_active(rows_by_id: Dict[uuid.UUID, FormCustomListItem], item: FormCustomListItem) -> bool:
    cur: Optional[FormCustomListItem] = item
    guard = 0
    while cur is not None and guard < 5:
        if (cur.status or "").lower() != "active":
            return False
        cur = rows_by_id.get(cur.parent_id) if cur.parent_id else None
        guard += 1
    return True


def _ordered_leaf_options(
    rows: List[FormCustomListItem], for_runtime: bool, rows_by_id: Dict[uuid.UUID, FormCustomListItem]
) -> List[Dict[str, str]]:
    """Leaf nodes in DFS order (respects sort_order), with hierarchical labels."""
    active_rows = [r for r in rows if not for_runtime or (r.status or "").lower() == "active"]
    children: Dict[Optional[uuid.UUID], List[FormCustomListItem]] = {}
    for r in active_rows:
        children.setdefault(r.parent_id, []).append(r)
    for k in children:
        children[k].sort(key=lambda x: (x.sort_order, (x.name or "").lower()))

    out: List[Dict[str, str]] = []

    def visit(pid: Optional[uuid.UUID]) -> None:
        for c in children.get(pid, []):
            subs = children.get(c.id, [])
            if not subs:
                if not for_runtime or _ancestor_chain_active(rows_by_id, c):
                    out.append({"value": str(c.id), "label": _path_label(rows_by_id, c)})
            else:
                visit(c.id)

    visit(None)
    return out


def _path_label(rows_by_id: Dict[uuid.UUID, FormCustomListItem], item: FormCustomListItem) -> str:
    parts: List[str] = []
    cur: Optional[FormCustomListItem] = item
    guard = 0
    while cur is not None and guard < 5:
        parts.insert(0, cur.name or "")
        cur = rows_by_id.get(cur.parent_id) if cur.parent_id else None
        guard += 1
    return " › ".join(p for p in parts if p)


class FormCustomListCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    status: str = Field(default="active", max_length=20)


class FormCustomListUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    status: Optional[str] = Field(None, max_length=20)


class ItemCreate(BaseModel):
    parent_id: Optional[uuid.UUID] = None
    name: str = Field(..., min_length=1, max_length=500)
    sort_order: Optional[int] = None
    status: str = Field(default="active", max_length=20)


class ItemUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=500)
    sort_order: Optional[int] = None
    status: Optional[str] = Field(None, max_length=20)
    parent_id: Optional[uuid.UUID] = Field(None, description="Set to move item; omit to leave unchanged")


class ReorderBody(BaseModel):
    ordered_ids: List[uuid.UUID] = Field(..., min_length=1)


@router.get("")
def list_custom_lists(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _=Depends(require_permissions("business:projects:safety:read")),
    include_counts: bool = Query(True),
):
    rows = db.query(FormCustomList).order_by(FormCustomList.name.asc()).all()
    out: List[dict] = []
    for lst in rows:
        uc = count_forms_using_list(db, lst.id) if include_counts else None
        out.append(_list_to_dict(lst, used_count=uc))
    return out


@router.post("")
def create_custom_list(
    body: FormCustomListCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _=Depends(require_permissions("business:projects:safety:write")),
):
    st = (body.status or "active").strip().lower()
    if st not in ("active", "inactive"):
        raise HTTPException(status_code=400, detail="status must be active or inactive")
    lst = FormCustomList(
        name=body.name.strip(),
        description=(body.description or "").strip() or None,
        status=st,
        created_by=user.id,
    )
    db.add(lst)
    db.commit()
    db.refresh(lst)
    return _list_to_dict(lst, used_count=0, used_form_names=[])


@router.get("/{list_id}")
def get_custom_list(
    list_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _=Depends(require_permissions("business:projects:safety:read")),
    for_runtime: bool = Query(False, description="If true, omit inactive items from tree"),
):
    lid = uuid.UUID(str(list_id))
    lst = db.query(FormCustomList).filter(FormCustomList.id == lid).first()
    if not lst:
        raise HTTPException(status_code=404, detail="List not found")
    items = (
        db.query(FormCustomListItem)
        .filter(FormCustomListItem.list_id == lid)
        .order_by(FormCustomListItem.sort_order.asc(), FormCustomListItem.name.asc())
        .all()
    )
    tree = _build_tree(items, None, for_runtime=for_runtime)
    rows_by_id = {r.id: r for r in items}
    leaf_options = _ordered_leaf_options(items, for_runtime=for_runtime, rows_by_id=rows_by_id)
    uids = _template_ids_referencing_custom_list(db, lid)
    used_names = _form_template_names_for_ids(db, uids)
    return {
        **_list_to_dict(lst, used_count=len(uids), used_form_names=used_names),
        "items": tree,
        "leaf_options": leaf_options,
    }


@router.patch("/{list_id}")
def update_custom_list_meta(
    list_id: str,
    body: FormCustomListUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _=Depends(require_permissions("business:projects:safety:write")),
):
    lid = uuid.UUID(str(list_id))
    lst = db.query(FormCustomList).filter(FormCustomList.id == lid).first()
    if not lst:
        raise HTTPException(status_code=404, detail="List not found")
    if body.name is not None:
        lst.name = body.name.strip()
    if body.description is not None:
        lst.description = body.description.strip() or None
    if body.status is not None:
        st = body.status.strip().lower()
        if st not in ("active", "inactive"):
            raise HTTPException(status_code=400, detail="status must be active or inactive")
        lst.status = st
    lst.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(lst)
    uids = _template_ids_referencing_custom_list(db, lid)
    used_names = _form_template_names_for_ids(db, uids)
    return _list_to_dict(lst, used_count=len(uids), used_form_names=used_names)


@router.delete("/{list_id}")
def delete_custom_list(
    list_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _=Depends(require_permissions("business:projects:safety:write")),
):
    lid = uuid.UUID(str(list_id))
    lst = db.query(FormCustomList).filter(FormCustomList.id == lid).first()
    if not lst:
        raise HTTPException(status_code=404, detail="List not found")
    if count_forms_using_list(db, lid) > 0:
        raise HTTPException(status_code=400, detail="Cannot delete a list that is used in form templates")
    db.delete(lst)
    db.commit()
    return {"ok": True}


@router.post("/{list_id}/items")
def create_item(
    list_id: str,
    body: ItemCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _=Depends(require_permissions("business:projects:safety:write")),
):
    lid = uuid.UUID(str(list_id))
    lst = db.query(FormCustomList).filter(FormCustomList.id == lid).first()
    if not lst:
        raise HTTPException(status_code=404, detail="List not found")
    depth = 1
    parent: Optional[FormCustomListItem] = None
    if body.parent_id:
        parent = (
            db.query(FormCustomListItem)
            .filter(FormCustomListItem.id == body.parent_id, FormCustomListItem.list_id == lid)
            .first()
        )
        if not parent:
            raise HTTPException(status_code=400, detail="parent_id not found in this list")
        depth = int(parent.depth) + 1
        if depth > MAX_DEPTH:
            raise HTTPException(status_code=400, detail="Maximum hierarchy depth is 3")
        if int(parent.depth) >= MAX_DEPTH:
            raise HTTPException(status_code=400, detail="Cannot add children under a level-3 item")
    st = (body.status or "active").strip().lower()
    if st not in ("active", "inactive"):
        raise HTTPException(status_code=400, detail="item status must be active or inactive")
    max_so = (
        db.query(FormCustomListItem.sort_order)
        .filter(FormCustomListItem.list_id == lid, FormCustomListItem.parent_id == body.parent_id)
        .order_by(FormCustomListItem.sort_order.desc())
        .first()
    )
    next_order = (max_so[0] + 1) if max_so and max_so[0] is not None else 0
    sort_order = body.sort_order if body.sort_order is not None else next_order
    row = FormCustomListItem(
        list_id=lid,
        parent_id=body.parent_id,
        name=body.name.strip(),
        sort_order=sort_order,
        depth=depth,
        status=st,
    )
    db.add(row)
    lst.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(row)
    return _item_to_dict(row)


def _subtree_height(db: Session, root_id: uuid.UUID) -> int:
    """Max distance from root to any descendant (0 if leaf)."""
    ch = db.query(FormCustomListItem).filter(FormCustomListItem.parent_id == root_id).all()
    if not ch:
        return 0
    return 1 + max(_subtree_height(db, c.id) for c in ch)


def _set_descendant_depths(db: Session, parent_id: uuid.UUID, parent_depth: int) -> None:
    for c in db.query(FormCustomListItem).filter(FormCustomListItem.parent_id == parent_id).all():
        c.depth = parent_depth + 1
        _set_descendant_depths(db, c.id, c.depth)


@router.patch("/items/{item_id}")
def update_item(
    item_id: str,
    body: ItemUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _=Depends(require_permissions("business:projects:safety:write")),
):
    iid = uuid.UUID(str(item_id))
    row = db.query(FormCustomListItem).filter(FormCustomListItem.id == iid).first()
    if not row:
        raise HTTPException(status_code=404, detail="Item not found")
    lst = db.query(FormCustomList).filter(FormCustomList.id == row.list_id).first()
    patch = body.model_dump(exclude_unset=True)
    if "parent_id" in patch:
        new_pid = patch["parent_id"]
        if new_pid == row.id:
            raise HTTPException(status_code=400, detail="Item cannot be its own parent")
        if new_pid is not None:
            walk = new_pid
            guard = 0
            while walk is not None and guard < 10:
                if walk == row.id:
                    raise HTTPException(status_code=400, detail="Cannot move an item under its descendant")
                p = db.query(FormCustomListItem.parent_id).filter(FormCustomListItem.id == walk).first()
                walk = p[0] if p else None
                guard += 1
        depth = 1
        if new_pid is not None:
            np = (
                db.query(FormCustomListItem)
                .filter(FormCustomListItem.id == new_pid, FormCustomListItem.list_id == row.list_id)
                .first()
            )
            if not np:
                raise HTTPException(status_code=400, detail="parent_id not found in this list")
            depth = int(np.depth) + 1
            if int(np.depth) >= MAX_DEPTH:
                raise HTTPException(status_code=400, detail="Cannot add children under a level-3 item")
        below = _subtree_height(db, row.id)
        if depth + below > MAX_DEPTH:
            raise HTTPException(status_code=400, detail="Move would exceed maximum depth of 3")
        row.parent_id = new_pid
        row.depth = depth
        _set_descendant_depths(db, row.id, row.depth)

    if body.name is not None:
        row.name = body.name.strip()
    if body.sort_order is not None:
        row.sort_order = body.sort_order
    if body.status is not None:
        st = body.status.strip().lower()
        if st not in ("active", "inactive"):
            raise HTTPException(status_code=400, detail="item status must be active or inactive")
        row.status = st
    row.updated_at = datetime.now(timezone.utc)
    if lst:
        lst.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(row)
    return _item_to_dict(row)


@router.delete("/items/{item_id}")
def delete_item(
    item_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _=Depends(require_permissions("business:projects:safety:write")),
):
    iid = uuid.UUID(str(item_id))
    row = db.query(FormCustomListItem).filter(FormCustomListItem.id == iid).first()
    if not row:
        raise HTTPException(status_code=404, detail="Item not found")
    lst = db.query(FormCustomList).filter(FormCustomList.id == row.list_id).first()
    db.delete(row)
    if lst:
        lst.updated_at = datetime.now(timezone.utc)
    db.commit()
    return {"ok": True}


@router.post("/{list_id}/items/reorder")
def reorder_items(
    list_id: str,
    body: ReorderBody,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _=Depends(require_permissions("business:projects:safety:write")),
    parent_id: Optional[str] = Query(None, description="Parent item id for sibling group; omit for roots"),
):
    lid = uuid.UUID(str(list_id))
    lst = db.query(FormCustomList).filter(FormCustomList.id == lid).first()
    if not lst:
        raise HTTPException(status_code=404, detail="List not found")
    pid = uuid.UUID(parent_id) if parent_id else None
    rows = (
        db.query(FormCustomListItem)
        .filter(FormCustomListItem.list_id == lid, FormCustomListItem.parent_id == pid)
        .all()
    )
    by_id = {r.id: r for r in rows}
    for i, uid in enumerate(body.ordered_ids):
        r = by_id.get(uid)
        if not r:
            raise HTTPException(status_code=400, detail="ordered_ids must be siblings in the same group")
        r.sort_order = i
        r.updated_at = datetime.now(timezone.utc)
    lst.updated_at = datetime.now(timezone.utc)
    db.commit()
    return {"ok": True}


@router.get("/{list_id}/usage")
def get_usage_count(
    list_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _=Depends(require_permissions("business:projects:safety:read")),
):
    lid = uuid.UUID(str(list_id))
    lst = db.query(FormCustomList).filter(FormCustomList.id == lid).first()
    if not lst:
        raise HTTPException(status_code=404, detail="List not found")
    return {"used_in_form_count": count_forms_using_list(db, lid)}
