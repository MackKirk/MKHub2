import uuid
from datetime import datetime
from typing import Optional, List, Set

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, and_

from ..db import get_db
from ..auth.security import get_current_user, decode_token
from ..models.models import (
    User,
    EmployeeProfile,
    ChatConversation,
    ChatConversationMember,
    ChatMessage,
    ChatMessageRead,
)
from ..services.chat_hub import hub


router = APIRouter(prefix="/chat", tags=["chat"])


def _user_basic(u: User, ep: Optional[EmployeeProfile]) -> dict:
    name = (getattr(ep, "preferred_name", None) or "").strip() if ep else ""
    if not name:
        first = (getattr(ep, "first_name", None) or "").strip() if ep else ""
        last = (getattr(ep, "last_name", None) or "").strip() if ep else ""
        name = " ".join([x for x in [first, last] if x])
    avatar_id = str(getattr(ep, "profile_photo_file_id")) if ep and getattr(ep, "profile_photo_file_id", None) else None
    avatar_url = f"/files/{avatar_id}/thumbnail?w=40" if avatar_id else None
    return {"id": str(u.id), "username": u.username, "name": name or u.username, "avatar_url": avatar_url}


@router.get("/users")
def list_users(q: Optional[str] = None, limit: int = 50, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    query = db.query(User, EmployeeProfile).outerjoin(EmployeeProfile, EmployeeProfile.user_id == User.id)
    if q:
        like = f"%{q}%"
        query = query.filter(
            (User.username.ilike(like))
            | (User.email_personal.ilike(like))
            | (EmployeeProfile.first_name.ilike(like))
            | (EmployeeProfile.last_name.ilike(like))
            | (EmployeeProfile.preferred_name.ilike(like))
        )
    rows = query.order_by(User.created_at.desc()).limit(max(1, min(200, limit))).all()
    return [_user_basic(u, ep) for u, ep in rows]


def _conversation_summary(db: Session, conv: ChatConversation, me_id: uuid.UUID) -> dict:
    last = (
        db.query(ChatMessage)
        .filter(ChatMessage.conversation_id == conv.id)
        .order_by(ChatMessage.created_at.desc())
        .limit(1)
        .first()
    )
    last_msg = None
    if last:
        last_msg = {
            "id": str(last.id),
            "sender_id": str(last.sender_id),
            "content": last.content,
            "created_at": last.created_at.isoformat(),
        }
    # Unread count for me
    unread = (
        db.query(func.count(ChatMessage.id))
        .outerjoin(
            ChatMessageRead,
            and_(ChatMessageRead.message_id == ChatMessage.id, ChatMessageRead.user_id == me_id),
        )
        .filter(
            ChatMessage.conversation_id == conv.id,
            ChatMessage.sender_id != me_id,
            ChatMessageRead.id.is_(None),
        )
        .scalar()
        or 0
    )
    # Members with details
    member_rows = db.query(ChatConversationMember).filter(ChatConversationMember.conversation_id == conv.id).all()
    member_ids = [m.user_id for m in member_rows]
    members_detail = []
    other_user = None
    for uid in member_ids:
        u = db.query(User).filter(User.id == uid).first()
        if not u:
            continue
        ep = db.query(EmployeeProfile).filter(EmployeeProfile.user_id == uid).first()
        user_data = _user_basic(u, ep)
        members_detail.append(user_data)
        if not conv.is_group and uid != me_id:
            other_user = user_data
    # Title for 1-1: use other user's name
    title = conv.title
    if not conv.is_group and other_user:
        title = other_user.get("name") or other_user.get("username") or "Conversation"
    # Avatar URL for 1-1
    avatar_url = None
    if not conv.is_group and other_user:
        avatar_url = other_user.get("avatar_url")
    return {
        "id": str(conv.id),
        "title": title,
        "is_group": bool(conv.is_group),
        "members": [str(m.user_id) for m in member_rows],
        "members_detail": members_detail,
        "other_user": other_user,
        "avatar_url": avatar_url,
        "last_message": last_msg,
        "unread": int(unread),
        "updated_at": conv.updated_at.isoformat() if conv.updated_at else None,
    }


@router.get("/conversations")
def list_my_conversations(db: Session = Depends(get_db), me: User = Depends(get_current_user)):
    convs = (
        db.query(ChatConversation)
        .join(ChatConversationMember, ChatConversationMember.conversation_id == ChatConversation.id)
        .filter(ChatConversationMember.user_id == me.id)
        .order_by(ChatConversation.updated_at.desc(), ChatConversation.created_at.desc())
        .limit(100)
        .all()
    )
    return [_conversation_summary(db, c, me.id) for c in convs]


@router.post("/conversations")
def create_or_get_conversation(payload: dict, db: Session = Depends(get_db), me: User = Depends(get_current_user)):
    is_group = bool(payload.get("is_group") or False)
    title = payload.get("title")
    member_ids: List[str] = payload.get("member_user_ids") or []

    # For 1-1, normalize to exactly two members (me + target)
    if not is_group:
        other_id_raw = payload.get("participant_user_id")
        if not other_id_raw:
            raise HTTPException(status_code=400, detail="participant_user_id required")
        try:
            other_id = uuid.UUID(str(other_id_raw))
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid participant id")
        # Find existing 1-1 conversation
        candidate = (
            db.query(ChatConversation)
            .join(ChatConversationMember, ChatConversationMember.conversation_id == ChatConversation.id)
            .filter(ChatConversation.is_group == False, ChatConversationMember.user_id.in_([me.id, other_id]))
            .group_by(ChatConversation.id)
            .having(func.count(ChatConversationMember.user_id) == 2)
            .first()
        )
        if candidate:
            return _conversation_summary(db, candidate, me.id)
        # Create new 1-1 conversation
        conv = ChatConversation(is_group=False, title=None)
        db.add(conv)
        db.flush()
        db.add_all(
            [
                ChatConversationMember(conversation_id=conv.id, user_id=me.id),
                ChatConversationMember(conversation_id=conv.id, user_id=other_id),
            ]
        )
        conv.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(conv)
        return _conversation_summary(db, conv, me.id)

    # Groups (phase 2-ready): validate members include me
    try:
        member_uuid_set: Set[uuid.UUID] = {uuid.UUID(str(x)) for x in member_ids}
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid member ids")
    member_uuid_set.add(me.id)
    if len(member_uuid_set) < 2:
        raise HTTPException(status_code=400, detail="At least two members required")
    conv = ChatConversation(is_group=True, title=(title or None))
    db.add(conv)
    db.flush()
    db.add_all([ChatConversationMember(conversation_id=conv.id, user_id=uid) for uid in member_uuid_set])
    conv.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(conv)
    return _conversation_summary(db, conv, me.id)


@router.get("/conversations/{conversation_id}/messages")
def get_messages(
    conversation_id: str,
    before: Optional[str] = Query(None),
    after: Optional[str] = Query(None),
    limit: int = 50,
    db: Session = Depends(get_db),
    me: User = Depends(get_current_user),
):
    try:
        conv_id = uuid.UUID(str(conversation_id))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid id")
    # Ensure membership
    is_member = (
        db.query(ChatConversationMember)
        .filter(ChatConversationMember.conversation_id == conv_id, ChatConversationMember.user_id == me.id)
        .first()
        is not None
    )
    if not is_member:
        raise HTTPException(status_code=403, detail="Forbidden")

    query = db.query(ChatMessage).filter(ChatMessage.conversation_id == conv_id)
    if before:
        try:
            ts = datetime.fromisoformat(before)
            query = query.filter(ChatMessage.created_at < ts)
        except Exception:
            pass
    if after:
        try:
            ts2 = datetime.fromisoformat(after)
            query = query.filter(ChatMessage.created_at > ts2)
        except Exception:
            pass
    rows = query.order_by(ChatMessage.created_at.asc()).limit(max(1, min(200, limit))).all()
    return [
        {
            "id": str(m.id),
            "sender_id": str(m.sender_id),
            "content": m.content,
            "created_at": m.created_at.isoformat(),
        }
        for m in rows
    ]


@router.post("/conversations/{conversation_id}/messages")
def send_message(conversation_id: str, payload: dict, db: Session = Depends(get_db), me: User = Depends(get_current_user)):
    try:
        conv_id = uuid.UUID(str(conversation_id))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid id")
    # Ensure membership
    is_member = (
        db.query(ChatConversationMember)
        .filter(ChatConversationMember.conversation_id == conv_id, ChatConversationMember.user_id == me.id)
        .first()
        is not None
    )
    if not is_member:
        raise HTTPException(status_code=403, detail="Forbidden")

    content = (payload.get("content") or "").strip()
    if not content:
        raise HTTPException(status_code=400, detail="Empty message")

    msg = ChatMessage(conversation_id=conv_id, sender_id=me.id, content=content)
    db.add(msg)
    # Touch conversation
    conv = db.query(ChatConversation).filter(ChatConversation.id == conv_id).first()
    if conv:
        conv.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(msg)

    # Broadcast new message to all members
    member_rows = db.query(ChatConversationMember).filter(ChatConversationMember.conversation_id == conv_id).all()
    member_ids = {str(m.user_id) for m in member_rows}
    payload_out = {
        "conversation_id": str(conv_id),
        "message": {
            "id": str(msg.id),
            "sender_id": str(msg.sender_id),
            "content": msg.content,
            "created_at": msg.created_at.isoformat(),
        },
    }
    # Async fire-and-forget
    import anyio

    async def _broadcast():
        await hub.broadcast_to_users(member_ids, "message_new", payload_out)

    anyio.from_thread.run(_broadcast)  # type: ignore

    return payload_out


@router.post("/conversations/{conversation_id}/read")
def mark_read(conversation_id: str, db: Session = Depends(get_db), me: User = Depends(get_current_user)):
    try:
        conv_id = uuid.UUID(str(conversation_id))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid id")
    # Ensure membership
    is_member = (
        db.query(ChatConversationMember)
        .filter(ChatConversationMember.conversation_id == conv_id, ChatConversationMember.user_id == me.id)
        .first()
        is not None
    )
    if not is_member:
        raise HTTPException(status_code=403, detail="Forbidden")

    # Find unread messages from others
    unread_msgs = (
        db.query(ChatMessage.id)
        .outerjoin(
            ChatMessageRead, and_(ChatMessageRead.message_id == ChatMessage.id, ChatMessageRead.user_id == me.id)
        )
        .filter(ChatMessage.conversation_id == conv_id, ChatMessage.sender_id != me.id, ChatMessageRead.id.is_(None))
        .all()
    )
    to_insert = [ChatMessageRead(message_id=row.id, user_id=me.id) for row in unread_msgs]
    if to_insert:
        db.add_all(to_insert)
        db.commit()

    # Send updated unread_count
    total_unread = get_unread_count(db=db, me=me)
    import anyio

    async def _notify():
        await hub.send_to_user(str(me.id), "unread_count", {"total": total_unread})

    anyio.from_thread.run(_notify)  # type: ignore
    return {"ok": True}


@router.get("/unread_count")
def get_unread_count(db: Session = Depends(get_db), me: User = Depends(get_current_user)):
    # Count messages not sent by me with no read receipt for me
    count = (
        db.query(func.count(ChatMessage.id))
        .join(ChatConversation, ChatConversation.id == ChatMessage.conversation_id)
        .join(ChatConversationMember, ChatConversationMember.conversation_id == ChatConversation.id)
        .outerjoin(
            ChatMessageRead,
            and_(ChatMessageRead.message_id == ChatMessage.id, ChatMessageRead.user_id == me.id),
        )
        .filter(ChatConversationMember.user_id == me.id, ChatMessage.sender_id != me.id, ChatMessageRead.id.is_(None))
        .scalar()
        or 0
    )
    return {"total": int(count)}


@router.websocket("/ws/chat")
async def ws_chat(websocket: WebSocket, token: Optional[str] = None, db: Session = Depends(get_db)):
    if not token:
        await websocket.close(code=4401)
        return
    try:
        payload = decode_token(token)
        user_id = str(uuid.UUID(str(payload.get("sub"))))
    except Exception:
        await websocket.close(code=4401)
        return

    await websocket.accept()
    await hub.connect(user_id, websocket)

    # Send initial unread_count
    # We need a DB-bound function here, so reuse logic
    try:
        u = db.query(User).filter(User.id == uuid.UUID(user_id)).first()
        if u and u.is_active:
            total = get_unread_count(db=db, me=u)  # type: ignore[arg-type]
            if isinstance(total, dict):
                await hub.send_to_user(user_id, "unread_count", total)
    except Exception:
        pass

    try:
        while True:
            data = await websocket.receive_text()
            # Accept keep-alives or simple pings; ignore content for now
            if data and data.strip().lower() in {"ping", "keepalive"}:
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        await hub.disconnect(user_id, websocket)
    except Exception:
        await hub.disconnect(user_id, websocket)
        try:
            await websocket.close()
        except Exception:
            pass


# =====================
# Group management
# =====================


@router.get("/conversations/{conversation_id}")
def get_conversation(conversation_id: str, db: Session = Depends(get_db), me: User = Depends(get_current_user)):
    try:
        conv_id = uuid.UUID(str(conversation_id))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid id")
    conv = db.query(ChatConversation).filter(ChatConversation.id == conv_id).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Not found")
    mem = db.query(ChatConversationMember).filter(ChatConversationMember.conversation_id == conv_id, ChatConversationMember.user_id == me.id).first()
    if not mem:
        raise HTTPException(status_code=403, detail="Forbidden")
    return _conversation_summary(db, conv, me.id)


@router.patch("/conversations/{conversation_id}")
def update_conversation(conversation_id: str, payload: dict, db: Session = Depends(get_db), me: User = Depends(get_current_user)):
    try:
        conv_id = uuid.UUID(str(conversation_id))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid id")
    conv = db.query(ChatConversation).filter(ChatConversation.id == conv_id).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Not found")
    # Must be a member
    is_member = db.query(ChatConversationMember).filter(ChatConversationMember.conversation_id == conv_id, ChatConversationMember.user_id == me.id).first()
    if not is_member:
        raise HTTPException(status_code=403, detail="Forbidden")
    title = payload.get("title")
    if title is not None:
        if not conv.is_group:
            raise HTTPException(status_code=400, detail="Only groups can be renamed")
        conv.title = (title or "").strip() or None
        conv.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(conv)
        # Broadcast update to current members
        member_rows = db.query(ChatConversationMember).filter(ChatConversationMember.conversation_id == conv_id).all()
        member_ids = {str(m.user_id) for m in member_rows}
        summary = _conversation_summary(db, conv, me.id)
        import anyio

        async def _notify():
            await hub.broadcast_to_users(member_ids, "conversation_updated", {"conversation": summary})

        anyio.from_thread.run(_notify)  # type: ignore
    return _conversation_summary(db, conv, me.id)


@router.post("/conversations/{conversation_id}/members")
def add_members(conversation_id: str, payload: dict, db: Session = Depends(get_db), me: User = Depends(get_current_user)):
    try:
        conv_id = uuid.UUID(str(conversation_id))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid id")
    conv = db.query(ChatConversation).filter(ChatConversation.id == conv_id).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Not found")
    if not conv.is_group:
        raise HTTPException(status_code=400, detail="Only groups support adding members")
    # Must be a member
    is_member = db.query(ChatConversationMember).filter(ChatConversationMember.conversation_id == conv_id, ChatConversationMember.user_id == me.id).first()
    if not is_member:
        raise HTTPException(status_code=403, detail="Forbidden")
    ids = payload.get("add_user_ids") or []
    try:
        to_add = {uuid.UUID(str(x)) for x in ids if x}
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid user ids")
    if not to_add:
        return _conversation_summary(db, conv, me.id)
    existing = db.query(ChatConversationMember.user_id).filter(ChatConversationMember.conversation_id == conv_id).all()
    existing_ids = {row.user_id for row in existing}
    new_ids = [uid for uid in to_add if uid not in existing_ids]
    if new_ids:
        db.add_all([ChatConversationMember(conversation_id=conv_id, user_id=uid) for uid in new_ids])
        conv.updated_at = datetime.utcnow()
        db.commit()
        # Notify all (old and new) members
        member_rows = db.query(ChatConversationMember).filter(ChatConversationMember.conversation_id == conv_id).all()
        member_ids = {str(m.user_id) for m in member_rows}.union({str(uid) for uid in new_ids})
        summary = _conversation_summary(db, conv, me.id)
        import anyio

        async def _notify():
            await hub.broadcast_to_users(member_ids, "conversation_updated", {"conversation": summary})

        anyio.from_thread.run(_notify)  # type: ignore
    return _conversation_summary(db, conv, me.id)


@router.delete("/conversations/{conversation_id}/members/{user_id}")
def remove_member(conversation_id: str, user_id: str, db: Session = Depends(get_db), me: User = Depends(get_current_user)):
    try:
        conv_id = uuid.UUID(str(conversation_id))
        target_id = uuid.UUID(str(user_id))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid id")
    conv = db.query(ChatConversation).filter(ChatConversation.id == conv_id).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Not found")
    if not conv.is_group:
        raise HTTPException(status_code=400, detail="Only groups support removing members")
    # Must be a member
    is_member = db.query(ChatConversationMember).filter(ChatConversationMember.conversation_id == conv_id, ChatConversationMember.user_id == me.id).first()
    if not is_member:
        raise HTTPException(status_code=403, detail="Forbidden")
    row = db.query(ChatConversationMember).filter(ChatConversationMember.conversation_id == conv_id, ChatConversationMember.user_id == target_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="User not in conversation")
    db.delete(row)
    conv.updated_at = datetime.utcnow()
    db.commit()
    # Notify remaining members and the removed user
    member_rows = db.query(ChatConversationMember).filter(ChatConversationMember.conversation_id == conv_id).all()
    member_ids = {str(m.user_id) for m in member_rows}
    member_ids.add(str(target_id))
    summary = _conversation_summary(db, conv, me.id)
    import anyio

    async def _notify():
        await hub.broadcast_to_users(member_ids, "conversation_updated", {"conversation": summary})

    anyio.from_thread.run(_notify)  # type: ignore
    return _conversation_summary(db, conv, me.id)


@router.post("/conversations/{conversation_id}/leave")
def leave_group(conversation_id: str, db: Session = Depends(get_db), me: User = Depends(get_current_user)):
    try:
        conv_id = uuid.UUID(str(conversation_id))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid id")
    conv = db.query(ChatConversation).filter(ChatConversation.id == conv_id).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Not found")
    if not conv.is_group:
        raise HTTPException(status_code=400, detail="Only groups support leaving")
    row = db.query(ChatConversationMember).filter(ChatConversationMember.conversation_id == conv_id, ChatConversationMember.user_id == me.id).first()
    if not row:
        raise HTTPException(status_code=403, detail="Forbidden")
    db.delete(row)
    conv.updated_at = datetime.utcnow()
    db.commit()
    # Notify remaining members
    member_rows = db.query(ChatConversationMember).filter(ChatConversationMember.conversation_id == conv_id).all()
    member_ids = {str(m.user_id) for m in member_rows}
    import anyio

    async def _notify():
        await hub.broadcast_to_users(member_ids, "conversation_updated", {"conversation_id": str(conv_id)})
        await hub.send_to_user(str(me.id), "conversation_updated", {"left": str(conv_id)})

    anyio.from_thread.run(_notify)  # type: ignore
    return {"ok": True}

