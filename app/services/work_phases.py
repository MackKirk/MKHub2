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


def _phase_row(
    *,
    label: str,
    key: str,
    sort: int,
    done: bool = False,
    phase_id: Optional[str] = None,
    source_template_id: Optional[str] = None,
    source_template_name: Optional[str] = None,
) -> dict:
    row: dict = {
        "id": (phase_id or "").strip() or str(uuid.uuid4()),
        "key": key[:80],
        "label": label[:255],
        "done": bool(done),
        "sort": int(sort),
    }
    src_id = (source_template_id or "").strip() or None
    src_name = (source_template_name or "").strip() or None
    if src_id:
        row["source_template_id"] = src_id[:80]
    if src_name:
        row["source_template_name"] = src_name[:255]
    return row


def instantiate_phases_from_template(
    template_phases: Any,
    *,
    start_sort: int = 0,
    source_template_id: Optional[str] = None,
    source_template_name: Optional[str] = None,
) -> list[dict]:
    phases = normalize_template_phases(template_phases)
    out: list[dict] = []
    for i, p in enumerate(phases):
        out.append(
            _phase_row(
                label=p["label"],
                key=p["key"],
                sort=start_sort + i,
                source_template_id=source_template_id,
                source_template_name=source_template_name,
            )
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
            _phase_row(
                label=label,
                key=key,
                sort=sort,
                done=bool(item.get("done")),
                phase_id=pid,
                source_template_id=str(item.get("source_template_id") or "") or None,
                source_template_name=str(item.get("source_template_name") or "") or None,
            )
        )
    out.sort(key=lambda x: (x.get("sort", 0), x.get("label") or ""))
    for i, p in enumerate(out):
        p["sort"] = i
    return out


def append_template_phases(
    existing: Any,
    template_phases: Any,
    *,
    source_template_id: Optional[str] = None,
    source_template_name: Optional[str] = None,
) -> list[dict]:
    """Append template phases after existing ones (multi-template support)."""
    current = normalize_project_phases(existing)
    added = instantiate_phases_from_template(
        template_phases,
        start_sort=len(current),
        source_template_id=source_template_id,
        source_template_name=source_template_name,
    )
    return normalize_project_phases([*current, *added])


def add_manual_phase(existing: Any, label: str) -> list[dict]:
    current = normalize_project_phases(existing)
    cleaned = (label or "").strip()
    if not cleaned:
        raise ValueError("label is required")
    key = (
        cleaned.lower()
        .replace(" ", "_")
        .replace("/", "_")
    )
    key = "".join(ch for ch in key if ch.isalnum() or ch == "_")[:80] or f"phase_{len(current) + 1}"
    current.append(_phase_row(label=cleaned, key=key, sort=len(current)))
    return normalize_project_phases(current)


def remove_phase(existing: Any, phase_id: str) -> list[dict]:
    rows = normalize_project_phases(existing)
    target = str(phase_id or "").strip()
    kept = [p for p in rows if p["id"] != target]
    return normalize_project_phases(kept)


def rename_phase(existing: Any, phase_id: str, label: str) -> list[dict]:
    rows = normalize_project_phases(existing)
    target = str(phase_id or "").strip()
    cleaned = (label or "").strip()
    if not cleaned:
        raise ValueError("label is required")
    for p in rows:
        if p["id"] == target:
            p["label"] = cleaned[:255]
            break
    return normalize_project_phases(rows)


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
