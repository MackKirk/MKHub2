#!/usr/bin/env python3
"""Seed MK Metals public catalog categories + sample products (idempotent by slug)."""
from __future__ import annotations

import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    from dotenv import load_dotenv

    load_dotenv()
except Exception:
    pass


CATEGORIES = [
    {"slug": "panels", "name": "Panels", "description": "Standing seam, board & batten, flush wall", "sort_index": 10},
    {"slug": "flashings", "name": "Flashings", "description": "Drip edges, corners, Z-bars, custom flashings", "sort_index": 20},
    {"slug": "trims", "name": "Trims & Accessories", "description": "J-channel, starters, fascia, vents", "sort_index": 30},
]

PRODUCTS = [
    {
        "slug": "standing-seam",
        "category": "panels",
        "name": "Standing Seam",
        "short_description": "Vertical interlocking panel for walls and roofs.",
        "description": "Custom-length standing seam formed to your gauge and colour.",
        "specs": {"gauges": ["24ga", "26ga"], "materials": ["prepainted steel", "galvalume"]},
        "sort_index": 10,
    },
    {
        "slug": "board-batten",
        "category": "panels",
        "name": "Board & Batten",
        "short_description": "Wide board look with raised battens.",
        "description": "Architectural board and batten panel formed to your run.",
        "specs": {"gauges": ["24ga", "26ga"], "materials": ["prepainted steel"]},
        "sort_index": 20,
    },
    {
        "slug": "flush-wall",
        "category": "panels",
        "name": "Flush Wall",
        "short_description": "Clean flush wall panel.",
        "description": "Flush wall panel with crisp reveals.",
        "specs": {"gauges": ["24ga"], "materials": ["prepainted steel", "aluminum"]},
        "sort_index": 30,
    },
    {
        "slug": "drip-edge",
        "category": "flashings",
        "name": "Drip Edge",
        "short_description": "Standard drip edge flashing.",
        "description": "Bent to your dimensions and colour match.",
        "specs": {"gauges": ["24ga", "26ga"]},
        "sort_index": 10,
    },
    {
        "slug": "outside-corner",
        "category": "flashings",
        "name": "Outside Corner",
        "short_description": "Outside corner trim.",
        "description": "Outside corner formed to your profile.",
        "specs": {"gauges": ["24ga", "26ga"]},
        "sort_index": 20,
    },
    {
        "slug": "inside-corner",
        "category": "flashings",
        "name": "Inside Corner",
        "short_description": "Inside corner trim.",
        "description": "Inside corner formed to your profile.",
        "specs": {"gauges": ["24ga", "26ga"]},
        "sort_index": 30,
    },
    {
        "slug": "z-bar",
        "category": "flashings",
        "name": "Z-Bar",
        "short_description": "Z-bar flashing / reveal.",
        "description": "Custom Z-bar for reveals and transitions.",
        "specs": {"gauges": ["24ga", "26ga"]},
        "sort_index": 40,
    },
    {
        "slug": "j-channel",
        "category": "trims",
        "name": "J-Channel",
        "short_description": "J-channel trim for panel edges.",
        "description": "J-channel formed to panel thickness and colour.",
        "specs": {"gauges": ["24ga", "26ga"]},
        "sort_index": 10,
    },
    {
        "slug": "starter-strip",
        "category": "trims",
        "name": "Starter Strip",
        "short_description": "Starter strip for panel runs.",
        "description": "Starter strip matched to your panel system.",
        "specs": {"gauges": ["24ga", "26ga"]},
        "sort_index": 20,
    },
    {
        "slug": "fascia-cap",
        "category": "trims",
        "name": "Fascia Cap",
        "short_description": "Fascia cap trim.",
        "description": "Fascia cap bent to your fascia depth.",
        "specs": {"gauges": ["24ga", "26ga"]},
        "sort_index": 30,
    },
    {
        "slug": "wall-cap",
        "category": "flashings",
        "name": "Wall Cap",
        "short_description": "Wall / parapet cap.",
        "description": "Wall cap formed from your sketch or dimensions.",
        "specs": {"gauges": ["24ga"], "notes": "Custom dimensions required"},
        "sort_index": 50,
    },
    {
        "slug": "custom-flashing",
        "category": "flashings",
        "name": "Custom Flashing",
        "short_description": "Any custom profile — send a sketch.",
        "description": "Head, sill, jamb, valley, step, and one-off profiles. Upload a sketch or DXF with your estimate.",
        "specs": {"gauges": ["24ga", "26ga", "other"], "notes": "Quote from drawing"},
        "sort_index": 90,
    },
]


def main() -> None:
    from app.db import SessionLocal
    from app.models.models import MetalsCatalogCategory, MetalsCatalogProduct

    db = SessionLocal()
    try:
        cat_ids: dict[str, object] = {}
        now = datetime.now(timezone.utc)
        for c in CATEGORIES:
            row = db.query(MetalsCatalogCategory).filter(MetalsCatalogCategory.slug == c["slug"]).first()
            if row:
                row.name = c["name"]
                row.description = c.get("description")
                row.sort_index = c["sort_index"]
                row.is_published = True
                row.updated_at = now
                print(f"Updated category: {c['slug']}")
            else:
                row = MetalsCatalogCategory(
                    slug=c["slug"],
                    name=c["name"],
                    description=c.get("description"),
                    sort_index=c["sort_index"],
                    is_published=True,
                    created_at=now,
                )
                db.add(row)
                db.flush()
                print(f"Created category: {c['slug']}")
            cat_ids[c["slug"]] = row.id

        for p in PRODUCTS:
            row = db.query(MetalsCatalogProduct).filter(MetalsCatalogProduct.slug == p["slug"]).first()
            cat_id = cat_ids.get(p["category"])
            if row:
                row.name = p["name"]
                row.short_description = p.get("short_description")
                row.description = p.get("description")
                row.specs = p.get("specs")
                row.category_id = cat_id
                row.sort_index = p["sort_index"]
                row.is_published = True
                row.updated_at = now
                print(f"Updated product: {p['slug']}")
            else:
                db.add(
                    MetalsCatalogProduct(
                        slug=p["slug"],
                        name=p["name"],
                        short_description=p.get("short_description"),
                        description=p.get("description"),
                        specs=p.get("specs"),
                        category_id=cat_id,
                        sort_index=p["sort_index"],
                        is_published=True,
                        created_at=now,
                    )
                )
                print(f"Created product: {p['slug']}")

        db.commit()
        print(f"\nSeeded {len(CATEGORIES)} categories and {len(PRODUCTS)} products.")
    except Exception as e:
        db.rollback()
        print(f"ERROR: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
