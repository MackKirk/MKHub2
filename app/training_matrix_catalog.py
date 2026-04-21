"""
Standard HR training matrix (2026) — catalog slugs and labels.
Excludes legacy SiteDocs / Orientation; First Aid is a single slug `first_aid`.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date as DateType
from typing import Any, Dict, List, Literal, Optional, Set

CellKind = Literal["expiry", "date_taken", "text"]

# ~6 months — traffic light window for expiry-based trainings
MATRIX_EXPIRY_WARNING_DAYS = 183

Tone = Literal["green", "yellow", "red"]


@dataclass(frozen=True)
class MatrixTrainingDef:
    id: str
    label: str
    cell_kind: CellKind


# Default seed for Settings list `training_matrix_slots` — order = matrix columns / CSV (after Team, Employee).
DEFAULT_MATRIX_TRAINING_CATALOG: List[MatrixTrainingDef] = [
    MatrixTrainingDef("whmis", "WHMIS", "date_taken"),
    MatrixTrainingDef("annual_ppe_inspection_2026", "Annual PPE Inspection (2026)", "expiry"),
    MatrixTrainingDef("fall_protection", "Fall Protection", "expiry"),
    MatrixTrainingDef("transportation_endorsement", "Transportation Endorsement", "expiry"),
    MatrixTrainingDef("first_aid", "First Aid", "text"),  # level + expiry combined in display
    MatrixTrainingDef("forklift", "Forklift", "expiry"),
    MatrixTrainingDef("supervisor_wsbc", "Supervisor Training WSBC", "date_taken"),
    MatrixTrainingDef("fit_test", "Fit Test", "expiry"),
    MatrixTrainingDef("mewp", "Mobile Elevating Work Platform (MEWP)", "expiry"),
    MatrixTrainingDef("torch_safety", "Torch Safety", "expiry"),
    MatrixTrainingDef("crane_operator", "Crane Operator", "date_taken"),
    MatrixTrainingDef("sitereadybc_whmis_2015", "SiteReadyBC & WHMIS 2015", "date_taken"),
    MatrixTrainingDef("red_seal", "Red Seal", "text"),
    MatrixTrainingDef("jhsc", "JHSC Training", "date_taken"),
    MatrixTrainingDef("annual_ppe", "Annual PPE", "text"),
    MatrixTrainingDef("fall_pro_ttt", "Fall Pro Train the Trainer", "expiry"),
    MatrixTrainingDef("tcp", "TCP", "expiry"),
    MatrixTrainingDef("infection_control", "Infection Control", "date_taken"),
    MatrixTrainingDef("propane_fuel", "Propane Fuel", "expiry"),
    MatrixTrainingDef("tdg", "TDG", "expiry"),
]

MATRIX_TRAINING_IDS_DEFAULT: Set[str] = {x.id for x in DEFAULT_MATRIX_TRAINING_CATALOG}


def normalize_matrix_training_id(mid: Optional[str]) -> Optional[str]:
    if mid is None:
        return None
    s = str(mid).strip()
    return s if s else None


def catalog_dicts(defs: List[MatrixTrainingDef]) -> List[Dict[str, str]]:
    return [{"id": x.id, "label": x.label, "cell_kind": x.cell_kind} for x in defs]


def _active_defs(defs: Optional[List[MatrixTrainingDef]]) -> List[MatrixTrainingDef]:
    return defs if defs is not None else DEFAULT_MATRIX_TRAINING_CATALOG


def _def_by_id(mid: str, defs: Optional[List[MatrixTrainingDef]] = None) -> Optional[MatrixTrainingDef]:
    for x in _active_defs(defs):
        if x.id == mid:
            return x
    return None


def format_record_cell_display(
    r: Any,
    forced_matrix_id: Optional[str] = None,
    defs: Optional[List[MatrixTrainingDef]] = None,
) -> str:
    """Format one training record for matrix cell / CSV (single string)."""
    mid = getattr(r, "matrix_training_id", None) or forced_matrix_id
    if not mid:
        return ""
    d = _def_by_id(str(mid), defs)
    if not d:
        return ""

    expiry = getattr(r, "expiry_date", None)
    completion = getattr(r, "completion_date", None)
    start = getattr(r, "start_date", None)
    cert = (getattr(r, "certificate_number", None) or "") or ""
    cert = cert.strip()
    notes = (getattr(r, "notes", None) or "") or ""
    notes = notes.strip()
    title = (getattr(r, "title", None) or "") or ""
    title = title.strip()

    if d.cell_kind == "expiry":
        if expiry:
            return expiry.isoformat()
        if completion:
            return completion.isoformat()
        if notes:
            return notes[:200]
        return cert or title or "—"

    if d.cell_kind == "date_taken":
        if completion:
            return completion.isoformat()
        if start:
            return start.isoformat()
        if notes:
            return notes[:200]
        return cert or title or "—"

    # text — First Aid, Red Seal, Annual PPE
    parts = []
    if d.id == "first_aid":
        # Level often in certificate_number or notes
        level_bits = []
        if cert:
            level_bits.append(cert)
        if notes:
            level_bits.append(notes)
        if level_bits:
            parts.append("; ".join(level_bits)[:120])
        if expiry:
            parts.append(f"exp {expiry.isoformat()}")
        elif completion:
            parts.append(completion.isoformat())
        return " · ".join(parts) if parts else "—"

    if expiry:
        parts.append(expiry.isoformat())
    if completion and d.id != "first_aid":
        parts.append(completion.isoformat())
    text = cert or notes or title
    if text:
        parts.insert(0, text[:200])
    return " · ".join(parts) if parts else "—"


def _date_taken_for_record(r: Any) -> Optional[DateType]:
    if not r:
        return None
    if getattr(r, "completion_date", None):
        return r.completion_date
    if getattr(r, "start_date", None):
        return r.start_date
    return None


def matrix_cell_tone(r: Any, forced_matrix_id: str, today: DateType) -> Tone:
    """
    Green: completed / OK, or expiry more than ~6 months away.
    Yellow: expiring within ~6 months (still valid), or in progress / scheduled without expiry conflict.
    Red: expired (past expiry or status expired).
    """
    st = (getattr(r, "status", None) or "completed").strip().lower()
    ex: Optional[DateType] = getattr(r, "expiry_date", None)
    completion = getattr(r, "completion_date", None)
    start = getattr(r, "start_date", None)

    if ex is not None:
        if ex < today:
            return "red"
        days_left = (ex - today).days
        if days_left <= MATRIX_EXPIRY_WARNING_DAYS:
            return "yellow"
        return "green"

    if st == "expired":
        return "red"
    if st in ("in_progress", "scheduled"):
        return "yellow"
    if completion or start or st == "completed":
        return "green"
    return "green"


def matrix_cell_detail(
    r: Optional[Any],
    forced_matrix_id: str,
    today: DateType,
    defs: Optional[List[MatrixTrainingDef]] = None,
) -> Dict[str, Any]:
    """Structured cell for Training matrix dashboard (dots + tooltips)."""
    if not r:
        return {
            "tone": None,
            "record_id": None,
            "completion_date": None,
            "expiry_date": None,
            "date_taken": None,
            "display": "",
        }
    cp = getattr(r, "completion_date", None)
    ex = getattr(r, "expiry_date", None)
    dt = _date_taken_for_record(r)
    tone = matrix_cell_tone(r, forced_matrix_id, today)
    return {
        "tone": tone,
        "record_id": str(getattr(r, "id")),
        "completion_date": cp.isoformat() if cp else None,
        "expiry_date": ex.isoformat() if ex else None,
        "date_taken": dt.isoformat() if dt else None,
        "display": format_record_cell_display(r, forced_matrix_id, defs),
    }

