"""Bundled LMS certificate background images (preset keys stored on TrainingCourse)."""
from __future__ import annotations

import os
from functools import lru_cache
from typing import Any, Dict, List, Optional

# Keys must match filenames under app/static/training/certificate_backgrounds/{key}.png
CERTIFICATE_BACKGROUND_PRESETS: List[Dict[str, Any]] = [
    {
        "key": "mk_corporate_default",
        "label": "Mack Kirk — certificate background (grey, burgundy, gold)",
    },
]


def list_bundled_certificate_background_presets_for_api() -> List[Dict[str, Any]]:
    """Legacy static files under app/static/training/certificate_backgrounds (optional fallback)."""
    out: List[Dict[str, Any]] = []
    for p in CERTIFICATE_BACKGROUND_PRESETS:
        key = p["key"]
        out.append(
            {
                "key": key,
                "label": p["label"],
                "preview_url": f"/training/certificate-background-assets/{key}.png"
                if _preset_png_path(key)
                else None,
                "source": "bundled",
            }
        )
    return out


def list_preset_options_for_api() -> List[Dict[str, Any]]:
    """Deprecated: use merged list from training route; kept for callers expecting old shape."""
    return list_bundled_certificate_background_presets_for_api()


def preset_keys() -> List[str]:
    return [p["key"] for p in CERTIFICATE_BACKGROUND_PRESETS]


def is_valid_preset_key(key: Optional[str]) -> bool:
    if not key or not isinstance(key, str):
        return False
    k = key.strip()
    if not k or len(k) > 64:
        return False
    if k not in preset_keys():
        return False
    # Filename = key + .png only (no path chars)
    if not k.replace("_", "").isalnum():
        return False
    return True


@lru_cache(maxsize=16)
def _preset_png_path(key: str) -> Optional[str]:
    if not is_valid_preset_key(key):
        return None
    here = os.path.dirname(os.path.abspath(__file__))
    app_dir = os.path.dirname(here)
    path = os.path.join(app_dir, "static", "training", "certificate_backgrounds", f"{key}.png")
    if os.path.isfile(path):
        return path
    return None


def read_preset_background_bytes(key: Optional[str]) -> Optional[bytes]:
    if not key:
        return None
    path = _preset_png_path(key.strip())
    if not path:
        return None
    try:
        with open(path, "rb") as f:
            return f.read()
    except OSError:
        return None


def resolve_course_background_bytes(course: Any, db: Any) -> Optional[bytes]:
    """
    Settings library item only.
    Used when generating the PDF certificate.
    """
    sit = getattr(course, "certificate_background_setting_item_id", None)
    if sit:
        from ..models.models import FileObject
        from ..services.certificate_background_library import resolve_certificate_background_file_id
        from ..services.file_object_read import read_file_object_bytes

        fid = resolve_certificate_background_file_id(db, sit)
        if fid:
            fo = db.query(FileObject).filter(FileObject.id == fid).first()
            if fo:
                data = read_file_object_bytes(fo)
                if data:
                    return data

    return None
