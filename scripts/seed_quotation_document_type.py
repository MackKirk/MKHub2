"""
Seed Document Creator type "Quotation" with Field Report photo+caption slots.

Pages:
  1. Cover — title + project tokens
  2..N. Photo slots — image placeholder (meta.slot=photo_K) + caption (meta.slot=caption_K)

Blank template_id pages keep elements via create_document fix.
Idempotent by name: skips unless --update.

  python scripts/seed_quotation_document_type.py
  python scripts/seed_quotation_document_type.py --update
  python scripts/seed_quotation_document_type.py --photos 8
"""
from __future__ import annotations

import argparse
import os
import sys
import uuid
from typing import Any

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    from dotenv import load_dotenv

    load_dotenv()
except Exception:
    pass

from app.db import SessionLocal
from app.models.models import DocumentType

TYPE_NAME = "Quotation"
DEFAULT_PHOTO_SLOTS = 6


def _eid(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:10]}"


def _cover_page() -> dict[str, Any]:
    return {
        "template_id": None,
        "label": "Cover",
        "margins": {"left_pct": 8, "right_pct": 8, "top_pct": 10, "bottom_pct": 10},
        "elements": [
            {
                "id": _eid("title"),
                "type": "text",
                "content": "Quotation",
                "x_pct": 8,
                "y_pct": 18,
                "width_pct": 84,
                "height_pct": 8,
                "fontSize": 22,
                "fontFamily": "Montserrat",
                "fontWeight": "bold",
                "color": "#0f172a",
                "textAlign": "left",
            },
            {
                "id": _eid("proj"),
                "type": "text",
                "content": "<Project Name>",
                "x_pct": 8,
                "y_pct": 30,
                "width_pct": 84,
                "height_pct": 6,
                "fontSize": 14,
                "fontFamily": "Montserrat",
                "fontWeight": "bold",
                "color": "#B30000",
            },
            {
                "id": _eid("addr"),
                "type": "text",
                "content": "<Project Address>",
                "x_pct": 8,
                "y_pct": 38,
                "width_pct": 84,
                "height_pct": 6,
                "fontSize": 12,
                "fontFamily": "Montserrat",
                "fontWeight": "normal",
                "color": "#475569",
            },
            {
                "id": _eid("cust"),
                "type": "text",
                "content": "<Customer Name>",
                "x_pct": 8,
                "y_pct": 48,
                "width_pct": 84,
                "height_pct": 5,
                "fontSize": 12,
                "fontFamily": "Montserrat",
                "fontWeight": "normal",
                "color": "#0f172a",
            },
            {
                "id": _eid("hint"),
                "type": "text",
                "content": "Insert photos from an approved Field Report into the following pages.",
                "x_pct": 8,
                "y_pct": 62,
                "width_pct": 84,
                "height_pct": 8,
                "fontSize": 11,
                "fontFamily": "Montserrat",
                "fontWeight": "normal",
                "color": "#64748b",
            },
        ],
    }


def _photo_page(index: int) -> dict[str, Any]:
    return {
        "template_id": None,
        "label": f"Photo {index}",
        "margins": {"left_pct": 6, "right_pct": 6, "top_pct": 6, "bottom_pct": 6},
        "elements": [
            {
                "id": _eid(f"photo{index}"),
                "type": "image",
                "content": "",
                "x_pct": 8,
                "y_pct": 8,
                "width_pct": 84,
                "height_pct": 62,
                "imageFit": "contain",
                "meta": {"slot": f"photo_{index}"},
            },
            {
                "id": _eid(f"cap{index}"),
                "type": "text",
                "content": "Photo description",
                "x_pct": 8,
                "y_pct": 74,
                "width_pct": 84,
                "height_pct": 14,
                "fontSize": 11,
                "fontFamily": "Montserrat",
                "fontWeight": "normal",
                "color": "#0f172a",
                "meta": {"slot": f"caption_{index}"},
            },
        ],
    }


def build_page_templates(photo_slots: int) -> list[dict[str, Any]]:
    pages = [_cover_page()]
    for i in range(1, photo_slots + 1):
        pages.append(_photo_page(i))
    return pages


def upsert(*, update: bool, photo_slots: int) -> None:
    db = SessionLocal()
    try:
        existing = db.query(DocumentType).filter(DocumentType.name == TYPE_NAME).first()
        pages = build_page_templates(photo_slots)
        if existing and not update:
            print(f"SKIP  {TYPE_NAME} (id={existing.id}) — already exists. Pass --update to refresh.")
            return
        if existing and update:
            existing.description = (
                "Field Report → quote. Cover + photo/caption slots (photo_N / caption_N). "
                "Use Create quote from an approved Field Report, then Insert from Field Report."
            )
            existing.category = None
            existing.page_templates = pages
            db.add(existing)
            db.commit()
            db.refresh(existing)
            print(f"UPDATE {TYPE_NAME} (id={existing.id}, pages={len(pages)})")
            return

        dt = DocumentType(
            name=TYPE_NAME,
            description=(
                "Field Report → quote. Cover + photo/caption slots (photo_N / caption_N). "
                "Use Create quote from an approved Field Report, then Insert from Field Report."
            ),
            category=None,
            page_templates=pages,
            signer_roles=None,
        )
        db.add(dt)
        db.commit()
        db.refresh(dt)
        print(f"CREATE {TYPE_NAME} (id={dt.id}, pages={len(pages)})")
    finally:
        db.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed Quotation Document Type with Field Report slots")
    parser.add_argument("--update", action="store_true", help="Refresh definition if it already exists")
    parser.add_argument(
        "--photos",
        type=int,
        default=DEFAULT_PHOTO_SLOTS,
        help=f"Number of photo+caption slot pages (default {DEFAULT_PHOTO_SLOTS})",
    )
    args = parser.parse_args()
    slots = max(1, min(24, int(args.photos or DEFAULT_PHOTO_SLOTS)))
    upsert(update=args.update, photo_slots=slots)


if __name__ == "__main__":
    main()
