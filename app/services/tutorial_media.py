"""Tutorial media helpers — allowed slots come from merged tutorial content."""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Set

from sqlalchemy.orm import Session

from .tutorial_content import is_known_tutorial, media_allowed_section_ids, section_allows_media
from .tutorial_seeds import known_tutorial_ids

# Backward-compatible alias used by older tests / imports.
KNOWN_TUTORIAL_IDS = known_tutorial_ids()


def is_known_slot(tutorial_id: str, section_id: str, db: Optional[Session] = None) -> bool:
    """True when the section exists in merged content and allows media."""
    if db is None:
        # Without a session, only seed defaults (no custom/override awareness).
        from .tutorial_seeds import get_seed_section

        seed = get_seed_section(tutorial_id, section_id)
        return bool(seed and seed.allows_media)
    if not is_known_tutorial(tutorial_id):
        return False
    return section_allows_media(db, tutorial_id, section_id)


def allowed_media_section_ids(db: Session, tutorial_id: str) -> Set[str]:
    return media_allowed_section_ids(db, tutorial_id)


# Deprecated static map kept for tests that still import KNOWN_SLOTS shape.
# Prefer is_known_slot(..., db) / allowed_media_section_ids.
def _seed_media_slots_map() -> dict:
    from .tutorial_seeds import TUTORIAL_SEEDS

    return {
        tid: [s.id for s in sections if s.allows_media]
        for tid, sections in TUTORIAL_SEEDS.items()
    }


KNOWN_SLOTS = _seed_media_slots_map()
