"""
Audit logging service.
Append-only audit log with integrity hashing.
"""
import hashlib
import json
import uuid
from datetime import datetime
from typing import Optional, Dict, Any
from sqlalchemy.orm import Session

from ..models.models import AuditLog
from ..config import settings


def create_audit_log(
    db: Session,
    entity_type: str,
    entity_id: str,
    action: str,
    actor_id: Optional[str] = None,
    actor_role: Optional[str] = None,
    source: Optional[str] = None,
    changes_json: Optional[Dict] = None,
    context: Optional[Dict] = None,
    integrity_secret: Optional[str] = None
) -> AuditLog:
    """
    Create an append-only audit log entry.
    
    Args:
        db: Database session
        entity_type: Type of entity (shift|attendance|project|user)
        entity_id: Entity ID
        action: Action performed (CREATE|UPDATE|APPROVE|REJECT|DELETE|CLOCK_IN|CLOCK_OUT)
        actor_id: User ID who performed the action
        actor_role: Role of the actor (admin|supervisor|worker|system)
        source: Source of the action (app|supervisor|kiosk|system|api)
        changes_json: Before/after diff
        context: Additional context (project_id, worker_id, GPS data, etc.)
        integrity_secret: Secret for integrity hash (defaults to JWT_SECRET)
    
    Returns:
        Created AuditLog object
    """
    timestamp_utc = datetime.utcnow().replace(tzinfo=None)

    # Normalize UUID-like fields for DB compatibility (SQLite/PostgreSQL).
    # Models use UUID(as_uuid=True); passing raw strings may fail depending on dialect.
    try:
        if entity_id is not None and not isinstance(entity_id, uuid.UUID):
            entity_id = uuid.UUID(str(entity_id))
    except Exception:
        # Let DB raise if truly invalid; better than silently mis-storing.
        pass
    try:
        if actor_id is not None and not isinstance(actor_id, uuid.UUID):
            actor_id = uuid.UUID(str(actor_id))
    except Exception:
        pass
    
    # Calculate integrity hash
    integrity_hash = None
    if integrity_secret is None:
        integrity_secret = settings.jwt_secret
    
    if integrity_secret:
        # Create canonical JSON representation
        canonical_data = {
            "entity_type": entity_type,
            "entity_id": str(entity_id),
            "action": action,
            "actor_id": str(actor_id) if actor_id else None,
            "actor_role": actor_role,
            "source": source,
            "timestamp_utc": timestamp_utc.isoformat(),
            "changes": changes_json,
            "context": context,
        }
        
        # Remove None values and sort keys for consistency
        canonical_data = {k: v for k, v in canonical_data.items() if v is not None}
        canonical_json = json.dumps(canonical_data, sort_keys=True, default=str)
        
        # Calculate SHA256 hash
        hash_input = f"{canonical_json}:{integrity_secret}"
        integrity_hash = hashlib.sha256(hash_input.encode()).hexdigest()
    
    audit_log = AuditLog(
        entity_type=entity_type,
        entity_id=entity_id,
        action=action,
        actor_id=actor_id,
        actor_role=actor_role,
        source=source or "system",
        changes_json=changes_json,
        timestamp_utc=timestamp_utc,
        context=context,
        integrity_hash=integrity_hash,
    )
    
    db.add(audit_log)
    db.commit()
    db.refresh(audit_log)
    
    return audit_log


def get_audit_logs(
    db: Session,
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
    limit: int = 100,
    offset: int = 0
) -> list:
    """
    Get audit logs with optional filtering.
    
    Args:
        db: Database session
        entity_type: Filter by entity type
        entity_id: Filter by entity ID
        limit: Maximum number of results
        offset: Offset for pagination
    
    Returns:
        List of AuditLog objects
    """
    query = db.query(AuditLog)
    
    if entity_type:
        query = query.filter(AuditLog.entity_type == entity_type)
    
    if entity_id:
        query = query.filter(AuditLog.entity_id == entity_id)
    
    query = query.order_by(AuditLog.timestamp_utc.desc())
    query = query.limit(limit).offset(offset)
    
    return query.all()


def compute_diff(before: Dict, after: Dict) -> Dict:
    """
    Compute a diff between two dictionaries.
    
    Args:
        before: Before state
        after: After state
    
    Returns:
        Dict with before/after values for changed fields
    """
    diff = {}
    all_keys = set(before.keys()) | set(after.keys())
    
    for key in all_keys:
        before_val = before.get(key)
        after_val = after.get(key)
        
        if before_val != after_val:
            diff[key] = {
                "before": before_val,
                "after": after_val,
            }
    
    return diff


def compute_proposal_diff(old_data: Dict, new_data: Dict, source: Optional[str] = None) -> Dict:
    """
    Compute a detailed diff between old and new proposal data.
    All changes are flattened into before/after dicts for uniform Before/After display.
    Pricing items use 'pricing__Label' keys, services use 'service__Name' keys,
    sections use 'section__Title' keys.
    """
    PROPOSAL_SCALAR_FIELDS = [
        'cover_title', 'template_style', 'date', 'proposal_created_for',
        'primary_contact_name', 'primary_contact_phone', 'primary_contact_email',
        'type_of_project', 'other_notes', 'project_description',
        'additional_project_notes', 'terms_text', 'total',
        'show_total_in_pdf', 'show_pst_in_pdf', 'show_gst_in_pdf',
        'pst_rate', 'gst_rate', 'area_display_unit',
    ]

    before: Dict = {}
    after: Dict = {}

    for field in PROPOSAL_SCALAR_FIELDS:
        old_val = old_data.get(field)
        new_val = new_data.get(field)
        if str(old_val) != str(new_val) and not (old_val in (None, '', 0) and new_val in (None, '', 0)):
            before[field] = old_val
            after[field] = new_val

    # --- Pricing items diff (additional_costs) by POSITION so rename = one "name" change, not remove+add ---
    old_items = old_data.get('additional_costs') or []
    new_items = new_data.get('additional_costs') or []

    def _fmt_item(item: dict) -> str:
        v = item.get('value', 0)
        try:
            vs = f"${float(v):,.2f}"
        except (ValueError, TypeError):
            vs = str(v)
        q = item.get('quantity', '1')
        parts = [vs]
        if str(q) != '1':
            parts.append(f"× {q}")
        appr = item.get('approved', True)
        if appr is False:
            parts.append("(Not approved)")
        return ' '.join(parts)

    pricing_fields = ('label', 'value', 'quantity', 'approved', 'pst', 'gst', 'area_value', 'area_unit')
    max_len = max(len(old_items), len(new_items))
    for i in range(max_len):
        old_item = old_items[i] if i < len(old_items) else None
        new_item = new_items[i] if i < len(new_items) else None
        pos_label = f"Item {i + 1}"
        base_key = f"pricing__{pos_label}"
        if old_item is None and new_item is not None:
            before[base_key] = None
            after[base_key] = _fmt_item(new_item)
        elif old_item is not None and new_item is None:
            before[base_key] = _fmt_item(old_item)
            after[base_key] = None
        elif old_item is not None and new_item is not None:
            for f in pricing_fields:
                ov = old_item.get(f)
                nv = new_item.get(f)
                if str(ov) != str(nv) and not (ov is None and nv is None):
                    pk = f"pricing__{pos_label}__{f}"
                    before[pk] = ov
                    after[pk] = nv

    # --- Optional services diff → flattened ---
    old_services = old_data.get('optional_services') or []
    new_services = new_data.get('optional_services') or []
    old_svc_map = {s.get('service', ''): s for s in old_services if isinstance(s, dict)}
    new_svc_map = {s.get('service', ''): s for s in new_services if isinstance(s, dict)}

    for name, svc in new_svc_map.items():
        sk = f"service__{name}"
        if name not in old_svc_map:
            before[sk] = None
            after[sk] = svc.get('price', 0)
        else:
            op = old_svc_map[name].get('price', 0)
            np_ = svc.get('price', 0)
            if str(op) != str(np_):
                before[sk] = op
                after[sk] = np_
    for name, svc in old_svc_map.items():
        if name not in new_svc_map:
            sk = f"service__{name}"
            before[sk] = svc.get('price', 0)
            after[sk] = None

    # --- Sections diff → flattened ---
    old_sections = old_data.get('sections') or []
    new_sections = new_data.get('sections') or []
    max_len = max(len(old_sections), len(new_sections)) if old_sections or new_sections else 0
    for i in range(max_len):
        old_sec = old_sections[i] if i < len(old_sections) else None
        new_sec = new_sections[i] if i < len(new_sections) else None
        sec_title = (new_sec or old_sec or {}).get('title', '') or f"Section {i + 1}"
        sec_key = f"section__{sec_title}"
        if old_sec is None and new_sec:
            before[sec_key] = None
            after[sec_key] = f"Added ({new_sec.get('type', 'text')})"
        elif new_sec is None and old_sec:
            before[sec_key] = f"{old_sec.get('type', 'text')}"
            after[sec_key] = None
        elif old_sec and new_sec:
            diffs = []
            if old_sec.get('title', '') != new_sec.get('title', ''):
                before[f"{sec_key}__title"] = old_sec.get('title', '')
                after[f"{sec_key}__title"] = new_sec.get('title', '')
            if old_sec.get('text', '') != new_sec.get('text', ''):
                old_text = old_sec.get('text', '') or ''
                new_text = new_sec.get('text', '') or ''
                before[f"{sec_key}__content"] = f"{len(old_text)} chars"
                after[f"{sec_key}__content"] = f"{len(new_text)} chars"
            old_imgs = old_sec.get('images') or []
            new_imgs = new_sec.get('images') or []
            if len(old_imgs) != len(new_imgs):
                before[f"{sec_key}__images"] = f"{len(old_imgs)} image(s)"
                after[f"{sec_key}__images"] = f"{len(new_imgs)} image(s)"

    if before or after:
        return {'before': before, 'after': after}
    return {}


# Entity type to section mapping for filtering
SECTION_ENTITY_TYPES = {
    "reports": ["report"],
    "files": ["project_file", "project_folder"],
    "proposal": ["proposal", "proposal_draft"],
    "pricing": ["proposal", "proposal_draft"],
    "estimate": ["estimate", "estimate_item"],
    "orders": ["order", "order_item"],
    "workload": ["shift"],
    "timesheet": ["attendance", "timesheet_entry"],
    "general": ["project"],
}

SECTION_CONTEXT_FILTERS = {
    "proposal": {"source": "proposal", "_default": True},
    "pricing": {"source": "pricing"},
}


def _resolve_user_name(db: Session, user_id: str) -> Optional[str]:
    """Helper to resolve user ID to full name."""
    from ..models.models import User, EmployeeProfile
    try:
        result = db.query(User, EmployeeProfile).outerjoin(
            EmployeeProfile, EmployeeProfile.user_id == User.id
        ).filter(User.id == user_id).first()
        if result:
            user, profile = result
            if profile:
                return f"{profile.first_name or ''} {profile.last_name or ''}".strip() or user.username
            return user.username
    except Exception:
        pass
    return None


def _resolve_project_name(db: Session, project_id: str) -> Optional[str]:
    """Helper to resolve project ID to name."""
    from ..models.models import Project
    try:
        project = db.query(Project).filter(Project.id == project_id).first()
        if project:
            return project.name
    except Exception:
        pass
    return None


def _resolve_contact_name(db: Session, contact_id: str) -> Optional[str]:
    """Helper to resolve contact ID to name."""
    from ..models.models import ClientContact
    try:
        contact = db.query(ClientContact).filter(ClientContact.id == contact_id).first()
        if contact:
            return getattr(contact, "name", None)
    except Exception:
        pass
    return None


def _resolve_site_name(db: Session, site_id: str) -> Optional[str]:
    """Helper to resolve site ID to name."""
    from ..models.models import ClientSite
    try:
        site = db.query(ClientSite).filter(ClientSite.id == site_id).first()
        if site:
            return getattr(site, "site_name", None) or getattr(site, "site_address_line1", None)
    except Exception:
        pass
    return None


def _resolve_client_name(db: Session, client_id: str) -> Optional[str]:
    """Helper to resolve client ID to display name."""
    from ..models.models import Client
    try:
        client = db.query(Client).filter(Client.id == client_id).first()
        if client:
            return getattr(client, "display_name", None) or getattr(client, "legal_name", None)
    except Exception:
        pass
    return None


def _resolve_status_label(db: Session, status_id: str) -> Optional[str]:
    """Resolve project status ID to its label (e.g. 'In Progress')."""
    if not status_id:
        return None
    import uuid as uuid_mod
    from ..models.models import SettingList, SettingItem
    try:
        sid = uuid_mod.UUID(str(status_id))
        status_list = db.query(SettingList).filter(SettingList.name == "project_statuses").first()
        if not status_list:
            return None
        item = db.query(SettingItem).filter(
            SettingItem.list_id == status_list.id,
            SettingItem.id == sid
        ).first()
        if item:
            return getattr(item, "label", None)
    except Exception:
        pass
    return None


def _resolve_division_labels(db: Session, division_ids: list) -> Optional[str]:
    """Helper to resolve division IDs to labels (comma-separated)."""
    if not division_ids or not isinstance(division_ids, list):
        return None
    import uuid as uuid_mod
    from ..models.models import SettingList, SettingItem
    try:
        div_list = db.query(SettingList).filter(SettingList.name == "project_divisions").first()
        if not div_list:
            return None
        uuids = []
        for d in division_ids:
            try:
                uuids.append(uuid_mod.UUID(str(d)))
            except (ValueError, TypeError):
                pass
        if not uuids:
            return None
        items = db.query(SettingItem).filter(
            SettingItem.list_id == div_list.id,
            SettingItem.id.in_(uuids)
        ).all()
        labels = [getattr(i, "label", str(i.id)) for i in items if getattr(i, "label", None)]
        return ", ".join(labels) if labels else None
    except Exception:
        pass
    return None


def _resolve_report_category(db: Session, category_value: str) -> Optional[str]:
    """Resolve a report category_id (value string) to its human-readable label."""
    if not category_value:
        return None
    from ..models.models import SettingList, SettingItem
    try:
        cat_list = db.query(SettingList).filter(SettingList.name == "report_categories").first()
        if not cat_list:
            return None
        item = db.query(SettingItem).filter(
            SettingItem.list_id == cat_list.id,
            SettingItem.value == category_value
        ).first()
        if item:
            return getattr(item, "label", None)
    except Exception:
        pass
    return None


_FINANCIAL_TYPE_LABELS = {
    "additional-income": "Additional Income",
    "additional-expense": "Additional Expense",
    "estimate-changes": "Estimate Changes",
}


def _resolve_report_field_value(db: Session, field: str, val: Any) -> Optional[str]:
    """Resolve a single report field value to human-readable display string."""
    if val is None or (isinstance(val, (list, dict)) and len(val) == 0):
        return "—"
    if field == 'category_id' and val:
        return _resolve_report_category(db, str(val)) or str(val)
    if field == 'division_id' and val:
        return _resolve_division_labels(db, [str(val)]) or str(val)
    if field in ('created_by', 'approved_by') and val:
        return _resolve_user_name(db, str(val)) or str(val)
    if field == 'financial_type' and val:
        return _FINANCIAL_TYPE_LABELS.get(str(val), str(val))
    if field == 'approval_status' and val:
        return str(val).capitalize()
    if field == 'financial_value' and val is not None:
        try:
            return f"${float(val):,.2f}"
        except (ValueError, TypeError):
            return str(val)
    if field in ('title', 'description', 'status'):
        return str(val) if val else "—"
    if isinstance(val, bool):
        return "Yes" if val else "No"
    if isinstance(val, (list, dict)):
        return str(val)
    return str(val)


def _resolve_folder_name(db: Session, folder_id: str) -> Optional[str]:
    """Resolve a project folder ID to its name."""
    from ..models.models import ProjectFolder
    import uuid as uuid_mod
    try:
        fid = uuid_mod.UUID(str(folder_id))
        folder = db.query(ProjectFolder).filter(ProjectFolder.id == fid).first()
        if folder:
            return getattr(folder, "name", None)
    except Exception:
        pass
    return None


_FILE_CATEGORY_LABELS = {
    "drawings": "Drawings",
    "bid-documents": "Bid Documents",
    "change-orders": "Change Orders",
    "contracts": "Contracts",
    "photos": "Photos",
    "invoices": "Invoices",
    "reports": "Reports",
    "other": "Other",
    "project-cover-derived": "Project Cover",
}


def _resolve_file_field_value(db: Session, field: str, val: Any) -> Optional[str]:
    """Resolve a single project_file / project_folder field value to human-readable display string."""
    if val is None:
        return "—"
    if field == 'folder_id' and val:
        return _resolve_folder_name(db, str(val)) or str(val)
    if field == 'category' and val:
        return _FILE_CATEGORY_LABELS.get(str(val), str(val).replace('-', ' ').title())
    if field == 'uploaded_by' and val:
        return _resolve_user_name(db, str(val)) or str(val)
    if field == 'parent_id' and val:
        return _resolve_folder_name(db, str(val)) or str(val)
    if field in ('file_name', 'original_name', 'name', 'content_type'):
        return str(val) if val else "—"
    if isinstance(val, bool):
        return "Yes" if val else "No"
    return str(val)


def _resolve_timesheet_field_value(db: Session, field: str, val: Any) -> Optional[str]:
    """Resolve a single timesheet_entry / attendance field value to human-readable display string."""
    if val is None:
        return "—"
    if field == 'minutes' and val is not None:
        try:
            m = int(val)
            h, r = divmod(abs(m), 60)
            return f"{h}h {r}min" if h else f"{r}min"
        except (ValueError, TypeError):
            return str(val)
    if field == 'hours_worked' and val is not None:
        try:
            h = float(val)
            hours = int(h)
            mins = int(round((h - hours) * 60))
            return f"{hours}h {mins}min" if hours else f"{mins}min"
        except (ValueError, TypeError):
            return str(val)
    if field == 'break_minutes' and val is not None:
        try:
            return f"{int(val)}min"
        except (ValueError, TypeError):
            return str(val)
    if field == 'is_approved':
        if isinstance(val, bool):
            return "Approved" if val else "Not approved"
        return str(val)
    if field == 'source' and val:
        return str(val).replace('_', ' ').title()
    if field == 'status' and val:
        return str(val).replace('_', ' ').title()
    if field in ('work_date',) and val:
        return str(val)[:10] if len(str(val)) >= 10 else str(val)
    if field in ('start_time', 'end_time', 'clock_in_time', 'clock_out_time') and val:
        s = str(val)
        return s[:5] if len(s) >= 5 and ':' in s else s
    if field == 'notes':
        return str(val) if val else "—"
    if field in ('worker_id', 'affected_user_id', 'shift_id'):
        return _resolve_user_name(db, str(val)) or str(val) if field != 'shift_id' else str(val)
    if isinstance(val, bool):
        return "Yes" if val else "No"
    return str(val)


def _resolve_shift_field_value(db: Session, field: str, val: Any) -> Optional[str]:
    """Resolve a single shift field value to human-readable display string."""
    if val is None:
        return "—"
    if field == 'worker_id' and val:
        return _resolve_user_name(db, str(val)) or str(val)
    if field == 'project_id' and val:
        return _resolve_project_name(db, str(val)) or str(val)
    if field == 'date' and val:
        return str(val)[:10] if len(str(val)) >= 10 else str(val)
    if field in ('start_time', 'end_time') and val:
        s = str(val)
        return s[:5] if len(s) >= 5 and ':' in s else s
    if field == 'status' and val:
        return str(val).replace('_', ' ').title()
    if field == 'job_name' and val:
        return str(val)
    if field == 'geofences':
        if isinstance(val, list):
            return f"{len(val)} geofence(s)" if val else "—"
        return str(val) if val else "—"
    if isinstance(val, bool):
        return "Yes" if val else "No"
    return str(val)


def _resolve_proposal_field_value(db: Session, field: str, val: Any) -> Optional[str]:
    """Resolve a single proposal / proposal_draft field value to human-readable display string."""
    if val is None:
        return "—"
    if field == 'client_id' and val:
        return _resolve_client_name(db, str(val)) or str(val)
    if field == 'total' and val is not None:
        try:
            return f"${float(val):,.2f}"
        except (ValueError, TypeError):
            return str(val)
    if field in ('pst_rate', 'gst_rate') and val is not None:
        try:
            return f"{float(val)}%"
        except (ValueError, TypeError):
            return str(val)
    if field == 'source' and val:
        return str(val).replace('_', ' ').title()
    if field == 'template_style' and val:
        return str(val).replace('_', ' ').replace('-', ' ').title()
    if field == 'type_of_project' and val:
        return str(val).replace('_', ' ').replace('-', ' ').title()
    if field == 'area_display_unit' and val:
        return str(val)
    if field in ('title', 'cover_title', 'order_number', 'project_name', 'client_name',
                 'proposal_created_for', 'primary_contact_name', 'primary_contact_phone',
                 'primary_contact_email', 'date', 'other_notes', 'project_description',
                 'additional_project_notes', 'terms_text'):
        return str(val) if val else "—"
    if field in ('is_new', 'soft_delete', 'restored', 'show_total_in_pdf', 'show_pst_in_pdf', 'show_gst_in_pdf'):
        if isinstance(val, bool):
            return "Yes" if val else "No"
        return str(val)
    if field == 'pricing_items_count' and val is not None:
        return str(val)
    if isinstance(val, bool):
        return "Yes" if val else "No"
    if isinstance(val, (list, dict)):
        return str(val)
    return str(val)


def _resolve_pricing_key_value(db: Session, key: str, val: Any) -> str:
    """Resolve a pricing__ prefixed key's value for display."""
    if val is None:
        return "—"
    if isinstance(val, str):
        return val
    parts = key.split('__')
    sub_field = parts[2] if len(parts) > 2 else None
    if sub_field == 'label':
        return str(val) if val else "—"
    if sub_field == 'value':
        try:
            return f"${float(val):,.2f}"
        except (ValueError, TypeError):
            return str(val)
    if sub_field == 'approved':
        return "Approved" if val else "Not approved"
    if sub_field == 'quantity':
        return str(val)
    if sub_field in ('pst', 'gst'):
        return "Yes" if val else "No"
    if sub_field == 'area_value':
        try:
            return f"{float(val):,.2f}"
        except (ValueError, TypeError):
            return str(val)
    if sub_field == 'area_unit':
        return str(val)
    if isinstance(val, (int, float)):
        try:
            return f"${float(val):,.2f}"
        except (ValueError, TypeError):
            pass
    return str(val)


def _resolve_service_value(val: Any) -> str:
    """Resolve a service__ prefixed key's value for display."""
    if val is None:
        return "—"
    if isinstance(val, str):
        return val
    if isinstance(val, (int, float)):
        try:
            return f"${float(val):,.2f}"
        except (ValueError, TypeError):
            pass
    return str(val)


def _normalize_legacy_proposal_changes(db: Session, changes: Dict) -> Dict:
    """
    Convert old-format proposal/pricing audit logs (pricing_changes array, etc.)
    into the Before/After format. Resolves division_id to names.
    Returns normalized {'before': {...}, 'after': {...}} and mutates nothing.
    """
    result_before: Dict = {}
    result_after: Dict = {}
    out = {"before": result_before, "after": result_after}

    p_changes = changes.get("pricing_changes")
    if isinstance(p_changes, list):
        for idx, pc in enumerate(p_changes):
            if not isinstance(pc, dict):
                continue
            action = pc.get("action")
            label = pc.get("label", "Item")
            did = pc.get("division_id")
            div_name = ""
            if did:
                div_name = _resolve_division_labels(db, [str(did)]) or ""
            suffix = f" ({div_name})" if div_name else ""
            key = f"pricing__{label}{suffix}".strip()
            if key in result_before or key in result_after:
                key = f"{key} #{idx + 1}"
            if action == "added":
                v = pc.get("value", 0)
                try:
                    vs = f"${float(v):,.2f}"
                except (ValueError, TypeError):
                    vs = str(v)
                q = pc.get("quantity", "1")
                summary = vs
                if str(q) != "1":
                    summary += f" × {q}"
                if pc.get("approved") is False:
                    summary += " (Not approved)"
                result_before[key] = None
                result_after[key] = summary
            elif action == "removed":
                v = pc.get("value", 0)
                try:
                    vs = f"${float(v):,.2f}"
                except (ValueError, TypeError):
                    vs = str(v)
                result_before[key] = vs
                result_after[key] = None
            elif action == "modified":
                inner = pc.get("changes") or {}
                for f, cv in inner.items():
                    if isinstance(cv, dict):
                        sub_key = f"pricing__{label}{suffix}__{f}".strip()
                        result_before[sub_key] = cv.get("from")
                        result_after[sub_key] = cv.get("to")

    s_changes = changes.get("service_changes")
    if isinstance(s_changes, list):
        for sc in s_changes:
            if not isinstance(sc, dict):
                continue
            action = sc.get("action")
            name = sc.get("service", "Service")
            sk = f"service__{name}"
            if action == "added":
                result_before[sk] = None
                result_after[sk] = sc.get("price", 0)
            elif action == "removed":
                result_before[sk] = sc.get("price", 0)
                result_after[sk] = None
            elif action == "modified":
                result_before[sk] = sc.get("price_from")
                result_after[sk] = sc.get("price_to")

    title = changes.get("title")
    order_number = changes.get("order_number")
    is_new = changes.get("is_new")
    if title is not None:
        result_after["title"] = title
    if order_number is not None:
        result_after["order_number"] = order_number
    if is_new is not None:
        result_after["is_new"] = "Yes" if is_new else "No"

    if not result_before and not result_after:
        return changes
    return out


def _resolve_project_field_value(db: Session, field: str, val: Any) -> Optional[str]:
    """Resolve a single project field value to human-readable display string (for audit modal Before/After)."""
    if val is None or (isinstance(val, (list, dict)) and len(val) == 0):
        return "—"
    if field in ('estimator_id', 'project_admin_id', 'onsite_lead_id') and val:
        return _resolve_user_name(db, str(val)) or str(val)
    if field == 'contact_id' and val:
        return _resolve_contact_name(db, str(val)) or str(val)
    if field == 'client_id' and val:
        return _resolve_client_name(db, str(val)) or str(val)
    if field == 'site_id' and val:
        return _resolve_site_name(db, str(val)) or str(val)
    if field in ('project_division_ids', 'division_ids') and val:
        return _resolve_division_labels(db, val if isinstance(val, list) else []) or str(val)
    if field == 'estimator_ids' and val and isinstance(val, list):
        if not val:
            return "—"
        names = [_resolve_user_name(db, str(eid)) or str(eid) for eid in val[:5]]
        return ", ".join(names) + (" ..." if len(val) > 5 else "")
    if field == 'status_id' and val:
        return _resolve_status_label(db, str(val)) or str(val)
    if field in ('name', 'address', 'status_label', 'lead_source'):
        return str(val)
    if field == 'progress' and val is not None:
        return f"{val}%"
    if field in ('date_start', 'date_end', 'date_eta') and val:
        return str(val)[:10] if len(str(val)) >= 10 else str(val)
    if field == 'division_onsite_leads' and val and isinstance(val, dict):
        parts = []
        for div_id, uid in list(val.items())[:5]:
            div_label = _resolve_division_labels(db, [div_id] if div_id else []) or str(div_id)
            user_name = _resolve_user_name(db, str(uid)) if uid else None
            if div_label and user_name:
                parts.append(f"{div_label}: {user_name}")
            elif user_name:
                parts.append(user_name)
        return ", ".join(parts) + (" ..." if len(val) > 5 else "") if parts else "—"
    if isinstance(val, bool):
        return "Yes" if val else "No"
    if isinstance(val, (list, dict)):
        return str(val)  # fallback for unknown structures
    return str(val)


def get_project_audit_logs(
    db: Session,
    project_id: str,
    section: Optional[str] = None,
    month: Optional[str] = None,
    limit: int = 50,
    offset: int = 0
) -> list:
    """
    Get audit logs for a specific project with optional section filtering.
    
    Args:
        db: Database session
        project_id: Project ID to filter by
        section: Section to filter (reports|files|proposal|pricing|estimate|orders|workload|timesheet|general)
        month: Month to filter (YYYY-MM format)
        limit: Maximum number of results
        offset: Offset for pagination
    
    Returns:
        List of AuditLog objects with user info and resolved names
    """
    import uuid as uuid_mod
    from sqlalchemy import or_, extract
    from ..models.models import User, EmployeeProfile

    project_id_str = str(project_id).strip()
    print(f"[AUDIT-QUERY-DEBUG] Fetching audit logs for project_id={project_id_str}, section={section}")
    try:
        project_uuid = uuid_mod.UUID(project_id_str)
    except (ValueError, TypeError):
        project_uuid = None
    print(f"[AUDIT-QUERY-DEBUG] project_uuid={project_uuid}")

    # Count total audit logs in the table for debugging
    total_logs = db.query(AuditLog).count()
    project_logs = db.query(AuditLog).filter(AuditLog.entity_type == 'project').count()
    print(f"[AUDIT-QUERY-DEBUG] Total audit_logs in DB: {total_logs}, project-type logs: {project_logs}")

    # Check if any logs exist for this specific entity_id
    if project_uuid:
        exact_match_count = db.query(AuditLog).filter(AuditLog.entity_id == project_uuid).count()
        print(f"[AUDIT-QUERY-DEBUG] Logs with entity_id={project_uuid}: {exact_match_count}")
        # Also try string comparison
        from sqlalchemy import cast, String
        str_match_count = db.query(AuditLog).filter(cast(AuditLog.entity_id, String) == project_id_str).count()
        print(f"[AUDIT-QUERY-DEBUG] Logs with cast(entity_id, String)=='{project_id_str}': {str_match_count}")

    # Match project logs by entity_type + entity_id (UUID comparison works in both SQLite and PostgreSQL).
    if project_uuid:
        project_entity_match = (AuditLog.entity_type == 'project') & (AuditLog.entity_id == project_uuid)
    else:
        project_entity_match = (AuditLog.entity_type == 'project') & (AuditLog.entity_id.is_(None))  # invalid uuid -> no match

    # Also match logs that have project_id in context (e.g. proposal, report logs). Use JSON ->> only on PostgreSQL.
    try:
        dialect_name = getattr(db.get_bind().dialect, 'name', '') if hasattr(db, 'get_bind') else ''
    except Exception:
        dialect_name = ''
    if dialect_name == 'postgresql':
        context_match = AuditLog.context.op('->>')('project_id') == project_id_str
        query = db.query(AuditLog).filter(or_(context_match, project_entity_match))
    else:
        query = db.query(AuditLog).filter(project_entity_match)
    print(f"[AUDIT-QUERY-DEBUG] dialect={dialect_name}, using {'context+entity' if dialect_name == 'postgresql' else 'entity-only'} filter")
    
    # Filter by section (entity types)
    if section and section in SECTION_ENTITY_TYPES:
        entity_types = SECTION_ENTITY_TYPES[section]
        query = query.filter(AuditLog.entity_type.in_(entity_types))
    
    # Filter by month
    if month:
        try:
            year, month_num = month.split('-')
            query = query.filter(
                extract('year', AuditLog.timestamp_utc) == int(year),
                extract('month', AuditLog.timestamp_utc) == int(month_num)
            )
        except (ValueError, AttributeError):
            pass
    
    # Order by timestamp descending (most recent first)
    query = query.order_by(AuditLog.timestamp_utc.desc())

    # For sections with context-based sub-filtering (proposal vs pricing), over-fetch and filter in Python
    ctx_filter = SECTION_CONTEXT_FILTERS.get(section) if section else None
    if ctx_filter:
        query = query.limit(limit * 3).offset(offset)
    else:
        query = query.limit(limit).offset(offset)

    logs = query.all()

    if ctx_filter:
        is_default = ctx_filter.get("_default", False)
        check_pairs = {k: v for k, v in ctx_filter.items() if k != "_default"}
        filtered = []
        for log in logs:
            ctx = log.context or {}
            if is_default:
                match = all(ctx.get(k, v) == v for k, v in check_pairs.items())
            else:
                match = all(ctx.get(k) == v for k, v in check_pairs.items())
            if match:
                filtered.append(log)
            if len(filtered) >= limit:
                break
        logs = filtered

    print(f"[AUDIT-QUERY-DEBUG] Query returned {len(logs)} logs")
    for i, log in enumerate(logs[:3]):
        print(f"[AUDIT-QUERY-DEBUG]   log[{i}]: entity_type={log.entity_type}, entity_id={log.entity_id}, action={log.action}")

    # Cache for resolved names to avoid repeated queries
    user_name_cache: Dict[str, Optional[str]] = {}
    project_name_cache: Dict[str, Optional[str]] = {}
    contact_name_cache: Dict[str, Optional[str]] = {}
    site_name_cache: Dict[str, Optional[str]] = {}

    def get_user_name(uid: str) -> Optional[str]:
        if uid not in user_name_cache:
            user_name_cache[uid] = _resolve_user_name(db, uid)
        return user_name_cache.get(uid)

    def get_project_name(pid: str) -> Optional[str]:
        if pid not in project_name_cache:
            project_name_cache[pid] = _resolve_project_name(db, pid)
        return project_name_cache.get(pid)

    def get_contact_name(cid: str) -> Optional[str]:
        if cid not in contact_name_cache:
            contact_name_cache[cid] = _resolve_contact_name(db, cid)
        return contact_name_cache.get(cid)

    def get_site_name(sid: str) -> Optional[str]:
        if sid not in site_name_cache:
            site_name_cache[sid] = _resolve_site_name(db, sid)
        return site_name_cache.get(sid)

    client_name_cache: Dict[str, Optional[str]] = {}
    def get_client_name(cid: str) -> Optional[str]:
        if cid not in client_name_cache:
            client_name_cache[cid] = _resolve_client_name(db, cid)
        return client_name_cache.get(cid)
    
    # Enrich with user info and resolved names
    result = []
    for log in logs:
        context = log.context or {}
        changes = log.changes_json or {}
        
        # Get actor info
        actor_name = None
        actor_avatar = None
        if log.actor_id:
            actor = db.query(User, EmployeeProfile).outerjoin(
                EmployeeProfile, EmployeeProfile.user_id == User.id
            ).filter(User.id == log.actor_id).first()
            if actor:
                user, profile = actor
                if profile:
                    actor_name = f"{profile.first_name or ''} {profile.last_name or ''}".strip() or user.username
                    actor_avatar = str(profile.profile_photo_file_id) if profile.profile_photo_file_id else None
                else:
                    actor_name = user.username
        
        # Get affected user info - prefer context name, fall back to ID resolution
        affected_user_id = context.get('affected_user_id')
        affected_user_name = context.get('affected_user_name')
        if affected_user_id and not affected_user_name:
            affected_user_name = get_user_name(affected_user_id)
        
        # Get project name - prefer context name, fall back to ID resolution
        ctx_project_id = context.get('project_id')
        project_name = context.get('project_name')
        if ctx_project_id and not project_name:
            project_name = get_project_name(ctx_project_id)
        
        # Resolve worker_id to name if present in context
        worker_id = context.get('worker_id')
        worker_name = context.get('worker_name')
        if worker_id and not worker_name:
            worker_name = get_user_name(worker_id)
        
        # Resolve approved_by to name if present in changes
        approved_by_id = None
        approved_by_name = None
        if changes.get('after') and isinstance(changes['after'], dict):
            approved_by_id = changes['after'].get('approved_by')
        if not approved_by_id and changes.get('approved_by'):
            approved_by_id = changes.get('approved_by')
        if approved_by_id:
            approved_by_name = get_user_name(str(approved_by_id))
        
        # Resolve client_id in context to client name
        ctx_client_id = context.get('client_id')
        client_name = context.get('client_name')
        if ctx_client_id and not client_name:
            client_name = get_client_name(ctx_client_id)

        # Build enriched context with resolved names
        enriched_context = dict(context)
        if affected_user_name:
            enriched_context['affected_user_name'] = affected_user_name
        if project_name:
            enriched_context['project_name'] = project_name
        if client_name:
            enriched_context['client_name'] = client_name
        if worker_name:
            enriched_context['worker_name'] = worker_name
        if approved_by_name:
            enriched_context['approved_by_name'] = approved_by_name

        # For project UPDATE logs: resolve ALL fields in before/after to display values (audit modal)
        resolved_values: Dict[str, Optional[str]] = {}
        resolved_values_before: Dict[str, Optional[str]] = {}
        if log.entity_type == 'project' and log.action == 'UPDATE':
            after = (changes.get('after') or {}) if isinstance(changes, dict) else {}
            before = (changes.get('before') or {}) if isinstance(changes, dict) else {}
            all_fields = (set(before.keys()) if isinstance(before, dict) else set()) | (set(after.keys()) if isinstance(after, dict) else set())
            for field in all_fields:
                val_after = after.get(field) if isinstance(after, dict) else None
                val_before = before.get(field) if isinstance(before, dict) else None
                resolved_values[field] = _resolve_project_field_value(db, field, val_after)
                resolved_values_before[field] = _resolve_project_field_value(db, field, val_before)
        elif log.entity_type == 'project' and log.action == 'CREATE':
            # Flat changes dict (name, code, client_id, is_bidding, status_label, etc.)
            flat = changes if isinstance(changes, dict) and 'before' not in changes and 'after' not in changes else {}
            for field, val in (flat or {}).items():
                resolved_values[field] = _resolve_project_field_value(db, field, val)
        elif log.entity_type == 'report':
            if log.action == 'DELETE' and isinstance(changes, dict) and 'deleted_report' in changes:
                nested = changes['deleted_report'] if isinstance(changes.get('deleted_report'), dict) else {}
                for field, val in nested.items():
                    resolved_values[field] = _resolve_report_field_value(db, field, val)
            elif isinstance(changes, dict):
                for field, val in changes.items():
                    if field in ('before', 'after'):
                        continue
                    resolved_values[field] = _resolve_report_field_value(db, field, val)
        elif log.entity_type in ('project_file', 'project_folder'):
            if log.action == 'UPDATE' and isinstance(changes, dict):
                after = changes.get('after') or {}
                before = changes.get('before') or {}
                all_fields = (set(before.keys()) if isinstance(before, dict) else set()) | (set(after.keys()) if isinstance(after, dict) else set())
                for field in all_fields:
                    resolved_values[field] = _resolve_file_field_value(db, field, after.get(field) if isinstance(after, dict) else None)
                    resolved_values_before[field] = _resolve_file_field_value(db, field, before.get(field) if isinstance(before, dict) else None)
            elif log.action == 'DELETE' and isinstance(changes, dict) and 'deleted_file' in changes:
                nested = changes['deleted_file'] if isinstance(changes.get('deleted_file'), dict) else {}
                for field, val in nested.items():
                    resolved_values[field] = _resolve_file_field_value(db, field, val)
            elif log.action == 'DELETE' and isinstance(changes, dict) and 'deleted_folder' in changes:
                nested = changes['deleted_folder'] if isinstance(changes.get('deleted_folder'), dict) else {}
                for field, val in nested.items():
                    resolved_values[field] = _resolve_file_field_value(db, field, val)
            elif isinstance(changes, dict):
                for field, val in changes.items():
                    if field in ('before', 'after'):
                        continue
                    resolved_values[field] = _resolve_file_field_value(db, field, val)
        elif log.entity_type in ('timesheet_entry', 'attendance'):
            if isinstance(changes, dict) and ('before' in changes or 'after' in changes):
                after = changes.get('after') or {}
                before = changes.get('before') or {}
                all_fields = (set(before.keys()) if isinstance(before, dict) else set()) | (set(after.keys()) if isinstance(after, dict) else set())
                for field in all_fields:
                    resolved_values[field] = _resolve_timesheet_field_value(db, field, after.get(field) if isinstance(after, dict) else None)
                    resolved_values_before[field] = _resolve_timesheet_field_value(db, field, before.get(field) if isinstance(before, dict) else None)
                # Also resolve flat top-level fields alongside before/after (e.g. work_date, minutes, source)
                for field, val in changes.items():
                    if field in ('before', 'after'):
                        continue
                    resolved_values[field] = _resolve_timesheet_field_value(db, field, val)
            elif isinstance(changes, dict):
                for field, val in changes.items():
                    resolved_values[field] = _resolve_timesheet_field_value(db, field, val)
        elif log.entity_type == 'shift':
            if isinstance(changes, dict) and ('before' in changes or 'after' in changes):
                after = changes.get('after') or {}
                before = changes.get('before') or {}
                all_fields = (set(before.keys()) if isinstance(before, dict) else set()) | (set(after.keys()) if isinstance(after, dict) else set())
                for field in all_fields:
                    resolved_values[field] = _resolve_shift_field_value(db, field, after.get(field) if isinstance(after, dict) else None)
                    resolved_values_before[field] = _resolve_shift_field_value(db, field, before.get(field) if isinstance(before, dict) else None)
            elif isinstance(changes, dict):
                for field, val in changes.items():
                    if field in ('before', 'after'):
                        continue
                    resolved_values[field] = _resolve_shift_field_value(db, field, val)
        elif log.entity_type in ('proposal', 'proposal_draft'):
            if log.action == 'DELETE' and isinstance(changes, dict):
                nested = changes.get('deleted_proposal') or changes.get('deleted_draft')
                if isinstance(nested, dict):
                    for field, val in nested.items():
                        resolved_values[field] = _resolve_proposal_field_value(db, field, val)
                for field, val in changes.items():
                    if field in ('deleted_proposal', 'deleted_draft'):
                        continue
                    resolved_values[field] = _resolve_proposal_field_value(db, field, val)
            elif isinstance(changes, dict):
                c_after = changes.get('after') or {}
                c_before = changes.get('before') or {}
                if (not c_after and not c_before) and (changes.get('pricing_changes') or changes.get('title') or changes.get('order_number') or changes.get('is_new')):
                    norm = _normalize_legacy_proposal_changes(db, changes)
                    if norm.get('before') or norm.get('after'):
                        c_before = norm.get('before') or {}
                        c_after = norm.get('after') or {}
                        changes = norm
                if isinstance(c_after, dict) and (c_after or c_before):
                    all_fields = set(c_before.keys()) | set(c_after.keys())
                    for field in all_fields:
                        val_a = c_after.get(field)
                        val_b = c_before.get(field)
                        if field.startswith('pricing__'):
                            resolved_values[field] = _resolve_pricing_key_value(db, field, val_a)
                            resolved_values_before[field] = _resolve_pricing_key_value(db, field, val_b)
                        elif field.startswith('service__'):
                            resolved_values[field] = _resolve_service_value(val_a)
                            resolved_values_before[field] = _resolve_service_value(val_b)
                        elif field.startswith('section__'):
                            resolved_values[field] = str(val_a) if val_a is not None else "—"
                            resolved_values_before[field] = str(val_b) if val_b is not None else "—"
                        else:
                            resolved_values[field] = _resolve_proposal_field_value(db, field, val_a)
                            resolved_values_before[field] = _resolve_proposal_field_value(db, field, val_b)

                # Flat fields (CREATE, GENERATE_PDF, etc.)
                for field, val in changes.items():
                    if field in ('before', 'after'):
                        continue
                    if field not in resolved_values:
                        resolved_values[field] = _resolve_proposal_field_value(db, field, val)

        result.append({
            "id": str(log.id),
            "timestamp": log.timestamp_utc.isoformat() if log.timestamp_utc else None,
            "entity_type": log.entity_type,
            "entity_id": str(log.entity_id) if log.entity_id else None,
            "action": log.action,
            "actor_id": str(log.actor_id) if log.actor_id else None,
            "actor_name": actor_name,
            "actor_avatar_file_id": actor_avatar,
            "actor_role": log.actor_role,
            "source": log.source,
            "changes": changes,
            "context": enriched_context,
            "resolved_values": resolved_values,
            "resolved_values_before": resolved_values_before if resolved_values_before else {},
            "affected_user_id": affected_user_id,
            "affected_user_name": affected_user_name,
            "project_name": project_name,
            "worker_name": worker_name,
        })
    
    return result




