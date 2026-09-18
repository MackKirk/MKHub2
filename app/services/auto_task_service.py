"""Fire coded auto-task triggers: create tasks, log, and in-app notifications."""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import structlog
from sqlalchemy.orm import Session

from ..models.models import (
    AutoTaskLog,
    AutoTaskRoute,
    Invite,
    Notification,
    SettingItem,
    TaskItem,
    User,
    user_divisions,
)
from ..schemas.auth import InviteRequest
from ..services.auto_task_catalog import (
    ALWAYS_ON_ONBOARDING_KEYS,
    AUTO_TASK_TRIGGERS,
    ONBOARDING_FLAG_TO_TRIGGER,
    get_trigger,
    render_template,
    sort_keys_by_starts_after,
)
from ..services.invite_hire import invite_display_name, parse_invite_date
from ..services.notifications import should_send_notification
from ..services.task_service import create_task_item, get_user_display

logger = structlog.get_logger()

ORIGIN_AUTO_TASK = "auto_task"


def _dash(value: Optional[str]) -> str:
    text = (value or "").strip()
    return text if text else "—"


def _parse_uuid(value: str) -> Optional[uuid.UUID]:
    try:
        return uuid.UUID(str(value))
    except (ValueError, TypeError, AttributeError):
        return None


def _as_id_list(raw: Optional[list]) -> list[str]:
    if not raw:
        return []
    out: list[str] = []
    seen: set[str] = set()
    for item in raw:
        parsed = _parse_uuid(str(item))
        if not parsed:
            continue
        key = str(parsed)
        if key in seen:
            continue
        seen.add(key)
        out.append(key)
    return out


def get_or_empty_route(db: Session, trigger_key: str) -> Optional[AutoTaskRoute]:
    return db.query(AutoTaskRoute).filter(AutoTaskRoute.trigger_key == trigger_key).first()


def route_starts_after_key(route: Optional[AutoTaskRoute]) -> Optional[str]:
    if route is None:
        return None
    key = (route.starts_after_key or "").strip()
    return key or None


def resolve_starts_after_key(trigger, route: Optional[AutoTaskRoute]) -> Optional[str]:
    """Saved route wins; catalog default is only a Settings prefill when unsaved."""
    if route is not None:
        return route_starts_after_key(route)
    return trigger.default_starts_after_key


def resolve_due_anchor(trigger, route: Optional[AutoTaskRoute]) -> str:
    if route is not None:
        anchor = (route.due_anchor or "").strip().lower()
        if anchor in ("hire_date", "invite_sent"):
            return anchor
    catalog_anchor = (getattr(trigger, "default_due_anchor", None) or "").strip().lower()
    if catalog_anchor in ("hire_date", "invite_sent"):
        return catalog_anchor
    return "invite_sent"


def resolve_due_in_days(trigger, route: Optional[AutoTaskRoute]) -> Optional[int]:
    if route is not None and route.due_in_days is not None:
        try:
            return int(route.due_in_days)
        except (TypeError, ValueError):
            return None
    default = getattr(trigger, "default_due_in_days", None)
    if default is None:
        return None
    try:
        return int(default)
    except (TypeError, ValueError):
        return None


def compute_due_date(
    *,
    due_anchor: str,
    due_in_days: Optional[int],
    context: dict[str, Any],
    trigger_key: str,
) -> Optional[datetime]:
    if due_in_days is None:
        return None
    try:
        offset = int(due_in_days)
    except (TypeError, ValueError):
        return None
    if offset < 0:
        return None

    now = datetime.now(timezone.utc)
    if due_anchor == "hire_date":
        raw = (context.get("hire_date_iso") or "").strip()
        parsed = parse_invite_date(raw) if raw else None
        if parsed is not None:
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=timezone.utc)
            base = parsed.replace(hour=0, minute=0, second=0, microsecond=0)
            return base + timedelta(days=offset)
        logger.warning(
            "auto_task_hire_date_missing_fallback_invite_sent",
            trigger_key=trigger_key,
        )
    return now + timedelta(days=offset)


def starts_after_map_from_routes(routes: list[AutoTaskRoute]) -> dict[str, Optional[str]]:
    return {r.trigger_key: route_starts_after_key(r) for r in routes}


def resolve_task_copy(trigger, route: Optional[AutoTaskRoute]) -> tuple[str, str]:
    title = (route.task_title or "").strip() if route else ""
    description = (route.task_description or "").strip() if route else ""
    if not title:
        title = trigger.task_title_template
    if not description:
        description = trigger.task_description_template
    return title, description


def _users_in_divisions(db: Session, division_ids: list[uuid.UUID]) -> list[User]:
    if not division_ids:
        return []
    rows = (
        db.query(user_divisions.c.user_id)
        .filter(user_divisions.c.division_id.in_(division_ids))
        .all()
    )
    ids = {row[0] for row in rows}
    if not ids:
        return []
    return db.query(User).filter(User.id.in_(ids), User.is_active.is_(True)).all()


def _queue_task_notification(
    db: Session,
    *,
    user_id: uuid.UUID,
    title: str,
    message: str,
    task_id: uuid.UUID,
    trigger_key: str,
) -> None:
    if not should_send_notification(db, str(user_id), "push"):
        return
    db.add(
        Notification(
            user_id=user_id,
            channel="push",
            template_key="auto_task",
            payload_json={
                "title": "New task assigned",
                "message": message or title,
                "type": "task",
                "read": False,
                "link": "/tasks",
                "metadata": {
                    "task_id": str(task_id),
                    "trigger_key": trigger_key,
                },
            },
            status="pending",
        )
    )


def _log_firing(
    db: Session,
    *,
    trigger_key: str,
    origin_type: str,
    origin_id: str,
    origin_label: Optional[str],
    status: str,
    task_ids: Optional[list[str]] = None,
    payload_json: Optional[dict] = None,
    error_message: Optional[str] = None,
    existing: Optional[AutoTaskLog] = None,
) -> AutoTaskLog:
    if existing is not None:
        existing.origin_type = origin_type
        existing.origin_label = origin_label if origin_label is not None else existing.origin_label
        existing.status = status
        existing.task_ids = task_ids or []
        existing.payload_json = payload_json
        existing.error_message = error_message
        db.flush()
        return existing
    row = AutoTaskLog(
        trigger_key=trigger_key,
        origin_type=origin_type,
        origin_id=str(origin_id),
        origin_label=origin_label,
        status=status,
        task_ids=task_ids or [],
        payload_json=payload_json,
        error_message=error_message,
    )
    db.add(row)
    db.flush()
    return row


def _find_log(
    db: Session,
    trigger_key: str,
    origin_id: str,
    status: str,
    *,
    for_update: bool = False,
) -> Optional[AutoTaskLog]:
    query = db.query(AutoTaskLog).filter(
        AutoTaskLog.trigger_key == trigger_key,
        AutoTaskLog.origin_id == str(origin_id),
        AutoTaskLog.status == status,
    )
    if for_update:
        query = query.with_for_update()
    return query.order_by(AutoTaskLog.created_at.desc()).first()


def _latest_log(db: Session, trigger_key: str, origin_id: str) -> Optional[AutoTaskLog]:
    return (
        db.query(AutoTaskLog)
        .filter(
            AutoTaskLog.trigger_key == trigger_key,
            AutoTaskLog.origin_id == str(origin_id),
        )
        .order_by(AutoTaskLog.created_at.desc())
        .first()
    )


def _task_ids_all_done(db: Session, task_ids: Optional[list]) -> bool:
    parsed: list[uuid.UUID] = []
    for raw in task_ids or []:
        uid = _parse_uuid(str(raw))
        if uid:
            parsed.append(uid)
    if not parsed:
        return True
    tasks = db.query(TaskItem).filter(TaskItem.id.in_(parsed)).all()
    if not tasks:
        return True
    return all((task.status or "") == "done" for task in tasks)


def _prereq_blocking(db: Session, starts_after_key: str, origin_id: str) -> bool:
    """True when the prerequisite fired for this origin and is not fully done yet."""
    log = _latest_log(db, starts_after_key, origin_id)
    if log is None:
        return False
    if log.status == "waiting":
        return True
    if log.status == "created":
        return not _task_ids_all_done(db, log.task_ids)
    return False


def fire_trigger(
    db: Session,
    trigger_key: str,
    *,
    origin_type: str,
    origin_id: str,
    origin_label: Optional[str],
    context: dict[str, Any],
    requested_by_id: Optional[uuid.UUID],
) -> Optional[AutoTaskLog]:
    trigger = get_trigger(trigger_key)
    if not trigger:
        return None

    existing_created = _find_log(db, trigger_key, str(origin_id), "created", for_update=True)
    if existing_created:
        return existing_created

    waiting = _find_log(db, trigger_key, str(origin_id), "waiting", for_update=True)
    waiting_payload = waiting.payload_json if waiting and isinstance(waiting.payload_json, dict) else {}
    if waiting_payload.get("context"):
        context = waiting_payload["context"]
    if waiting_payload.get("requested_by_id"):
        requested_by_id = _parse_uuid(str(waiting_payload["requested_by_id"])) or requested_by_id

    route = get_or_empty_route(db, trigger_key)
    if route is not None and route.enabled is False:
        return None

    user_ids = _as_id_list(route.recipient_user_ids if route else None)
    division_ids_raw = _as_id_list(route.recipient_division_ids if route else None)
    notify_push = True if route is None else bool(route.notify_push)
    due_anchor = resolve_due_anchor(trigger, route)
    due_in_days = resolve_due_in_days(trigger, route)
    title_template, description_template = resolve_task_copy(trigger, route)
    title = render_template(title_template, context)
    wait_payload = {
        "context": context,
        "title": title,
        "requested_by_id": str(requested_by_id) if requested_by_id else None,
    }

    if not user_ids and not division_ids_raw:
        return _log_firing(
            db,
            trigger_key=trigger_key,
            origin_type=origin_type,
            origin_id=str(origin_id),
            origin_label=origin_label,
            status="skipped_no_recipients",
            payload_json={"context": context},
            existing=waiting,
        )

    starts_after = route_starts_after_key(route)
    if starts_after and _prereq_blocking(db, starts_after, str(origin_id)):
        if waiting:
            return waiting
        return _log_firing(
            db,
            trigger_key=trigger_key,
            origin_type=origin_type,
            origin_id=str(origin_id),
            origin_label=origin_label,
            status="waiting",
            payload_json=wait_payload,
        )

    description = render_template(description_template, context)
    due_date = compute_due_date(
        due_anchor=due_anchor,
        due_in_days=due_in_days,
        context=context,
        trigger_key=trigger_key,
    )

    created_tasks: list[TaskItem] = []
    notify_user_ids: set[uuid.UUID] = set()

    try:
        for user_id_str in user_ids:
            user_uuid = _parse_uuid(user_id_str)
            if not user_uuid:
                continue
            task = create_task_item(
                db,
                title=title,
                description=description,
                requested_by_id=requested_by_id,
                assigned_to_id=user_uuid,
                priority="normal",
                due_date=due_date,
                origin_type=ORIGIN_AUTO_TASK,
                origin_reference=trigger_key,
                origin_id=str(origin_id),
            )
            created_tasks.append(task)
            notify_user_ids.add(user_uuid)

        division_uuids: list[uuid.UUID] = []
        for div_id_str in division_ids_raw:
            div_uuid = _parse_uuid(div_id_str)
            if not div_uuid:
                continue
            item = db.query(SettingItem).filter(SettingItem.id == div_uuid).first()
            if not item or not item.label:
                continue
            division_uuids.append(div_uuid)
            task = create_task_item(
                db,
                title=title,
                description=description,
                requested_by_id=requested_by_id,
                assigned_to_id=None,
                priority="normal",
                due_date=due_date,
                origin_type=ORIGIN_AUTO_TASK,
                origin_reference=trigger_key,
                origin_id=str(origin_id),
                assigned_division_label=item.label,
            )
            created_tasks.append(task)

        if not created_tasks:
            return _log_firing(
                db,
                trigger_key=trigger_key,
                origin_type=origin_type,
                origin_id=str(origin_id),
                origin_label=origin_label,
                status="skipped_no_recipients",
                payload_json={"context": context},
                existing=waiting,
            )

        if notify_push:
            for member in _users_in_divisions(db, division_uuids):
                notify_user_ids.add(member.id)
            for uid in notify_user_ids:
                _queue_task_notification(
                    db,
                    user_id=uid,
                    title=title,
                    message=title,
                    task_id=created_tasks[0].id,
                    trigger_key=trigger_key,
                )

        return _log_firing(
            db,
            trigger_key=trigger_key,
            origin_type=origin_type,
            origin_id=str(origin_id),
            origin_label=origin_label,
            status="created",
            task_ids=[str(t.id) for t in created_tasks],
            payload_json={"context": context, "title": title},
            existing=waiting,
        )
    except Exception as exc:
        logger.warning("auto_task_fire_failed", trigger_key=trigger_key, error=str(exc))
        return _log_firing(
            db,
            trigger_key=trigger_key,
            origin_type=origin_type,
            origin_id=str(origin_id),
            origin_label=origin_label,
            status="error",
            payload_json={"context": context},
            error_message=str(exc)[:500],
            existing=waiting,
        )


def invite_context(
    req: InviteRequest,
    *,
    db: Optional[Session] = None,
) -> dict[str, str]:
    email = (req.email_personal or "").strip()
    hire_raw = (req.hire_date or "").strip() if isinstance(req.hire_date, str) else ""

    pay_rate = (req.pay_rate or "").strip() if req.pay_rate else ""
    pay_type = (req.pay_type or "").strip() if req.pay_type else ""
    if pay_rate and pay_type:
        pay = f"{pay_rate} ({pay_type})"
    elif pay_rate:
        pay = pay_rate
    else:
        pay = ""

    supervisor = ""
    departments = ""
    project_divisions = ""

    if db is not None:
        mgr = (req.manager_user_id or "").strip() if req.manager_user_id else ""
        if mgr:
            try:
                mgr_uuid = uuid.UUID(mgr)
                supervisor = get_user_display(db, mgr_uuid) or ""
            except (ValueError, TypeError, AttributeError):
                supervisor = ""

        div_ids = [str(x).strip() for x in (req.division_ids or []) if str(x).strip()]
        if div_ids:
            labels: list[str] = []
            for raw in div_ids:
                try:
                    uid = uuid.UUID(raw)
                except (ValueError, TypeError, AttributeError):
                    continue
                item = db.query(SettingItem).filter(SettingItem.id == uid).first()
                if item and item.label:
                    labels.append(str(item.label))
            departments = ", ".join(labels)

        proj_ids = [str(x).strip() for x in (req.project_division_ids or []) if str(x).strip()]
        if proj_ids:
            # Project division labels are not always SettingItems; keep ids if unlabeled.
            project_divisions = ", ".join(proj_ids)

    return {
        "name": invite_display_name(req),
        "email": _dash(email),
        "phone": _dash(req.phone),
        "job_title": _dash(req.job_title),
        "hire_date": _dash(hire_raw),
        "hire_date_iso": hire_raw,
        "supervisor": _dash(supervisor),
        "departments": _dash(departments),
        "project_divisions": _dash(project_divisions),
        "pay": _dash(pay),
        "equipment_list": _dash(req.equipment_list),
    }


def fire_onboarding_invite_auto_tasks(
    db: Session,
    *,
    invite: Invite,
    req: InviteRequest,
    requested_by_id: uuid.UUID,
) -> None:
    context = invite_context(req, db=db)
    origin_id = str(invite.id)
    origin_label = req.email_personal
    flags = {
        "needs_email": bool(req.needs_email),
        "needs_business_card": bool(req.needs_business_card),
        "needs_phone": bool(req.needs_phone),
        "needs_vehicle": bool(req.needs_vehicle),
        "needs_equipment": bool(req.needs_equipment),
    }
    checkbox_keys = [
        trigger_key
        for flag, trigger_key in ONBOARDING_FLAG_TO_TRIGGER.items()
        if flags.get(flag)
    ]
    requested_keys = list(dict.fromkeys([*ALWAYS_ON_ONBOARDING_KEYS, *checkbox_keys]))
    routes = (
        db.query(AutoTaskRoute)
        .filter(AutoTaskRoute.trigger_key.in_(requested_keys))
        .all()
        if requested_keys
        else []
    )
    ordered_keys = sort_keys_by_starts_after(requested_keys, starts_after_map_from_routes(routes))
    for trigger_key in ordered_keys:
        try:
            fire_trigger(
                db,
                trigger_key,
                origin_type="invite",
                origin_id=origin_id,
                origin_label=origin_label,
                context=context,
                requested_by_id=requested_by_id,
            )
        except Exception as exc:
            logger.warning(
                "onboarding_auto_task_failed",
                trigger_key=trigger_key,
                invite_id=origin_id,
                error=str(exc),
            )


def fire_dependents_for_completed_task(db: Session, task: TaskItem) -> None:
    """When every auto-task copy for this trigger+origin is done, start dependents."""
    if (task.origin_type or "") != ORIGIN_AUTO_TASK:
        return
    completed_key = (task.origin_reference or "").strip()
    origin_id = (task.origin_id or "").strip()
    if not completed_key or not origin_id:
        return
    if not _task_ids_all_done_for_origin(db, completed_key, origin_id):
        return

    prereq_log = _find_log(db, completed_key, origin_id, "created")
    context: dict[str, Any] = {}
    origin_type = "invite"
    origin_label = None
    if prereq_log:
        origin_type = prereq_log.origin_type or origin_type
        origin_label = prereq_log.origin_label
        payload = prereq_log.payload_json if isinstance(prereq_log.payload_json, dict) else {}
        if isinstance(payload.get("context"), dict):
            context = payload["context"]

    for trigger in AUTO_TASK_TRIGGERS:
        route = get_or_empty_route(db, trigger.key)
        if route_starts_after_key(route) != completed_key:
            continue
        if route is not None and route.enabled is False:
            continue
        if not trigger.chain_only:
            waiting = _find_log(db, trigger.key, origin_id, "waiting")
            if waiting is None:
                continue
        try:
            fire_trigger(
                db,
                trigger.key,
                origin_type=origin_type,
                origin_id=origin_id,
                origin_label=origin_label,
                context=context,
                requested_by_id=task.requested_by_id,
            )
        except Exception as exc:
            logger.warning(
                "auto_task_dependent_failed",
                trigger_key=trigger.key,
                after=completed_key,
                origin_id=origin_id,
                error=str(exc),
            )


def _task_ids_all_done_for_origin(db: Session, trigger_key: str, origin_id: str) -> bool:
    tasks = (
        db.query(TaskItem)
        .filter(
            TaskItem.origin_type == ORIGIN_AUTO_TASK,
            TaskItem.origin_reference == trigger_key,
            TaskItem.origin_id == str(origin_id),
        )
        .all()
    )
    if not tasks:
        created = _find_log(db, trigger_key, origin_id, "created")
        return _task_ids_all_done(db, created.task_ids if created else [])
    return all((task.status or "") == "done" for task in tasks)


def serialize_route_recipients(db: Session, route: Optional[AutoTaskRoute]) -> dict:
    user_ids = _as_id_list(route.recipient_user_ids if route else None)
    division_ids = _as_id_list(route.recipient_division_ids if route else None)
    users = []
    for uid in user_ids:
        parsed = _parse_uuid(uid)
        if not parsed:
            continue
        users.append({"id": uid, "name": get_user_display(db, parsed) or uid})
    divisions = []
    if division_ids:
        items = (
            db.query(SettingItem)
            .filter(SettingItem.id.in_([_parse_uuid(i) for i in division_ids if _parse_uuid(i)]))
            .all()
        )
        by_id = {str(item.id): item.label for item in items}
        for did in division_ids:
            divisions.append({"id": did, "label": by_id.get(did) or did})
    return {"users": users, "divisions": divisions}
