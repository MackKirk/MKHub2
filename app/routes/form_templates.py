"""Shared form templates (Safety, Employee Review, Fieldwork). Definition JSON is domain-agnostic."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from ..auth.security import (
    get_current_user,
    _has_permission,
    user_has_any_project_safety_permission,
    user_has_any_rm_fieldwork_permission,
)
from ..services.form_engine import (
    EMPLOYEE_REVIEW_CATEGORY,
    FIELDWORK_TEMPLATE_CATEGORIES,
    FOLLOW_UP_CATEGORY,
    INSPECTION_CATEGORY,
    SAFETY_TEMPLATE_CATEGORIES,
    is_employee_review_category,
    is_fieldwork_template_category,
    is_inspection_like_category,
    is_known_template_category,
    is_safety_template_category,
    normalized_template_category,
)
from ..services.safety_sign_request_access import assert_safety_read_or_pending_sign_session
from ..db import get_db
from ..models.models import FormCustomList, FormTemplate, FleetAsset, User

router = APIRouter(prefix="/form-templates", tags=["form-templates"])

# Re-export names used by older imports / tests
_normalized_template_category = normalized_template_category
_is_inspection_like_category = is_inspection_like_category
_SAFETY_TEMPLATE_CATEGORIES = SAFETY_TEMPLATE_CATEGORIES


def _hr_can_manage_employee_review_templates(user: User) -> bool:
    return _has_permission(user, "hr:reviews:admin") or _has_permission(user, "reviews:admin")


def _can_read_template_category(user: User, category: Optional[str]) -> bool:
    cat = normalized_template_category(category)
    if is_employee_review_category(cat):
        return user_has_any_project_safety_permission(user, "read") or _hr_can_manage_employee_review_templates(
            user
        )
    if is_fieldwork_template_category(cat):
        return user_has_any_rm_fieldwork_permission(user, "read")
    if is_safety_template_category(cat):
        return user_has_any_project_safety_permission(user, "read")
    return False


def _can_write_template_category(user: User, category: Optional[str]) -> bool:
    cat = normalized_template_category(category)
    if is_employee_review_category(cat):
        return _hr_can_manage_employee_review_templates(user)
    if is_fieldwork_template_category(cat):
        return user_has_any_rm_fieldwork_permission(user, "write")
    if is_safety_template_category(cat):
        return user_has_any_project_safety_permission(user, "write")
    return False


def _ensure_form_template_read(
    user: User,
    db: Session,
    t: FormTemplate,
    *,
    sign_project_id: Optional[str],
    sign_inspection_id: Optional[str],
) -> None:
    """Domain-isolated read: Safety (or sign session), HR, or Fieldwork."""
    cat = normalized_template_category(t.category)
    if is_employee_review_category(cat):
        if _can_read_template_category(user, cat):
            return
        raise HTTPException(status_code=403, detail="Forbidden")
    if is_fieldwork_template_category(cat):
        if _can_read_template_category(user, cat):
            return
        raise HTTPException(status_code=403, detail="Forbidden")
    # Safety templates: allow pending signers via sign session
    assert_safety_read_or_pending_sign_session(
        user, db, sign_project_id=sign_project_id, sign_inspection_id=sign_inspection_id
    )


def _ensure_form_template_write(
    user: User, t: Optional[FormTemplate], *, new_category: Optional[str] = None
) -> None:
    """Writers may only mutate templates in their domain (Safety / HR / Fieldwork)."""
    if t is not None and new_category is not None:
        current = normalized_template_category(t.category)
        nxt = normalized_template_category(new_category)
        if current != nxt and (
            is_employee_review_category(current)
            or is_employee_review_category(nxt)
            or is_fieldwork_template_category(current)
            or is_fieldwork_template_category(nxt)
            or is_safety_template_category(current)
            or is_safety_template_category(nxt)
        ):
            # Cross-domain category changes require write on both sides
            if not (_can_write_template_category(user, current) and _can_write_template_category(user, nxt)):
                raise HTTPException(status_code=403, detail="Cannot move template across domains")
    target = new_category if new_category is not None else (t.category if t else INSPECTION_CATEGORY)
    if not is_known_template_category(target):
        raise HTTPException(status_code=400, detail="Unknown template category")
    if _can_write_template_category(user, target):
        return
    raise HTTPException(status_code=403, detail="Forbidden")

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
        "scale_1_5",
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


def _normalize_fieldwork_settings(raw: Any) -> Optional[dict]:
    """Sanitize optional definition.fieldwork_settings for Site Assessment / Work Report."""
    from ..services.form_engine import FIELDWORK_TECHNICAL_PHOTO_FOLDER_NAMES

    if not isinstance(raw, dict):
        return None
    out: dict = {}
    if "require_final_comments" in raw:
        out["require_final_comments"] = bool(raw["require_final_comments"])
    if "require_min_photos" in raw:
        try:
            out["require_min_photos"] = max(0, int(raw["require_min_photos"]))
        except Exception:
            out["require_min_photos"] = 0
    folder = raw.get("default_pictures_folder")
    if isinstance(folder, str) and folder.strip():
        name = folder.strip()
        slug_map = {
            "proposal_photos": "Proposal Photos",
            "invoice_photos": "Invoice Photos",
        }
        name = slug_map.get(name.lower(), name)
        if name not in FIELDWORK_TECHNICAL_PHOTO_FOLDER_NAMES:
            raise HTTPException(
                status_code=400,
                detail=f"fieldwork_settings.default_pictures_folder must be one of: "
                f"{', '.join(sorted(FIELDWORK_TECHNICAL_PHOTO_FOLDER_NAMES))}",
            )
        out["default_pictures_folder"] = name
    return out or None


def _normalize_definition(raw: Any) -> dict:
    if not isinstance(raw, dict):
        return default_definition()
    base = default_definition()
    if "sections" in raw and isinstance(raw["sections"], list):
        base["sections"] = raw["sections"]
    if "signature_policy" in raw and isinstance(raw["signature_policy"], dict):
        base["signature_policy"] = raw["signature_policy"]
    fw = _normalize_fieldwork_settings(raw.get("fieldwork_settings"))
    if fw is not None:
        base["fieldwork_settings"] = fw
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


def _resolve_user_name(db: Session, user_id: Optional[uuid.UUID]) -> Optional[str]:
    if not user_id:
        return None
    try:
        u = db.query(User).filter(User.id == user_id).first()
    except Exception:
        u = None
    if not u:
        return None
    return (u.username or "").strip() or None


def _template_to_dict(db: Session, t: FormTemplate, *, include_definition: bool = False) -> dict:
    created_by_name = _resolve_user_name(db, t.created_by)
    def_ver = int(getattr(t, "definition_version", None) or 1)
    out = {
        "id": str(t.id),
        "name": t.name or "",
        "description": t.description or "",
        "category": normalized_template_category(t.category),
        "status": t.status or "active",
        "version_label": (t.version_label or "").strip() if getattr(t, "version_label", None) is not None else "",
        "definition_version": def_ver,
        "created_at": t.created_at.isoformat() if t.created_at else None,
        "updated_at": t.updated_at.isoformat() if t.updated_at else None,
        "created_by": str(t.created_by) if t.created_by else None,
        "created_by_name": created_by_name,
        # FormTemplate currently stores only created_by. Reuse it for "last updated by"
        # until a dedicated updated_by field is introduced.
        "updated_by_name": created_by_name,
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
    # Optimistic concurrency: when set with definition, must match current definition_version.
    expected_definition_version: Optional[int] = Field(
        None, description="Reject save with 409 if definition_version differs"
    )


def _definition_has_sections(definition: dict) -> bool:
    s = definition.get("sections")
    return isinstance(s, list) and len(s) > 0


@router.get("")
def list_form_templates(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    category: Optional[str] = Query(None),
    domain: Optional[str] = Query(
        None, description="Optional domain scope: safety | employee_review | fieldwork"
    ),
    status: Optional[str] = Query(None),
    schedulable: bool = Query(False, description="If true, only templates usable for new inspections"),
    sort: str = Query("name", description="name | created_at | updated_at"),
    sort_dir: str = Query("asc", description="asc | desc"),
):
    has_safety = user_has_any_project_safety_permission(user, "read")
    has_hr = _hr_can_manage_employee_review_templates(user)
    has_fieldwork = user_has_any_rm_fieldwork_permission(user, "read")
    if not (has_safety or has_hr or has_fieldwork):
        raise HTTPException(status_code=403, detail="Forbidden")

    explicit_domain = (domain or "").strip().lower() if domain else ""
    if explicit_domain:
        if explicit_domain not in {"safety", "employee_review", "fieldwork"}:
            raise HTTPException(status_code=400, detail="Unknown template domain")
        if explicit_domain == "safety" and not has_safety:
            raise HTTPException(status_code=403, detail="Forbidden")
        if explicit_domain == "employee_review" and not has_hr:
            raise HTTPException(status_code=403, detail="Forbidden")
        if explicit_domain == "fieldwork" and not has_fieldwork:
            raise HTTPException(status_code=403, detail="Forbidden")

    explicit_category = (category or "").strip().lower() if category else ""
    if explicit_category and not is_known_template_category(explicit_category):
        raise HTTPException(status_code=400, detail="Unknown template category")
    if explicit_category and not _can_read_template_category(user, explicit_category):
        raise HTTPException(status_code=403, detail="Forbidden")

    # Domain-only users without an explicit category are scoped to their domain
    if not explicit_category and not explicit_domain:
        if has_safety:
            pass  # safety default list below
        elif has_hr and not has_fieldwork:
            explicit_category = EMPLOYEE_REVIEW_CATEGORY
        elif has_fieldwork and not has_hr:
            # Return both fieldwork kinds; filter after query
            pass
        elif has_hr and has_fieldwork:
            pass

    q = db.query(FormTemplate)
    if explicit_domain == "fieldwork":
        q = q.filter(func.lower(FormTemplate.category).in_(tuple(FIELDWORK_TEMPLATE_CATEGORIES)))
        if explicit_category:
            q = q.filter(func.lower(FormTemplate.category) == explicit_category)
    elif explicit_domain == "employee_review":
        q = q.filter(func.lower(FormTemplate.category) == EMPLOYEE_REVIEW_CATEGORY)
    elif explicit_domain == "safety":
        q = q.filter(
            or_(
                FormTemplate.category.is_(None),
                FormTemplate.category == "",
                func.lower(FormTemplate.category).in_(tuple(SAFETY_TEMPLATE_CATEGORIES)),
            )
        )
        if explicit_category == FOLLOW_UP_CATEGORY:
            q = q.filter(func.lower(FormTemplate.category) == FOLLOW_UP_CATEGORY)
        elif explicit_category == INSPECTION_CATEGORY:
            q = q.filter(
                or_(
                    FormTemplate.category.is_(None),
                    FormTemplate.category == "",
                    func.lower(FormTemplate.category) == INSPECTION_CATEGORY,
                )
            )
    elif explicit_category:
        if explicit_category == INSPECTION_CATEGORY:
            q = q.filter(
                or_(
                    FormTemplate.category.is_(None),
                    FormTemplate.category == "",
                    func.lower(FormTemplate.category) == INSPECTION_CATEGORY,
                )
            )
        else:
            q = q.filter(func.lower(FormTemplate.category) == explicit_category)
    elif has_safety:
        # Safety hub lists: inspection + follow_up only (exclude HR + Fieldwork)
        q = q.filter(
            or_(
                FormTemplate.category.is_(None),
                FormTemplate.category == "",
                func.lower(FormTemplate.category).in_(tuple(SAFETY_TEMPLATE_CATEGORIES)),
            )
        )
    elif has_fieldwork and not has_hr:
        q = q.filter(func.lower(FormTemplate.category).in_(tuple(FIELDWORK_TEMPLATE_CATEGORIES)))
    elif has_hr and not has_fieldwork:
        q = q.filter(func.lower(FormTemplate.category) == EMPLOYEE_REVIEW_CATEGORY)
    else:
        # HR + Fieldwork (no safety): both domains
        q = q.filter(
            or_(
                func.lower(FormTemplate.category) == EMPLOYEE_REVIEW_CATEGORY,
                func.lower(FormTemplate.category).in_(tuple(FIELDWORK_TEMPLATE_CATEGORIES)),
            )
        )

    if status and status.strip():
        q = q.filter(FormTemplate.status == status.strip())
    rows: List[FormTemplate] = q.all()

    # Drop rows the user cannot read (belt-and-suspenders)
    rows = [t for t in rows if _can_read_template_category(user, t.category)]

    if schedulable:
        rows = [
            t
            for t in rows
            if (t.status or "").lower() == "active"
            and _definition_has_sections(_normalize_definition(t.definition or {}))
        ]
        # Default New Inspection / schedule picker: inspections only (exclude follow_up).
        # Explicit ?category=follow_up&schedulable=true keeps follow-up templates for Flag modal.
        if not (category or "").strip():
            rows = [t for t in rows if is_inspection_like_category(t.category)]

    sort_key = (sort or "name").strip().lower()
    asc_dir = (sort_dir or "asc").lower() != "desc"
    if sort_key == "created_at":
        rows.sort(key=lambda t: t.created_at or datetime.min.replace(tzinfo=timezone.utc), reverse=not asc_dir)
    elif sort_key == "updated_at":
        rows.sort(key=lambda t: t.updated_at or t.created_at or datetime.min.replace(tzinfo=timezone.utc), reverse=not asc_dir)
    else:
        rows.sort(key=lambda t: (t.name or "").lower(), reverse=not asc_dir)

    return [_template_to_dict(db, t) for t in rows]


@router.post("")
def create_form_template(
    body: FormTemplateCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    cat = normalized_template_category(body.category or INSPECTION_CATEGORY)
    if not is_known_template_category(cat):
        raise HTTPException(status_code=400, detail="Unknown template category")
    _ensure_form_template_write(user, None, new_category=cat)
    st = (body.status or "active").strip().lower()
    if st not in ("active", "inactive"):
        raise HTTPException(status_code=400, detail="status must be active or inactive")
    t = FormTemplate(
        name=body.name.strip(),
        description=(body.description or "").strip() or None,
        category=cat,
        status=st,
        definition=default_definition(),
        version_label="",
        definition_version=1,
        created_by=user.id,
    )
    db.add(t)
    db.commit()
    db.refresh(t)
    return _template_to_dict(db, t, include_definition=True)


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
):
    tid = uuid.UUID(str(template_id))
    src = db.query(FormTemplate).filter(FormTemplate.id == tid).first()
    if not src:
        raise HTTPException(status_code=404, detail="Template not found")
    _ensure_form_template_write(user, src)
    base_name = (src.name or "Untitled").strip() or "Untitled"
    dup = FormTemplate(
        name=f"{base_name} (copy)",
        description=src.description,
        category=normalized_template_category(src.category),
        status=src.status or "active",
        definition=_normalize_definition(src.definition or {}),
        version_label="",
        definition_version=1,
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
    tid = uuid.UUID(str(template_id))
    t = db.query(FormTemplate).filter(FormTemplate.id == tid).first()
    if not t:
        raise HTTPException(status_code=404, detail="Template not found")
    _ensure_form_template_read(user, db, t, sign_project_id=sign_project_id, sign_inspection_id=sign_inspection_id)
    return _template_to_dict(db, t, include_definition=True)


@router.put("/{template_id}")
def update_form_template(
    template_id: str,
    body: FormTemplateUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    tid = uuid.UUID(str(template_id))
    t = db.query(FormTemplate).filter(FormTemplate.id == tid).first()
    if not t:
        raise HTTPException(status_code=404, detail="Template not found")
    if body.category is not None:
        _ensure_form_template_write(user, t, new_category=body.category)
    else:
        _ensure_form_template_write(user, t)
    if body.name is not None:
        t.name = body.name.strip()
    if body.description is not None:
        t.description = body.description.strip() or None
    if body.category is not None:
        next_cat = normalized_template_category(body.category)
        current_cat = normalized_template_category(t.category)
        if not is_known_template_category(next_cat):
            raise HTTPException(status_code=400, detail="Unknown template category")
        # Keep HR templates locked to employee_review
        if is_employee_review_category(current_cat) or is_employee_review_category(next_cat):
            if next_cat != EMPLOYEE_REVIEW_CATEGORY:
                raise HTTPException(status_code=400, detail="HR templates must remain category employee_review")
            t.category = EMPLOYEE_REVIEW_CATEGORY
        # Keep Fieldwork within fieldwork kinds
        elif is_fieldwork_template_category(current_cat):
            if not is_fieldwork_template_category(next_cat):
                raise HTTPException(
                    status_code=400,
                    detail="Fieldwork templates must remain site_assessment or work_report",
                )
            t.category = next_cat
        elif not is_safety_template_category(next_cat):
            raise HTTPException(
                status_code=400,
                detail="category must be inspection or follow_up",
            )
        else:
            t.category = next_cat
    if body.status is not None:
        st = body.status.strip().lower()
        if st not in ("active", "inactive"):
            raise HTTPException(status_code=400, detail="status must be active or inactive")
        t.status = st
    if body.version_label is not None:
        t.version_label = (body.version_label or "")[:100]
    if body.definition is not None:
        current_ver = int(getattr(t, "definition_version", None) or 1)
        if body.expected_definition_version is not None:
            if int(body.expected_definition_version) != current_ver:
                raise HTTPException(
                    status_code=409,
                    detail={
                        "message": "Template definition was modified by another save",
                        "definition_version": current_ver,
                    },
                )
        definition = _normalize_definition(body.definition)
        _validate_definition_structure(definition)
        _validate_dropdown_custom_lists(db, definition)
        t.definition = definition
        t.definition_version = current_ver + 1
    elif body.expected_definition_version is not None:
        # Meta-only updates may still assert version when client cares about staleness.
        current_ver = int(getattr(t, "definition_version", None) or 1)
        if int(body.expected_definition_version) != current_ver:
            raise HTTPException(
                status_code=409,
                detail={
                    "message": "Template was modified by another save",
                    "definition_version": current_ver,
                },
            )
    t.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(t)
    return _template_to_dict(db, t, include_definition=True)


@router.delete("/{template_id}")
def delete_form_template(
    template_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    tid = uuid.UUID(str(template_id))
    t = db.query(FormTemplate).filter(FormTemplate.id == tid).first()
    if not t:
        raise HTTPException(status_code=404, detail="Template not found")
    _ensure_form_template_write(user, t)
    db.delete(t)
    db.commit()
    return {"ok": True}
