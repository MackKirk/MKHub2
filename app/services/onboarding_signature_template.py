"""Validate and normalize onboarding PDF signature templates (field overlays)."""
from __future__ import annotations

import re
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from typing import Any, Dict, List, Optional, Tuple
from uuid import UUID

from fastapi import HTTPException

FIELD_TYPES = frozenset(
    {"employee_info", "text", "value", "paragraph", "date", "checkbox", "signature", "initials"}
)
EMPLOYEE_INFO_KEYS = frozenset(
    {
        "full_name",
        "first_name",
        "last_name",
        "preferred_name",
        "email",
        "phone",
        "mobile_phone",
        "job_title",
        "division",
        "hire_date",
        "date_of_birth",
        "sin_number",
        "address",
        "city",
        "province",
        "postal_code",
        "country",
    }
)
VALID_ASSIGNEES = frozenset({"employee", "user"})


def signer_role_for_base_document(bd) -> str:
    """Matches template field assignee filter to who receives this document."""
    return (getattr(bd, "assignee_type", None) or "employee").lower()


def filter_fields_for_signer(template: Optional[dict], bd) -> List[dict]:
    """Return template fields applicable to the current document assignee role."""
    if not template or not isinstance(template.get("fields"), list):
        return []
    role = signer_role_for_base_document(bd)
    out: List[dict] = []
    for f in template["fields"]:
        if not isinstance(f, dict):
            continue
        if (f.get("assignee") or "employee").lower() == role:
            out.append(f)
    return out


def get_pdf_page_sizes(pdf_bytes: bytes) -> List[Tuple[float, float]]:
    """Width/height in PDF points per page (for client alignment)."""
    return _page_sizes_pdf_bytes(pdf_bytes)


def _page_sizes_pdf_bytes(pdf_bytes: bytes) -> List[Tuple[float, float]]:
    try:
        import fitz  # PyMuPDF
    except ImportError:
        raise HTTPException(503, "PDF validation unavailable (PyMuPDF)")
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    try:
        sizes: List[Tuple[float, float]] = []
        for i in range(doc.page_count):
            r = doc[i].rect
            sizes.append((float(r.width), float(r.height)))
        return sizes
    finally:
        doc.close()


def validate_and_normalize_template(template: Any, pdf_bytes: bytes) -> dict:
    """
    Validate template JSON; normalize rects and field metadata.
    Rects use PDF user space: origin bottom-left, units points (same as ReportLab).
    """
    if template is None:
        raise HTTPException(400, "signature_template is required")
    if not isinstance(template, dict):
        raise HTTPException(400, "signature_template must be an object")
    version = int(template.get("version") or 1)
    if version < 1:
        raise HTTPException(400, "signature_template.version must be >= 1")
    raw_fields = template.get("fields")
    if not isinstance(raw_fields, list):
        raise HTTPException(400, "signature_template.fields must be an array")
    page_sizes = _page_sizes_pdf_bytes(pdf_bytes)
    n_pages = len(page_sizes)
    if n_pages < 1:
        raise HTTPException(400, "PDF has no pages")

    seen_ids: set[str] = set()
    fields_out: List[dict] = []

    for idx, raw in enumerate(raw_fields):
        if not isinstance(raw, dict):
            raise HTTPException(400, f"fields[{idx}] must be an object")
        try:
            fid = str(UUID(str(raw.get("id"))))
        except Exception:
            raise HTTPException(400, f"fields[{idx}].id must be a UUID")
        if fid in seen_ids:
            raise HTTPException(400, "duplicate field id")
        seen_ids.add(fid)
        ftype = (raw.get("type") or "").strip().lower()
        if ftype not in FIELD_TYPES:
            raise HTTPException(400, f"fields[{idx}].type is invalid")
        try:
            pi = int(raw.get("page_index", 0))
        except Exception:
            raise HTTPException(400, f"fields[{idx}].page_index invalid")
        if pi < 0 or pi >= n_pages:
            raise HTTPException(400, f"fields[{idx}].page_index out of range")
        rect = raw.get("rect") or {}
        if not isinstance(rect, dict):
            raise HTTPException(400, f"fields[{idx}].rect must be an object")
        try:
            x = float(rect.get("x", 0))
            y = float(rect.get("y", 0))
            w = float(rect.get("width", rect.get("w", 0)))
            h = float(rect.get("height", rect.get("h", 0)))
        except Exception:
            raise HTTPException(400, f"fields[{idx}].rect coordinates invalid")
        if w <= 0 or h <= 0:
            raise HTTPException(400, f"fields[{idx}].rect width/height must be positive")
        pw, ph = page_sizes[pi]
        margin = 0.5
        if x < -margin or y < -margin or x + w > pw + margin or y + h > ph + margin:
            raise HTTPException(400, f"fields[{idx}].rect outside page bounds")

        assignee = (raw.get("assignee") or "employee").lower()
        if assignee not in VALID_ASSIGNEES:
            raise HTTPException(400, f"fields[{idx}].assignee must be employee or user")

        field_name = (raw.get("field_name") or raw.get("label") or ftype).strip() or ftype
        required = bool(raw.get("required", False))

        entry: Dict[str, Any] = {
            "id": fid,
            "type": ftype,
            "page_index": pi,
            "rect": {"x": x, "y": y, "width": w, "height": h},
            "field_name": field_name[:500],
            "required": required,
            "assignee": assignee,
        }
        if ftype == "employee_info":
            key = (raw.get("employee_info_key") or "full_name").strip().lower()
            if key not in EMPLOYEE_INFO_KEYS:
                raise HTTPException(400, f"fields[{idx}].employee_info_key invalid")
            entry["employee_info_key"] = key
        # type "value": currency amount is entered by the signer; no template text
        fields_out.append(entry)

    return {"version": version, "fields": fields_out}


def resolve_employee_info_value(key: str, ep, user) -> str:
    """Resolve employee_info field from profile + user."""
    key = (key or "full_name").lower()
    if ep:
        if key == "full_name":
            return f"{(ep.first_name or '').strip()} {(ep.last_name or '').strip()}".strip() or ""
        if key == "first_name":
            return (ep.first_name or "").strip()
        if key == "last_name":
            return (ep.last_name or "").strip()
        if key == "preferred_name":
            return (ep.preferred_name or "").strip()
        if key == "phone":
            return (ep.phone or "").strip()
        if key == "mobile_phone":
            return (ep.mobile_phone or "").strip()
        if key == "job_title":
            return (ep.job_title or "").strip()
        if key == "division":
            return (ep.division or "").strip()
        if key == "hire_date":
            if ep.hire_date:
                return ep.hire_date.strftime("%Y-%m-%d")
            return ""
        if key == "date_of_birth":
            if ep.date_of_birth:
                return ep.date_of_birth.strftime("%Y-%m-%d")
            return ""
        if key == "sin_number":
            return (getattr(ep, "sin_number", None) or "").strip()
        parts = [
            (ep.address_line1 or "").strip(),
            (ep.city or "").strip(),
            (ep.province or "").strip(),
            (ep.postal_code or "").strip(),
        ]
        if key == "address":
            return ", ".join(p for p in parts[:1] if p)
        if key == "city":
            return (ep.city or "").strip()
        if key == "province":
            return (ep.province or "").strip()
        if key == "postal_code":
            return (ep.postal_code or "").strip()
        if key == "country":
            return (ep.country or "").strip()
    if key == "email":
        return (getattr(user, "email_personal", None) or getattr(user, "email", None) or "") or ""
    return ""


def _truthy(v: Any) -> bool:
    if isinstance(v, bool):
        return v
    if isinstance(v, str):
        return v.lower() in ("1", "true", "yes", "on")
    return bool(v)


def _parse_currency_amount(raw: Any) -> Optional[Decimal]:
    """Parse a currency string (e.g. $1,234.56 or 1234,56) to two decimal places."""
    if raw is None:
        return None
    s = raw.strip() if isinstance(raw, str) else str(raw).strip()
    if not s:
        return None
    t = re.sub(r"[$\s€£¥]", "", s)
    has_c = "," in t
    has_d = "." in t
    if has_c and has_d:
        if t.rfind(",") > t.rfind("."):
            t = t.replace(".", "").replace(",", ".")
        else:
            t = t.replace(",", "")
    elif has_c and not has_d:
        parts = t.split(",")
        if len(parts) == 2 and len(parts[1]) <= 2 and parts[1].isdigit():
            t = "".join(parts[:-1]) + "." + parts[1]
        else:
            t = t.replace(",", "")
    else:
        t = t.replace(",", "")
    try:
        d = Decimal(t)
    except InvalidOperation:
        return None
    return d.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _format_currency_pdf(d: Decimal) -> str:
    q = d.quantize(Decimal("0.01"))
    neg = q < 0
    ad = abs(q)
    body = f"${ad:,.2f}"
    return f"-{body}" if neg else body


def validate_field_values_for_signing(
    fields: List[dict],
    field_values: Dict[str, Any],
    ep,
    user,
) -> Dict[str, Any]:
    """
    Ensure required fields have values. employee_info is pre-filled from profile on the client
    but may be edited; if field_values omits a key, fall back to server-resolved profile data.
    Returns normalized map field_id -> value for rendering (str, bool, or bytes for images).
    """
    out: Dict[str, Any] = {}
    if field_values is None:
        field_values = {}
    if not isinstance(field_values, dict):
        raise HTTPException(400, "field_values must be a JSON object")

    for f in fields:
        fid = f["id"]
        ftype = f["type"]
        req = f.get("required", False)

        if ftype == "employee_info":
            key = f.get("employee_info_key") or "full_name"
            resolved = resolve_employee_info_value(key, ep, user)
            raw = field_values.get(fid)
            if raw is None:
                text = resolved
            else:
                if not isinstance(raw, str):
                    raw = str(raw)
                text = raw.strip()
            if req and not text:
                raise HTTPException(400, f"Missing value for {f.get('field_name', fid)}")
            if len(text) > 8000:
                raise HTTPException(400, f"Text too long for field {fid}")
            out[fid] = text
            continue

        if ftype == "value":
            raw_in = field_values.get(fid)
            s = (raw_in if raw_in is not None else "") if isinstance(raw_in, str) else str(raw_in or "")
            s = s.strip()
            if not s:
                if req:
                    raise HTTPException(400, f"Missing amount for {f.get('field_name', fid)}")
                out[fid] = ""
                continue
            d = _parse_currency_amount(s)
            if d is None:
                raise HTTPException(400, f"Invalid currency amount for {f.get('field_name', fid)}")
            out[fid] = _format_currency_pdf(d)
            continue

        raw = field_values.get(fid)
        if ftype in ("signature", "initials"):
            if raw is None or raw == "":
                if req:
                    raise HTTPException(400, f"Missing value for {f.get('field_name', fid)}")
                continue
            if isinstance(raw, str):
                b64 = raw.split(",")[-1] if "," in raw else raw
                import base64

                try:
                    img = base64.b64decode(b64)
                except Exception:
                    raise HTTPException(400, f"Invalid image for field {fid}")
                if req and len(img) < 50:
                    raise HTTPException(400, f"Signature image required for {f.get('field_name', fid)}")
                out[fid] = img
            else:
                raise HTTPException(400, f"Invalid image payload for field {fid}")
            continue

        if ftype == "checkbox":
            val = _truthy(raw) if raw is not None else False
            if req and not val:
                raise HTTPException(400, f"You must check {f.get('field_name', fid)}")
            out[fid] = val
            continue

        if ftype in ("text", "paragraph", "date"):
            s = (raw if raw is not None else "") if not isinstance(raw, str) else raw
            if not isinstance(s, str):
                s = str(s)
            s = s.strip() if ftype != "paragraph" else s
            if ftype == "paragraph":
                s = s.strip()
            if req and not s:
                raise HTTPException(400, f"Missing text for {f.get('field_name', fid)}")
            if len(s) > 8000:
                raise HTTPException(400, f"Text too long for field {fid}")
            out[fid] = s
            continue

    return out


def template_is_active(template: Optional[dict]) -> bool:
    return bool(template and isinstance(template.get("fields"), list) and len(template["fields"]) > 0)
