import asyncio
from typing import Dict, Set, Any

from fastapi import WebSocket


class ChatHub:
    def __init__(self) -> None:
        # user_id (str) -> set of WebSocket connections
        self._user_connections: Dict[str, Set[WebSocket]] = {}
        self._lock = asyncio.Lock()

    async def connect(self, user_id: str, ws: WebSocket) -> None:
        async with self._lock:
            conns = self._user_connections.setdefault(user_id, set())
            conns.add(ws)

    async def disconnect(self, user_id: str, ws: WebSocket) -> None:
        async with self._lock:
            conns = self._user_connections.get(user_id)
            if conns is not None:
                conns.discard(ws)
                if not conns:
                    self._user_connections.pop(user_id, None)

    async def send_to_user(self, user_id: str, event: str, payload: Any) -> None:
        data = {"event": event, "data": payload}
        async with self._lock:
            targets = list(self._user_connections.get(user_id, set()))
        for ws in targets:
            try:
                await ws.send_json(data)
            except Exception:
                # best-effort; drop on failure
                pass

    async def broadcast_to_users(self, user_ids: Set[str], event: str, payload: Any) -> None:
        if not user_ids:
            return
        data = {"event": event, "data": payload}
        async with self._lock:
            targets = []
            for uid in user_ids:
                targets.extend(list(self._user_connections.get(uid, set())))
        for ws in targets:
            try:
                await ws.send_json(data)
            except Exception:
                pass


# Global singleton hub
hub = ChatHub()


