"""Send push notifications via the Expo Push API."""
from __future__ import annotations

from typing import Any, Iterable

import httpx
import structlog

logger = structlog.get_logger()

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"
_CHUNK_SIZE = 100


def is_expo_push_token(token: str) -> bool:
    value = (token or "").strip()
    return value.startswith("ExponentPushToken[") or value.startswith("ExpoPushToken[")


def send_expo_push(
    tokens: Iterable[str],
    *,
    title: str,
    body: str,
    data: dict[str, Any] | None = None,
) -> list[str]:
    """
    Send a push to Expo tokens. Returns tokens that should be dropped
    (DeviceNotRegistered / invalid).
    """
    unique = []
    seen: set[str] = set()
    for raw in tokens:
        token = (raw or "").strip()
        if not token or token in seen or not is_expo_push_token(token):
            continue
        seen.add(token)
        unique.append(token)

    stale: list[str] = []
    if not unique:
        return stale

    messages = [
        {
            "to": token,
            "sound": "default",
            "title": title,
            "body": body,
            "data": data or {},
            "channelId": "hours-reminders",
        }
        for token in unique
    ]

    try:
        with httpx.Client(timeout=20.0) as client:
            for i in range(0, len(messages), _CHUNK_SIZE):
                chunk = messages[i : i + _CHUNK_SIZE]
                response = client.post(EXPO_PUSH_URL, json=chunk)
                response.raise_for_status()
                payload = response.json()
                tickets = payload.get("data") or []
                if not isinstance(tickets, list):
                    tickets = [tickets]
                for token, ticket in zip(chunk_tokens(chunk), tickets):
                    if not isinstance(ticket, dict):
                        continue
                    if ticket.get("status") == "error":
                        details = ticket.get("details") or {}
                        error = details.get("error") or ticket.get("message")
                        if error == "DeviceNotRegistered":
                            stale.append(token)
                        else:
                            logger.warning(
                                "expo_push_ticket_error",
                                token_suffix=token[-8:],
                                error=error,
                            )
    except Exception as exc:
        logger.warning("expo_push_send_failed", error=str(exc))

    return stale


def chunk_tokens(messages: list[dict[str, Any]]) -> list[str]:
    return [str(item.get("to") or "") for item in messages]
