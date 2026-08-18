"""In-memory login attempt throttle (per process).

Stops credential stuffing / button-mashing from hammering bcrypt. Not a substitute
for WAF/IP blocking in production, but it is the real control (the UI lock is only UX).
"""

from __future__ import annotations

import threading
import time
from collections import defaultdict, deque
from typing import Deque, Dict, Optional, Tuple

from fastapi import HTTPException, Request

# Consecutive failures for (ip, identifier) → cooldown seconds.
LOCK_STEPS: Tuple[Tuple[int, int], ...] = (
    (3, 10),
    (6, 30),
    (10, 60),
)

IP_WINDOW_S = 60
IP_MAX_ATTEMPTS = 20
_STATE_TTL_S = 30 * 60

_lock = threading.Lock()
_failures: Dict[str, dict] = {}
_ip_hits: Dict[str, Deque[float]] = defaultdict(deque)


def client_ip(request: Request) -> str:
    forwarded = (request.headers.get("x-forwarded-for") or "").split(",")[0].strip()
    if forwarded:
        return forwarded
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


def _norm_identifier(identifier: str) -> str:
    return (identifier or "").strip().lower()


def _pair_key(ip: str, identifier: str) -> str:
    return f"{ip}|{_norm_identifier(identifier)}"


def _lock_seconds_for_failures(failures: int) -> int:
    seconds = 0
    for threshold, cooldown in LOCK_STEPS:
        if failures >= threshold:
            seconds = cooldown
    return seconds


def _prune_unlocked(now: float) -> None:
    stale = [
        key
        for key, rec in _failures.items()
        if rec["locked_until"] < now and now - rec["updated_at"] > _STATE_TTL_S
    ]
    for key in stale:
        _failures.pop(key, None)


def _ip_retry_after(ip: str, now: float) -> int:
    q = _ip_hits[ip]
    while q and now - q[0] > IP_WINDOW_S:
        q.popleft()
    if len(q) >= IP_MAX_ATTEMPTS:
        return max(1, int(IP_WINDOW_S - (now - q[0])) + 1)
    return 0


def _raise_locked(retry_after: int) -> None:
    raise HTTPException(
        status_code=429,
        detail=f"Too many login attempts. Try again in {retry_after} seconds.",
        headers={"Retry-After": str(retry_after)},
    )


def enforce_login_allowed(ip: str, identifier: str, *, now: Optional[float] = None) -> None:
    """Block if this IP/identifier is in cooldown or the IP is flooding."""
    t = time.monotonic() if now is None else now
    retry_after = 0
    with _lock:
        _prune_unlocked(t)
        ip_wait = _ip_retry_after(ip, t)
        if ip_wait:
            retry_after = ip_wait
        else:
            rec = _failures.get(_pair_key(ip, identifier))
            if rec and rec["locked_until"] > t:
                retry_after = max(1, int(rec["locked_until"] - t) + 1)
    if retry_after:
        _raise_locked(retry_after)


def note_login_attempt(ip: str, *, now: Optional[float] = None) -> None:
    """Count a login POST toward the per-IP window (success or failure)."""
    t = time.monotonic() if now is None else now
    with _lock:
        q = _ip_hits[ip]
        while q and t - q[0] > IP_WINDOW_S:
            q.popleft()
        q.append(t)


def record_login_failure(ip: str, identifier: str, *, now: Optional[float] = None) -> Optional[int]:
    """Increment consecutive failures. Returns cooldown seconds if a lock just started."""
    t = time.monotonic() if now is None else now
    key = _pair_key(ip, identifier)
    with _lock:
        rec = _failures.get(key)
        if rec is None:
            rec = {"failures": 0, "locked_until": 0.0, "updated_at": t}
            _failures[key] = rec
        rec["failures"] = int(rec["failures"]) + 1
        rec["updated_at"] = t
        cooldown = _lock_seconds_for_failures(rec["failures"])
        if cooldown:
            rec["locked_until"] = t + cooldown
            return cooldown
        rec["locked_until"] = 0.0
        return None


def record_login_success(ip: str, identifier: str) -> None:
    with _lock:
        _failures.pop(_pair_key(ip, identifier), None)


def reset_login_throttle_state() -> None:
    """Test helper."""
    with _lock:
        _failures.clear()
        _ip_hits.clear()
