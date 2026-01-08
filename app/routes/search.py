import uuid
from typing import Any, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from ..db import get_db
from ..auth.security import get_current_user, _has_permission
from ..models.models import (
    User,
    EmployeeProfile,
    Project,
    Client,
    Quote,
    FleetAsset,
    Equipment,
    WorkOrder,
)


router = APIRouter(prefix="/search", tags=["search"])


def _safe_uuid(val: Any) -> Optional[uuid.UUID]:
    try:
        return uuid.UUID(str(val))
    except Exception:
        return None


@router.get("")
def global_search(
    q: str = Query("", min_length=0),
    limit: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    q = (q or "").strip()
    if len(q) < 2:
        return {"sections": []}

    like = f"%{q}%"
    sections: list[dict] = []

    # ----- Projects (non-bidding) -----
    if _has_permission(user, "business:projects:read"):
        try:
            rows = (
                db.query(Project, Client)
                .outerjoin(Client, Project.client_id == Client.id)
                .filter(Project.is_bidding.is_(False))
                .filter(
                    or_(
                        Project.name.ilike(like),
                        Project.code.ilike(like),
                        Client.name.ilike(like),
                        Client.display_name.ilike(like),
                    )
                )
                .order_by(Project.created_at.desc())
                .limit(limit)
                .all()
            )
            items = []
            for p, c in rows:
                pid = str(p.id)
                code = (p.code or "").strip()
                name = (p.name or "").strip()
                title = f"{code} — {name}".strip(" —")
                client_name = ((getattr(c, "display_name", None) or getattr(c, "name", None) or "") if c else "").strip()
                items.append(
                    {
                        "type": "project",
                        "id": pid,
                        "title": title or name or pid,
                        "subtitle": client_name or None,
                        "href": f"/projects/{pid}",
                    }
                )
            if items:
                sections.append({"id": "projects", "label": "Projects", "items": items})
        except Exception:
            pass

    # ----- Opportunities (bidding) -----
    if _has_permission(user, "business:projects:read"):
        try:
            rows = (
                db.query(Project, Client)
                .outerjoin(Client, Project.client_id == Client.id)
                .filter(Project.is_bidding.is_(True))
                .filter(
                    or_(
                        Project.name.ilike(like),
                        Project.code.ilike(like),
                        Client.name.ilike(like),
                        Client.display_name.ilike(like),
                    )
                )
                .order_by(Project.created_at.desc())
                .limit(limit)
                .all()
            )
            items = []
            for p, c in rows:
                pid = str(p.id)
                code = (p.code or "").strip()
                name = (p.name or "").strip()
                title = f"{code} — {name}".strip(" —")
                client_name = ((getattr(c, "display_name", None) or getattr(c, "name", None) or "") if c else "").strip()
                items.append(
                    {
                        "type": "opportunity",
                        "id": pid,
                        "title": title or name or pid,
                        "subtitle": client_name or None,
                        "href": f"/opportunities/{pid}",
                    }
                )
            if items:
                sections.append({"id": "opportunities", "label": "Opportunities", "items": items})
        except Exception:
            pass

    # ----- Customers -----
    if _has_permission(user, "business:customers:read"):
        try:
            rows = (
                db.query(Client)
                .filter(
                    or_(
                        Client.name.ilike(like),
                        Client.display_name.ilike(like),
                        Client.code.ilike(like),
                        Client.city.ilike(like),
                        Client.province.ilike(like),
                    )
                )
                .order_by(Client.created_at.desc())
                .limit(limit)
                .all()
            )
            items = []
            for c in rows:
                cid = str(c.id)
                display = (getattr(c, "display_name", None) or "").strip()
                name = (getattr(c, "name", None) or "").strip()
                code = (getattr(c, "code", None) or "").strip()
                title = display or name or cid
                subtitle = " · ".join([x for x in [code, getattr(c, "city", None), getattr(c, "province", None)] if x])
                items.append(
                    {
                        "type": "customer",
                        "id": cid,
                        "title": title,
                        "subtitle": subtitle or None,
                        "href": f"/customers/{cid}",
                    }
                )
            if items:
                sections.append({"id": "customers", "label": "Customers", "items": items})
        except Exception:
            pass

    # ----- Quotes -----
    if _has_permission(user, "sales:quotations:read"):
        try:
            rows = (
                db.query(Quote, Client)
                .outerjoin(Client, Quote.client_id == Client.id)
                .filter(
                    or_(
                        Quote.name.ilike(like),
                        Quote.code.ilike(like),
                        Quote.order_number.ilike(like),
                        Client.name.ilike(like),
                        Client.display_name.ilike(like),
                    )
                )
                .order_by(Quote.updated_at.desc())
                .limit(limit)
                .all()
            )
            items = []
            for qu, c in rows:
                qid = str(qu.id)
                code = (getattr(qu, "code", None) or "").strip()
                name = (getattr(qu, "name", None) or "").strip()
                order = (getattr(qu, "order_number", None) or "").strip()
                client_name = ((getattr(c, "display_name", None) or getattr(c, "name", None) or "") if c else "").strip()
                title = f"{code} — {name}".strip(" —") or name or qid
                subtitle_parts = [x for x in [client_name, order] if x]
                items.append(
                    {
                        "type": "quote",
                        "id": qid,
                        "title": title,
                        "subtitle": " · ".join(subtitle_parts) or None,
                        "href": f"/quotes/{qid}",
                    }
                )
            if items:
                sections.append({"id": "quotes", "label": "Quotations", "items": items})
        except Exception:
            pass

    # ----- Fleet assets / equipment / work orders -----
    if _has_permission(user, "fleet:access") or _has_permission(user, "fleet:read"):
        try:
            rows = (
                db.query(FleetAsset)
                .filter(
                    or_(
                        FleetAsset.name.ilike(like),
                        FleetAsset.asset_number.ilike(like),
                        FleetAsset.license_plate.ilike(like),
                    )
                )
                .order_by(FleetAsset.updated_at.desc())
                .limit(limit)
                .all()
            )
            items = []
            for a in rows:
                aid = str(a.id)
                title = (getattr(a, "name", None) or "").strip() or aid
                subtitle = " · ".join([x for x in [(getattr(a, "asset_number", None) or "").strip(), (getattr(a, "license_plate", None) or "").strip()] if x])
                items.append({"type": "fleet_asset", "id": aid, "title": title, "subtitle": subtitle or None, "href": f"/fleet/assets/{aid}"})
            if items:
                sections.append({"id": "fleet_assets", "label": "Fleet Assets", "items": items})
        except Exception:
            pass

        try:
            rows = (
                db.query(Equipment)
                .filter(or_(Equipment.name.ilike(like), Equipment.asset_number.ilike(like)))
                .order_by(Equipment.updated_at.desc())
                .limit(limit)
                .all()
            )
            items = []
            for e in rows:
                eid = str(e.id)
                title = (getattr(e, "name", None) or "").strip() or eid
                subtitle = (getattr(e, "asset_number", None) or "").strip() or None
                items.append({"type": "equipment", "id": eid, "title": title, "subtitle": subtitle, "href": f"/fleet/equipment/{eid}"})
            if items:
                sections.append({"id": "equipment", "label": "Equipment", "items": items})
        except Exception:
            pass

        try:
            rows = (
                db.query(WorkOrder)
                .filter(
                    or_(
                        WorkOrder.work_order_number.ilike(like),
                        WorkOrder.description.ilike(like),
                        WorkOrder.category.ilike(like),
                    )
                )
                .order_by(WorkOrder.created_at.desc())
                .limit(limit)
                .all()
            )
            items = []
            for wo in rows:
                wid = str(wo.id)
                num = (getattr(wo, "work_order_number", None) or "").strip()
                desc = (getattr(wo, "description", None) or "").strip()
                title = num or wid
                items.append({"type": "work_order", "id": wid, "title": title, "subtitle": desc[:120] or None, "href": f"/fleet/work-orders/{wid}"})
            if items:
                sections.append({"id": "work_orders", "label": "Work Orders", "items": items})
        except Exception:
            pass

    # ----- Users -----
    if _has_permission(user, "hr:users:read") or _has_permission(user, "users:read"):
        try:
            rows = (
                db.query(User, EmployeeProfile)
                .outerjoin(EmployeeProfile, EmployeeProfile.user_id == User.id)
                .filter(
                    or_(
                        User.username.ilike(like),
                        User.email_personal.ilike(like),
                        EmployeeProfile.first_name.ilike(like),
                        EmployeeProfile.last_name.ilike(like),
                        EmployeeProfile.preferred_name.ilike(like),
                    )
                )
                .order_by(User.created_at.desc())
                .limit(limit)
                .all()
            )
            items = []
            for u, ep in rows:
                uid = str(u.id)
                preferred = ((getattr(ep, "preferred_name", None) or "") if ep else "").strip()
                first = ((getattr(ep, "first_name", None) or "") if ep else "").strip()
                last = ((getattr(ep, "last_name", None) or "") if ep else "").strip()
                name = preferred or " ".join([x for x in [first, last] if x]).strip()
                title = name or (getattr(u, "username", None) or "").strip() or uid
                subtitle = (getattr(u, "email_personal", None) or "").strip() or None
                items.append({"type": "user", "id": uid, "title": title, "subtitle": subtitle, "href": f"/users/{uid}"})
            if items:
                sections.append({"id": "users", "label": "Users", "items": items})
        except Exception:
            pass

    return {"sections": sections}

