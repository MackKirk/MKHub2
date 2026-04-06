"""
Serialize AuditLog ORM rows with actor names and entity display labels (shared admin + user activity).
"""
import uuid
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from ..models.models import (
    User,
    AuditLog,
    Project,
    Client,
    Proposal,
    Quote,
    FleetAsset,
    Equipment,
    WorkOrder,
    InspectionSchedule,
    FleetInspection,
    FleetComplianceRecord,
    EquipmentCheckout,
    AssetAssignment,
    FleetAssetAssignment,
    EquipmentAssignment,
    WorkOrderFile,
)


def user_display_for_audit(u: Optional[User]) -> str:
    if not u:
        return "—"
    part = u.username or ""
    email = u.email_corporate or u.email_personal or ""
    if email:
        part = f"{part} ({email})" if part else email
    return part or str(u.id)[:8] + "…"


def audit_rows_to_entry_dicts(db: Session, rows: List[AuditLog]) -> List[Dict[str, Any]]:
    """Same shape as admin AuditLogEntry JSON (for API responses)."""
    actor_ids = list({r.actor_id for r in rows if r.actor_id})
    actors: Dict[uuid.UUID, User] = {}
    if actor_ids:
        for u in db.query(User).filter(User.id.in_(actor_ids)).all():
            actors[u.id] = u

    entity_keys = [(r.entity_type, str(r.entity_id)) for r in rows if r.entity_id]
    entity_displays: Dict[tuple, str] = {}
    for et, eid in entity_keys:
        if (et, eid) in entity_displays:
            continue
        try:
            uid = uuid.UUID(eid)
        except ValueError:
            entity_displays[(et, eid)] = eid[:20] + "…" if len(eid) > 20 else eid
            continue
        if et == "project":
            p = db.query(Project).filter(Project.id == uid, Project.deleted_at.is_(None)).first()
            entity_displays[(et, eid)] = f"{p.name} ({p.code})" if p and getattr(p, "code", None) else (p.name if p else eid[:8] + "…")
        elif et == "client":
            c = db.query(Client).filter(Client.id == uid, Client.deleted_at.is_(None)).first()
            entity_displays[(et, eid)] = (c.display_name or c.name) if c else eid[:8] + "…"
        elif et == "proposal":
            p = db.query(Proposal).filter(Proposal.id == uid, Proposal.deleted_at.is_(None)).first()
            entity_displays[(et, eid)] = (p.title or f"Proposal {eid[:8]}") if p else eid[:8] + "…"
        elif et == "quote":
            q = db.query(Quote).filter(Quote.id == uid, Quote.deleted_at.is_(None)).first()
            entity_displays[(et, eid)] = (q.title or q.code or f"Quote {eid[:8]}") if q else eid[:8] + "…"
        elif et == "fleet_asset":
            fa = db.query(FleetAsset).filter(FleetAsset.id == uid).first()
            if fa:
                label = (fa.name or "").strip() or (fa.unit_number or "").strip() or str(fa.id)[:8]
                un = fa.unit_number
                entity_displays[(et, eid)] = f"{label} ({un})" if un else label
            else:
                entity_displays[(et, eid)] = eid[:8] + "…"
        elif et == "equipment":
            eq = db.query(Equipment).filter(Equipment.id == uid).first()
            if eq:
                label = (eq.name or "").strip() or (eq.unit_number or "").strip() or str(eq.id)[:8]
                un = eq.unit_number
                entity_displays[(et, eid)] = f"{label} ({un})" if un else label
            else:
                entity_displays[(et, eid)] = eid[:8] + "…"
        elif et == "work_order":
            wo = db.query(WorkOrder).filter(WorkOrder.id == uid).first()
            entity_displays[(et, eid)] = wo.work_order_number if wo else eid[:8] + "…"
        elif et == "inspection_schedule":
            sch = db.query(InspectionSchedule).filter(InspectionSchedule.id == uid).first()
            if sch:
                fa = db.query(FleetAsset).filter(FleetAsset.id == sch.fleet_asset_id).first()
                an = (fa.name or fa.unit_number or "") if fa else ""
                dt = sch.scheduled_at.isoformat()[:16] if sch.scheduled_at else ""
                entity_displays[(et, eid)] = f"Inspection {dt} · {an}".strip(" ·") or f"Schedule {eid[:8]}…"
            else:
                entity_displays[(et, eid)] = eid[:8] + "…"
        elif et == "fleet_inspection":
            ins = db.query(FleetInspection).filter(FleetInspection.id == uid).first()
            if ins:
                fa = db.query(FleetAsset).filter(FleetAsset.id == ins.fleet_asset_id).first()
                an = (fa.name or fa.unit_number or "") if fa else ""
                entity_displays[(et, eid)] = f"{ins.inspection_type or 'inspection'} · {an}".strip(" ·") or eid[:8] + "…"
            else:
                entity_displays[(et, eid)] = eid[:8] + "…"
        elif et == "fleet_compliance_record":
            rec = db.query(FleetComplianceRecord).filter(FleetComplianceRecord.id == uid).first()
            if rec:
                fa = db.query(FleetAsset).filter(FleetAsset.id == rec.fleet_asset_id).first()
                an = (fa.name or fa.unit_number or "") if fa else ""
                entity_displays[(et, eid)] = f"{rec.record_type or 'Compliance'} · {an}".strip(" ·")
            else:
                entity_displays[(et, eid)] = eid[:8] + "…"
        elif et == "equipment_checkout":
            co = db.query(EquipmentCheckout).filter(EquipmentCheckout.id == uid).first()
            if co:
                eq = db.query(Equipment).filter(Equipment.id == co.equipment_id).first()
                entity_displays[(et, eid)] = f"Checkout · {(eq.name or eq.unit_number) if eq else eid[:8]}"
            else:
                entity_displays[(et, eid)] = eid[:8] + "…"
        elif et == "asset_assignment":
            aa = db.query(AssetAssignment).filter(AssetAssignment.id == uid).first()
            if aa:
                tgt = aa.target_type or "asset"
                entity_displays[(et, eid)] = f"Assignment ({tgt}) {eid[:8]}…"
            else:
                entity_displays[(et, eid)] = eid[:8] + "…"
        elif et == "fleet_asset_assignment":
            fa = db.query(FleetAssetAssignment).filter(FleetAssetAssignment.id == uid).first()
            entity_displays[(et, eid)] = f"Fleet assignment {eid[:8]}…" if fa else eid[:8] + "…"
        elif et == "equipment_assignment":
            ea = db.query(EquipmentAssignment).filter(EquipmentAssignment.id == uid).first()
            entity_displays[(et, eid)] = f"Equipment assignment {eid[:8]}…" if ea else eid[:8] + "…"
        elif et == "work_order_file":
            wf = db.query(WorkOrderFile).filter(WorkOrderFile.id == uid).first()
            if wf:
                wo = db.query(WorkOrder).filter(WorkOrder.id == wf.work_order_id).first()
                wn = wo.work_order_number if wo else str(wf.work_order_id)[:8]
                nm = wf.original_name or "file"
                entity_displays[(et, eid)] = f"{wn} · {nm}"
            else:
                entity_displays[(et, eid)] = eid[:8] + "…"
        elif et == "fleet_operation":
            u = db.query(User).filter(User.id == uid).first()
            entity_displays[(et, eid)] = f"Fleet operation · {user_display_for_audit(u)}"
        else:
            entity_displays[(et, eid)] = f"{et} {eid[:8]}…"

    return [
        {
            "id": str(r.id),
            "timestamp_utc": r.timestamp_utc.isoformat() if r.timestamp_utc else "",
            "entity_type": r.entity_type,
            "entity_id": str(r.entity_id) if r.entity_id else "",
            "entity_display": entity_displays.get((r.entity_type, str(r.entity_id))) if r.entity_id else None,
            "action": r.action,
            "actor_id": str(r.actor_id) if r.actor_id else None,
            "actor_name": user_display_for_audit(actors.get(r.actor_id)) if r.actor_id else None,
            "actor_role": r.actor_role,
            "source": r.source,
            "changes_json": r.changes_json,
            "context": r.context,
        }
        for r in rows
    ]
