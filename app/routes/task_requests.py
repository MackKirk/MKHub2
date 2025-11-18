import uuid
from datetime import datetime
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from ..auth.security import get_current_user
from ..db import get_db
from ..models.models import (
    EmployeeProfile,
    SettingItem,
    TaskItem,
    TaskRequest,
    TaskRequestMessage,
    User,
)
from ..services.task_service import create_task_from_request, get_user_display


router = APIRouter(prefix="/task-requests", tags=["task-requests"])

PRIORITIES = {"low", "normal", "high", "urgent"}
FINAL_REQUEST_STATUSES = {"accepted", "refused"}


def _get_user_division(db: Session, user_id: uuid.UUID) -> Optional[str]:
    profile = db.query(EmployeeProfile).filter(EmployeeProfile.user_id == user_id).first()
    return profile.division if profile else None


def _serialize_message(message: TaskRequestMessage) -> Dict[str, Any]:
    return {
        "id": str(message.id),
        "sender_id": str(message.sender_id) if message.sender_id else None,
        "sender_name": message.sender_name,
        "message_type": message.message_type,
        "body": message.body,
        "created_at": message.created_at.isoformat(),
    }


def _status_label(request: TaskRequest, *, viewer_is_requester: bool) -> str:
    if request.status == "needs_info" and viewer_is_requester:
        return "Waiting for requester"
    mapping = {
        "new": "New",
        "needs_info": "Needs information",
        "accepted": "Accepted",
        "refused": "Refused",
    }
    return mapping.get(request.status, request.status.replace("_", " ").title())


def _serialize_request(
    request: TaskRequest,
    *,
    viewer_id: Optional[uuid.UUID] = None,
    viewer_division: Optional[str] = None,
) -> Dict[str, Any]:
    viewer_is_requester = viewer_id and request.requested_by_id == viewer_id
    viewer_is_target = False
    if viewer_id and request.target_user_id == viewer_id:
        viewer_is_target = True
    elif request.target_type == "division" and request.target_division_label and viewer_division:
        if viewer_division == request.target_division_label:
            viewer_is_target = True

    data: Dict[str, Any] = {
        "id": str(request.id),
        "title": request.title,
        "description": request.description,
        "status": request.status,
        "status_label": _status_label(request, viewer_is_requester=bool(viewer_is_requester)),
        "priority": request.priority,
        "due_date": request.due_date.isoformat() if request.due_date else None,
        "requested_by": {
            "id": str(request.requested_by_id) if request.requested_by_id else None,
            "name": request.requested_by_name,
        },
        "target": {
            "type": request.target_type,
            "user_id": str(request.target_user_id) if request.target_user_id else None,
            "user_name": request.target_user_name,
            "division_id": str(request.target_division_id) if request.target_division_id else None,
            "division_label": request.target_division_label,
        },
        "project": {
            "id": str(request.project_id) if request.project_id else None,
            "name": request.project_name,
            "code": request.project_code,
        },
        "created_at": request.created_at.isoformat(),
        "updated_at": request.updated_at.isoformat(),
        "accepted_task_id": str(request.accepted_task_id) if request.accepted_task_id else None,
    }

    if request.messages:
        data["messages"] = [_serialize_message(m) for m in request.messages]

    if request.task:
        data["task"] = {
            "id": str(request.task.id),
            "status": request.task.status,
            "title": request.task.title,
        }

    data["permissions"] = {
        "can_request_info": viewer_is_target and request.status not in FINAL_REQUEST_STATUSES,
        "can_accept": viewer_is_target and request.status == "new",
        "can_refuse": viewer_is_target and request.status not in FINAL_REQUEST_STATUSES,
        "can_provide_info": viewer_is_requester and request.status == "needs_info",
    }
    return data


def _parse_due_date(raw: Optional[str]) -> Optional[datetime]:
    if not raw:
        return None
    try:
        # Support both date-only and ISO datetime strings
        if len(raw) == 10:
            return datetime.fromisoformat(raw + "T00:00:00")
        return datetime.fromisoformat(raw)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid due_date format") from exc


def _get_target_division(db: Session, division_id: Optional[str], division_label: Optional[str]) -> tuple[Optional[uuid.UUID], Optional[str]]:
    if division_id:
        try:
            division_uuid = uuid.UUID(str(division_id))
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="Invalid division id") from exc
        item = db.query(SettingItem).filter(SettingItem.id == division_uuid).first()
        if not item:
            raise HTTPException(status_code=404, detail="Division not found")
        return division_uuid, item.label
    if division_label:
        return None, division_label.strip() or None
    raise HTTPException(status_code=400, detail="Division information is required")


def _get_target_user(db: Session, user_id: str) -> User:
    try:
        user_uuid = uuid.UUID(str(user_id))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid user id") from exc
    user = db.query(User).filter(User.id == user_uuid).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.get("")
def list_task_requests(db: Session = Depends(get_db), me: User = Depends(get_current_user)):
    viewer_division = _get_user_division(db, me.id)

    sent = (
        db.query(TaskRequest)
        .filter(TaskRequest.requested_by_id == me.id)
        .order_by(TaskRequest.created_at.desc())
        .all()
    )

    recipient_filters = [and_(TaskRequest.target_type == "user", TaskRequest.target_user_id == me.id)]
    if viewer_division:
        recipient_filters.append(
            and_(
                TaskRequest.target_type == "division",
                TaskRequest.target_division_label == viewer_division,
            )
        )

    received = (
        db.query(TaskRequest)
        .filter(or_(*recipient_filters))
        .order_by(TaskRequest.created_at.desc())
        .all()
    )

    return {
        "sent": [_serialize_request(r, viewer_id=me.id, viewer_division=viewer_division) for r in sent],
        "received": [_serialize_request(r, viewer_id=me.id, viewer_division=viewer_division) for r in received],
    }


@router.get("/{request_id}")
def get_task_request(request_id: str, db: Session = Depends(get_db), me: User = Depends(get_current_user)):
    try:
        req_uuid = uuid.UUID(str(request_id))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid request id") from exc

    request = db.query(TaskRequest).filter(TaskRequest.id == req_uuid).first()
    if not request:
        raise HTTPException(status_code=404, detail="Task request not found")

    viewer_division = _get_user_division(db, me.id)
    return _serialize_request(request, viewer_id=me.id, viewer_division=viewer_division)


@router.post("")
def create_task_request(payload: Dict[str, Any], db: Session = Depends(get_db), me: User = Depends(get_current_user)):
    title = (payload.get("title") or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="Title is required")

    target_type = (payload.get("target_type") or "user").lower()
    if target_type not in {"user", "division"}:
        raise HTTPException(status_code=400, detail="target_type must be 'user' or 'division'")

    target_user = None
    target_division_id: Optional[uuid.UUID] = None
    target_division_label: Optional[str] = None

    if target_type == "user":
        target_user_id = payload.get("target_user_id")
        if not target_user_id:
            raise HTTPException(status_code=400, detail="target_user_id is required")
        target_user = _get_target_user(db, target_user_id)
    else:
        div_id = payload.get("target_division_id")
        div_label = payload.get("target_division_label")
        target_division_id, target_division_label = _get_target_division(db, div_id, div_label)
        if not target_division_label:
            raise HTTPException(status_code=400, detail="Division label is required")

    priority = (payload.get("priority") or "normal").lower()
    if priority not in PRIORITIES:
        raise HTTPException(status_code=400, detail="Invalid priority")

    project_id = payload.get("project_id")
    project_uuid = None
    if project_id:
        try:
            project_uuid = uuid.UUID(str(project_id))
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="Invalid project id") from exc

    due_date = _parse_due_date(payload.get("due_date"))

    request = TaskRequest(
        title=title,
        description=payload.get("description") or "",
        status="new",
        priority=priority,
        due_date=due_date,
        requested_by_id=me.id,
        requested_by_name=get_user_display(db, me.id),
        target_type=target_type,
        target_user_id=target_user.id if target_user else None,
        target_user_name=get_user_display(db, target_user.id) if target_user else None,
        target_division_id=target_division_id,
        target_division_label=target_division_label,
        project_id=project_uuid,
    )

    if project_uuid:
        from ..models.models import Project  # Local import to avoid circular

        project = db.query(Project).filter(Project.id == project_uuid).first()
        if project:
            request.project_name = project.name
            request.project_code = project.code

    db.add(request)
    db.commit()
    db.refresh(request)

    viewer_division = _get_user_division(db, me.id)
    return _serialize_request(request, viewer_id=me.id, viewer_division=viewer_division)


def _ensure_request_target(
    request: TaskRequest,
    *,
    me: User,
    viewer_division: Optional[str],
) -> None:
    if request.target_type == "user":
        if request.target_user_id != me.id:
            raise HTTPException(status_code=403, detail="Not allowed for this request")
    else:
        if not viewer_division or viewer_division != request.target_division_label:
            raise HTTPException(status_code=403, detail="Not part of the target division")


@router.post("/{request_id}/ask-info")
def ask_for_information(
    request_id: str,
    payload: Dict[str, Any],
    db: Session = Depends(get_db),
    me: User = Depends(get_current_user),
):
    request = _get_request_for_update(request_id, db)
    if request.status in FINAL_REQUEST_STATUSES:
        raise HTTPException(status_code=400, detail="Request already finalized")

    viewer_division = _get_user_division(db, me.id)
    _ensure_request_target(request, me=me, viewer_division=viewer_division)

    message_text = (payload.get("message") or "").strip()
    if not message_text:
        raise HTTPException(status_code=400, detail="Message is required")

    message = TaskRequestMessage(
        request=request,
        sender_id=me.id,
        sender_name=get_user_display(db, me.id),
        message_type="info_request",
        body=message_text,
    )
    db.add(message)
    request.status = "needs_info"
    request.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(request)

    return _serialize_request(request, viewer_id=me.id, viewer_division=viewer_division)


@router.post("/{request_id}/provide-info")
def provide_information(
    request_id: str,
    payload: Dict[str, Any],
    db: Session = Depends(get_db),
    me: User = Depends(get_current_user),
):
    request = _get_request_for_update(request_id, db)
    if request.requested_by_id != me.id:
        raise HTTPException(status_code=403, detail="Only the requester can respond")

    message_text = (payload.get("message") or "").strip()
    if not message_text:
        raise HTTPException(status_code=400, detail="Message is required")

    message = TaskRequestMessage(
        request=request,
        sender_id=me.id,
        sender_name=get_user_display(db, me.id),
        message_type="info_response",
        body=message_text,
    )
    db.add(message)
    request.status = "new"
    request.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(request)

    viewer_division = _get_user_division(db, me.id)
    return _serialize_request(request, viewer_id=me.id, viewer_division=viewer_division)


@router.post("/{request_id}/refuse")
def refuse_request(
    request_id: str,
    payload: Dict[str, Any],
    db: Session = Depends(get_db),
    me: User = Depends(get_current_user),
):
    request = _get_request_for_update(request_id, db)
    if request.status in FINAL_REQUEST_STATUSES:
        raise HTTPException(status_code=400, detail="Request already finalized")

    viewer_division = _get_user_division(db, me.id)
    _ensure_request_target(request, me=me, viewer_division=viewer_division)

    reason = (payload.get("message") or "").strip()
    if reason:
        db.add(
            TaskRequestMessage(
                request=request,
                sender_id=me.id,
                sender_name=get_user_display(db, me.id),
                message_type="refused",
                body=reason,
            )
        )

    request.status = "refused"
    request.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(request)

    return _serialize_request(request, viewer_id=me.id, viewer_division=viewer_division)


def _get_request_for_update(request_id: str, db: Session) -> TaskRequest:
    try:
        req_uuid = uuid.UUID(str(request_id))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid request id") from exc
    request = db.query(TaskRequest).filter(TaskRequest.id == req_uuid).first()
    if not request:
        raise HTTPException(status_code=404, detail="Task request not found")
    return request


@router.post("/{request_id}/accept")
def accept_request(
    request_id: str,
    db: Session = Depends(get_db),
    me: User = Depends(get_current_user),
):
    request = _get_request_for_update(request_id, db)
    if request.status == "accepted":
        raise HTTPException(status_code=400, detail="Request already accepted")
    if request.status == "refused":
        raise HTTPException(status_code=400, detail="Request was refused")

    viewer_division = _get_user_division(db, me.id)
    _ensure_request_target(request, me=me, viewer_division=viewer_division)

    assigned_to_id: Optional[uuid.UUID] = None
    assigned_division_label: Optional[str] = None

    if request.target_type == "user":
        assigned_to_id = request.target_user_id
    else:
        assigned_to_id = me.id
        assigned_division_label = viewer_division

    task = create_task_from_request(
        db,
        request,
        assigned_to_id=assigned_to_id,
        assigned_division_label=assigned_division_label,
    )
    task.status = "accepted"

    request.status = "accepted"
    request.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(request)
    db.refresh(task)

    response = _serialize_request(request, viewer_id=me.id, viewer_division=viewer_division)
    response["task"] = {
        "id": str(task.id),
        "status": task.status,
        "title": task.title,
    }
    return response

