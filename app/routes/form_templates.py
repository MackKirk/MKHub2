"""Safety form templates: single editable definition per template (last save wins)."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import or_
from sqlalchemy.orm import Session

from ..auth.security import get_current_user, require_permissions
from ..services.safety_sign_request_access import assert_safety_read_or_pending_sign_session
from ..db import get_db
from ..models.models import FormCustomList, FormTemplate, FleetAsset, User

router = APIRouter(prefix="/form-templates", tags=["form-templates"])

ALLOWED_FIELD_TYPES = frozenset(
    {
        "pass_fail_na",
        "checkbox",
        "short_text",
        "long_text",
        "text_info",
        "dropdown_single",
        "dropdown_multi",
        "yes_no_na",
        "pass_fail_total",
        "number",
        "date",
        "time",
        "user_single",
        "user_multi",
        "image_view",
        "pdf_insert",
        "pdf_view",
        "gps",
        "equipment_single",
        "equipment_multi",
    }
)

_VISIBILITY_OPS = frozenset({"equals", "in", "notEmpty"})
_PASS_FAIL_TOTAL_MODES = frozenset({"manual", "aggregate"})
_SIGNATURE_MODES = frozenset({"typed", "drawn", "any"})


def default_definition() -> dict:
    return {"sections": [], "signature_policy": {"worker": {"required": False}}}


def _normalize_definition(raw: Any) -> dict:
    if not isinstance(raw, dict):
        return default_definition()
    base = default_definition()
    if "sections" in raw and isinstance(raw["sections"], list):
        base["sections"] = raw["sections"]
    if "signature_policy" in raw and isinstance(raw["signature_policy"], dict):
        base["signature_policy"] = raw["signature_policy"]
    return base


def _collect_field_keys(definition: dict) -> set:
    keys = set()
    for sec in definition.get("sections") or []:
        if not isinstance(sec, dict):
            continue
        for f in sec.get("fields") or []:
            if not isinstance(f, dict):
                continue
            k = f.get("key")
            if isinstance(k, str) and k.strip():
                keys.add(k.strip())
    return keys


def _validate_field_visibility(f: dict, all_keys: set) -> None:
    vis = f.get("visibility")
    if vis is None:
        return
    if not isinstance(vis, dict):
        raise HTTPException(status_code=400, detail="field.visibility must be an object")
    when = vis.get("when")
    if when is None:
        return
    if not isinstance(when, dict):
        raise HTTPException(status_code=400, detail="field.visibility.when must be an object")
    fk = when.get("fieldKey")
    if fk is not None:
        if not isinstance(fk, str) or not fk.strip():
            raise HTTPException(status_code=400, detail="visibility.when.fieldKey invalid")
        if fk.strip() not in all_keys:
            raise HTTPException(status_code=400, detail=f"visibility references unknown fieldKey: {fk}")
    op = when.get("op")
    if op is not None and op not in _VISIBILITY_OPS:
        raise HTTPException(status_code=400, detail="visibility.when.op invalid")
    if op == "in" and when.get("value") is not None and not isinstance(when.get("value"), list):
        raise HTTPException(status_code=400, detail="visibility.when.value must be an array for op 'in'")


def _validate_signature_policy(definition: dict) -> None:
    sp = definition.get("signature_policy")
    if not isinstance(sp, dict):
        return
    for role in ("worker", "supervisor"):
        w = sp.get(role)
        if not isinstance(w, dict):
            continue
        mode = w.get("mode")
        if mode is not None and mode not in _SIGNATURE_MODES:
            raise HTTPException(status_code=400, detail=f"signature_policy.{role}.mode invalid")


def _validate_dropdown_custom_lists(db: Session, definition: dict) -> None:
    """Dropdown fields must use optionsSource.custom_list (active list) or legacy inline options."""
    for i, sec in enumerate(definition.get("sections") or []):
        if not isinstance(sec, dict):
            continue
        for j, f in enumerate(sec.get("fields") or []):
            if not isinstance(f, dict):
                continue
            t = f.get("type")
            if t not in ("dropdown_single", "dropdown_multi"):
                continue
            osrc = f.get("optionsSource")
            legacy_opts = f.get("options")
            has_legacy = isinstance(legacy_opts, list) and len(legacy_opts) > 0
            if isinstance(osrc, dict) and osrc.get("type") == "custom_list":
                raw_id = osrc.get("customListId")
                if not raw_id:
                    raise HTTPException(
                        status_code=400,
                        detail=f"definition.sections[{i}].fields[{j}]: optionsSource.customListId required",
                    )
                try:
                    lid = uuid.UUID(str(raw_id))
                except ValueError:
                    raise HTTPException(
                        status_code=400,
                        detail=f"definition.sections[{i}].fields[{j}]: invalid customListId",
                    )
                lst = db.query(FormCustomList).filter(FormCustomList.id == lid).first()
                if not lst:
                    raise HTTPException(
                        status_code=400,
                        detail=f"definition.sections[{i}].fields[{j}]: custom list not found",
                    )
                if (lst.status or "").lower() != "active":
                    raise HTTPException(
                        status_code=400,
                        detail=f"definition.sections[{i}].fields[{j}]: custom list must be active",
                    )
            elif has_legacy:
                continue
            else:
                raise HTTPException(
                    status_code=400,
                    detail=f"definition.sections[{i}].fields[{j}]: dropdown must set optionsSource (custom_list) or legacy options",
                )


def _validate_definition_structure(definition: dict) -> None:
    sections = definition.get("sections")
    if not isinstance(sections, list):
        raise HTTPException(status_code=400, detail="definition.sections must be an array")
    all_keys = _collect_field_keys(definition)
    _validate_signature_policy(definition)
    for i, sec in enumerate(sections):
        if not isinstance(sec, dict):
            raise HTTPException(status_code=400, detail=f"definition.sections[{i}] must be an object")
        fields = sec.get("fields")
        if fields is not None and not isinstance(fields, list):
            raise HTTPException(status_code=400, detail=f"definition.sections[{i}].fields must be an array")
        for j, f in enumerate(fields or []):
            if not isinstance(f, dict):
                raise HTTPException(status_code=400, detail=f"definition.sections[{i}].fields[{j}] must be an object")
            t = f.get("type")
            if t is not None and t not in ALLOWED_FIELD_TYPES:
                raise HTTPException(status_code=400, detail=f"Unsupported field type: {t}")
            _validate_field_visibility(f, all_keys)
            if t == "pass_fail_total":
                st = f.get("settings")
                if isinstance(st, dict):
                    m = st.get("mode")
                    if m is not None and m not in _PASS_FAIL_TOTAL_MODES:
                        raise HTTPException(status_code=400, detail="pass_fail_total.settings.mode must be manual or aggregate")


def _template_to_dict(t: FormTemplate, *, include_definition: bool = False) -> dict:
    out = {
        "id": str(t.id),
        "name": t.name or "",
        "description": t.description or "",
        "category": t.category or "inspection",
        "status": t.status or "active",
        "version_label": (t.version_label or "").strip() if getattr(t, "version_label", None) is not None else "",
        "created_at": t.created_at.isoformat() if t.created_at else None,
        "updated_at": t.updated_at.isoformat() if t.updated_at else None,
        "created_by": str(t.created_by) if t.created_by else None,
    }
    if include_definition:
        d = getattr(t, "definition", None)
        out["definition"] = d if isinstance(d, dict) else default_definition()
    return out


class FormTemplateCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    category: str = Field(default="inspection", max_length=100)
    status: str = Field(default="active", max_length=20)


class FormTemplateUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    category: Optional[str] = Field(None, max_length=100)
    status: Optional[str] = Field(None, max_length=20)
    definition: Optional[dict] = None
    version_label: Optional[str] = Field(None, max_length=100)


def _definition_has_sections(definition: dict) -> bool:
    s = definition.get("sections")
    return isinstance(s, list) and len(s) > 0


@router.get("")
def list_form_templates(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _=Depends(require_permissions("business:projects:safety:read")),
    category: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    schedulable: bool = Query(False, description="If true, only templates usable for new inspections"),
    sort: str = Query("name", description="name | created_at | updated_at"),
    sort_dir: str = Query("asc", description="asc | desc"),
):
    q = db.query(FormTemplate)
    if category and category.strip():
        q = q.filter(FormTemplate.category == category.strip())
    if status and status.strip():
        q = q.filter(FormTemplate.status == status.strip())
    rows: List[FormTemplate] = q.all()

    if schedulable:
        rows = [t for t in rows if (t.status or "").lower() == "active" and _definition_has_sections(_normalize_definition(t.definition or {}))]

    sort_key = (sort or "name").strip().lower()
    asc_dir = (sort_dir or "asc").lower() != "desc"
    if sort_key == "created_at":
        rows.sort(key=lambda t: t.created_at or datetime.min.replace(tzinfo=timezone.utc), reverse=not asc_dir)
    elif sort_key == "updated_at":
        rows.sort(key=lambda t: t.updated_at or t.created_at or datetime.min.replace(tzinfo=timezone.utc), reverse=not asc_dir)
    else:
        rows.sort(key=lambda t: (t.name or "").lower(), reverse=not asc_dir)

    return [_template_to_dict(t) for t in rows]


@router.post("")
def create_form_template(
    body: FormTemplateCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _=Depends(require_permissions("business:projects:safety:write")),
):
    st = (body.status or "active").strip().lower()
    if st not in ("active", "inactive"):
        raise HTTPException(status_code=400, detail="status must be active or inactive")
    t = FormTemplate(
        name=body.name.strip(),
        description=(body.description or "").strip() or None,
        category=(body.category or "inspection").strip() or "inspection",
        status=st,
        definition=default_definition(),
        version_label="",
        created_by=user.id,
    )
    db.add(t)
    db.commit()
    db.refresh(t)
    return _template_to_dict(t, include_definition=True)


@router.get("/support/fleet-assets")
def support_fleet_assets_for_form_templates(
    q: Optional[str] = Query(None, description="Search name, unit #, plate"),
    limit: int = Query(100, ge=1, le=200),
    sign_project_id: Optional[str] = Query(None),
    sign_inspection_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    assert_safety_read_or_pending_sign_session(
        user, db, sign_project_id=sign_project_id, sign_inspection_id=sign_inspection_id
    )
    """Minimal fleet asset list for safety form pickers (no fleet:* permission required)."""
    query = db.query(FleetAsset).filter(FleetAsset.status == "active")
    if q and q.strip():
        term = f"%{q.strip()}%"
        query = query.filter(
            or_(
                FleetAsset.name.ilike(term),
                FleetAsset.unit_number.ilike(term),
                FleetAsset.license_plate.ilike(term),
                FleetAsset.vin.ilike(term),
            )
        )
    rows = query.order_by(FleetAsset.name.asc()).limit(limit).all()
    out: List[dict] = []
    for a in rows:
        sub = " — ".join(
            x for x in [a.unit_number, a.license_plate] if x and str(x).strip()
        ) or (a.equipment_type_label or "")
        label = f"{a.name or 'Asset'}"
        if sub:
            label = f"{label} ({sub})"
        out.append({"id": str(a.id), "label": label})
    return out


@router.post("/{template_id}/duplicate")
def duplicate_form_template(
    template_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _=Depends(require_permissions("business:projects:safety:write")),
):
    tid = uuid.UUID(str(template_id))
    src = db.query(FormTemplate).filter(FormTemplate.id == tid).first()
    if not src:
        raise HTTPException(status_code=404, detail="Template not found")
    base_name = (src.name or "Untitled").strip() or "Untitled"
    dup = FormTemplate(
        name=f"{base_name} (copy)",
        description=src.description,
        category=src.category or "inspection",
        status=src.status or "active",
        definition=_normalize_definition(src.definition or {}),
        version_label="",
        created_by=user.id,
    )
    db.add(dup)
    db.commit()
    db.refresh(dup)
    return {"id": str(dup.id)}


@router.get("/{template_id}")
def get_form_template(
    template_id: str,
    sign_project_id: Optional[str] = Query(None),
    sign_inspection_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    assert_safety_read_or_pending_sign_session(
        user, db, sign_project_id=sign_project_id, sign_inspection_id=sign_inspection_id
    )
    tid = uuid.UUID(str(template_id))
    t = db.query(FormTemplate).filter(FormTemplate.id == tid).first()
    if not t:
        raise HTTPException(status_code=404, detail="Template not found")
    return _template_to_dict(t, include_definition=True)


@router.put("/{template_id}")
def update_form_template(
    template_id: str,
    body: FormTemplateUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _=Depends(require_permissions("business:projects:safety:write")),
):
    tid = uuid.UUID(str(template_id))
    t = db.query(FormTemplate).filter(FormTemplate.id == tid).first()
    if not t:
        raise HTTPException(status_code=404, detail="Template not found")
    if body.name is not None:
        t.name = body.name.strip()
    if body.description is not None:
        t.description = body.description.strip() or None
    if body.category is not None:
        t.category = body.category.strip() or "inspection"
    if body.status is not None:
        st = body.status.strip().lower()
        if st not in ("active", "inactive"):
            raise HTTPException(status_code=400, detail="status must be active or inactive")
        t.status = st
    if body.version_label is not None:
        t.version_label = (body.version_label or "")[:100]
    if body.definition is not None:
        definition = _normalize_definition(body.definition)
        _validate_definition_structure(definition)
        _validate_dropdown_custom_lists(db, definition)
        t.definition = definition
    t.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(t)
    return _template_to_dict(t, include_definition=True)


@router.delete("/{template_id}")
def delete_form_template(
    template_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _=Depends(require_permissions("business:projects:safety:write")),
):
    tid = uuid.UUID(str(template_id))
    t = db.query(FormTemplate).filter(FormTemplate.id == tid).first()
    if not t:
        raise HTTPException(status_code=404, detail="Template not found")
    db.delete(t)
    db.commit()
    return {"ok": True}
