"""Project/opportunity job progress phases (checklist map). Not system Tasks."""
from __future__ import annotations

import uuid
from typing import Any, Optional


def normalize_template_phases(raw: Any) -> list[dict]:
    if not isinstance(raw, list):
        return []
    out: list[dict] = []
    for i, item in enumerate(raw):
        if isinstance(item, str):
            label = item.strip()
            if not label:
                continue
            key = f"phase_{i + 1}"
            out.append({"key": key, "label": label})
            continue
        if not isinstance(item, dict):
            continue
        label = str(item.get("label") or item.get("name") or "").strip()
        if not label:
            continue
        key = str(item.get("key") or "").strip() or f"phase_{i + 1}"
        out.append({"key": key[:80], "label": label[:255]})
    return out


def instantiate_phases_from_template(template_phases: Any) -> list[dict]:
    phases = normalize_template_phases(template_phases)
    out: list[dict] = []
    for i, p in enumerate(phases):
        out.append(
            {
                "id": str(uuid.uuid4()),
                "key": p["key"],
                "label": p["label"],
                "done": False,
                "sort": i,
            }
        )
    return out


def normalize_project_phases(raw: Any) -> list[dict]:
    if not isinstance(raw, list):
        return []
    out: list[dict] = []
    for i, item in enumerate(raw):
        if not isinstance(item, dict):
            continue
        label = str(item.get("label") or "").strip()
        if not label:
            continue
        pid = str(item.get("id") or "").strip() or str(uuid.uuid4())
        key = str(item.get("key") or "").strip() or f"phase_{i + 1}"
        try:
            sort = int(item.get("sort", i))
        except Exception:
            sort = i
        out.append(
            {
                "id": pid,
                "key": key[:80],
                "label": label[:255],
                "done": bool(item.get("done")),
                "sort": sort,
            }
        )
    out.sort(key=lambda x: (x.get("sort", 0), x.get("label") or ""))
    for i, p in enumerate(out):
        p["sort"] = i
    return out


def compute_progress_percent(phases: Optional[list]) -> Optional[int]:
    rows = normalize_project_phases(phases)
    if not rows:
        return None
    done = sum(1 for p in rows if p.get("done"))
    return int(round(100.0 * done / len(rows)))


def set_phase_done(phases: Any, phase_id: str, done: bool) -> list[dict]:
    rows = normalize_project_phases(phases)
    target = str(phase_id or "").strip()
    for p in rows:
        if p["id"] == target:
            p["done"] = bool(done)
            break
    return rows
