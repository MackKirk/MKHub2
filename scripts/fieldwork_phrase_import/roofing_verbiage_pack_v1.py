"""
Roofing Verbiage Templates v1 — faithful mapping pack.

Source of truth: the R&M Word document, verbatim.
No spelling fixes, rewrites, splits, or reinterpretation.

Target: existing Fieldwork list `R&M Observed Conditions`
Hierarchy: Roof type (L1) → Category (L2) → Phrase (L3)

Does not connect to any database.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional, TypedDict


SOURCE_DOC = "Roofing Verbiage Templates .docx"
SOURCE_PACK = "rvt1"
TARGET_LIST_OBSERVED = "R&M Observed Conditions"
TARGET_LIST_WORK = "R&M Work Performed"  # untouched / empty for this pack


class Entry(TypedDict, total=False):
    origin_id: str
    source_pack: str
    source_doc: str
    source_para_index: int
    roof_type: str
    category: str
    position_in_category: int
    original_text: str
    import_path: List[str]  # [roof, category, phrase]
    item_status: str  # active | inactive
    notes: str


def _oid(roof: str, category: str, para: int) -> str:
    return f"{SOURCE_PACK}|{roof}|{category}|p{para}"


def build_pack() -> List[Entry]:
    """Exactly 57 original phrase entries, verbatim, in document order."""
    rows: List[Entry] = []

    def add(
        *,
        roof: str,
        category: str,
        para: int,
        pos: int,
        text: str,
        item_status: str = "active",
        notes: str = "",
    ) -> None:
        rows.append(
            {
                "origin_id": _oid(roof, category, para),
                "source_pack": SOURCE_PACK,
                "source_doc": SOURCE_DOC,
                "source_para_index": para,
                "roof_type": roof,
                "category": category,
                "position_in_category": pos,
                "original_text": text,
                "import_path": [roof, category, text],
                "item_status": item_status,
                "notes": notes,
            }
        )

    # ---------- Asphalt Shingles ----------
    R = "Asphalt Shingles"
    add(roof=R, category="Damage/Punctures/Tears", para=3, pos=0,
        text="Ripped/torn asphalt shingles were observed throughout the roof areas.")
    add(roof=R, category="Damage/Punctures/Tears", para=4, pos=1,
        text="Several shingles were observed to be punctured.")

    add(roof=R, category="Debris", para=6, pos=0,
        text="Various types of debris were found on the roof surfaces.")
    add(roof=R, category="Debris", para=7, pos=1,
        text="Animal feces accumulated in a corner.")
    add(roof=R, category="Debris", para=8, pos=2,
        text="Organic debris was observed throughout.")
    add(roof=R, category="Debris", para=9, pos=3,
        text="A build up of general debris has accumulated within the debris strainers, causing blockages.")

    add(roof=R, category="Granular Loss", para=11, pos=0,
        text="Granular loss was noted on the asphalt shingles.")
    add(roof=R, category="Granular Loss", para=12, pos=1,
        text="The asphalt shingles are suffering from severe granule loss.")

    add(roof=R, category="Gutters", para=14, pos=0,
        text="Damaged gutters were noted in multiple areas.")
    add(roof=R, category="Gutters", para=15, pos=1,
        text="The gutter was damaged.")
    add(roof=R, category="Gutters", para=16, pos=2,
        text="Debris was noted within some of the gutters.")
    add(roof=R, category="Gutters", para=17, pos=3,
        text="The loose granules have accumulated within the gutters, causing blockages at the downpipe elbow/s.")

    add(roof=R, category="Organic Growth", para=19, pos=0,
        text="Organic growth was observed throughout.")
    add(roof=R, category="Organic Growth", para=20, pos=1,
        text="Several well-established concentrations of organic growth were seen.")
    add(roof=R, category="Organic Growth", para=21, pos=2,
        text="The roof is suffering from large pockets of organic growth.")

    add(roof=R, category="Plumbing Stacks", para=23, pos=0,
        text="A settlement cap is missing. The flashing is also too high and needs to be cut down.")
    add(roof=R, category="Plumbing Stacks", para=24, pos=1,
        text="The 5 in 1 flashing for the plumbing stack is severely degraded.")
    add(roof=R, category="Plumbing Stacks", para=25, pos=2,
        text="The lead flashing that encapsulates the plumbing stack has degraded and needs replacing.")

    add(roof=R, category="Punctures", para=27, pos=0,
        text="Multiple punctures were observed throughout the roof areas.")

    add(roof=R, category="Ridge Caps", para=31, pos=0,
        text="All the ridge caps are cracked.")
    add(roof=R, category="Ridge Caps", para=32, pos=1,
        text="Several of the ridge caps are cracked.")
    add(roof=R, category="Ridge Caps", para=33, pos=2,
        text="Several of the ridge caps are either missing or needs to be replaced.")

    add(roof=R, category="Safety", para=35, pos=0,
        text="Temporary safety anchors are fixed through the roof surface throughout.")
    add(roof=R, category="Safety", para=36, pos=1,
        text="A temporary roof anchor has been left.")

    # ---------- SBS ----------
    R = "SBS"
    add(
        roof=R,
        category="Alligatoring/Crazing",
        para=41,
        pos=0,
        text=(
            "Crazing or ‘Alligatoring’ is characterized by a pattern of cracks resembling an alligator's skin, "
            "caused by the sun's UV rays drying out and damaging the roof's surface."
        ),
    )
    add(roof=R, category="Alligatoring/Crazing", para=42, pos=1,
        text="Crazing or ‘alligatioring’ was observed throughout.")

    add(roof=R, category="Blisters", para=45, pos=0,
        text="Severe granular loss and minor blisters were observed throughout.")

    add(
        roof=R,
        category="BUR vent/Dryer Vent",
        para=49,
        pos=0,
        text=(
            'A dryer/BUR vent was noted to have an additional modified opening on it. '
            'This is far below the industry standard of a minimum 8" flood plain/finished roof surface height.'
        ),
    )

    add(roof=R, category="Damage/Punctures/Tears", para=53, pos=0,
        text="The roof has been damaged in multiple locations.")
    add(roof=R, category="Damage/Punctures/Tears", para=54, pos=1,
        text="Damaged gutters were noted in multiple areas.")

    add(roof=R, category="Debris (General)", para=56, pos=0,
        text="Various types of debris were found on the roof surfaces.")
    add(roof=R, category="Debris (General)", para=57, pos=1,
        text="Animal feces accumulated in a corner.")

    add(roof=R, category="Debris (Organic)", para=59, pos=0,
        text="The internal roof drain sumps are packed with organic debris. This impedes water flow.")

    add(roof=R, category="Granular Loss", para=61, pos=0,
        text="Granular loss was observed on the roof surface throughout.")
    add(roof=R, category="Granular Loss", para=62, pos=1,
        text="Severe granular loss and minor blisters were observed throughout.")

    add(roof=R, category="Gutters", para=64, pos=0,
        text="Damaged gutters were noted in multiple areas.")
    add(roof=R, category="Gutters", para=65, pos=1,
        text="The gutter was damaged.")
    add(roof=R, category="Gutters", para=66, pos=2,
        text="Debris was noted within some of the gutters.")

    add(roof=R, category="Membrane", para=68, pos=0,
        text="The membrane was not trimmed back when initially installed.")

    add(roof=R, category="Metal Flashings", para=72, pos=0,
        text="Several of the metal skirt flashings around the RTU’s are loose or open to water ingress.")

    add(roof=R, category="Menzie/Plumbing stack", para=74, pos=0,
        text="A settlement cap was observed to be missing from a plumbing stack.")
    add(roof=R, category="Menzie/Plumbing stack", para=75, pos=1,
        text="All the penetrations require a new layer of liquid membrane and granules.")
    add(roof=R, category="Menzie/Plumbing stack", para=76, pos=2,
        text="A plumbing stack has a cap that is the incorrect size. It can cause moisture to enter the roof system and building.")

    add(roof=R, category="Organic Growth", para=78, pos=0,
        text="Organic growth was observed throughout.")
    add(roof=R, category="Organic Growth", para=79, pos=1,
        text="Organic debris was observed throughout.")
    add(roof=R, category="Organic Growth", para=80, pos=2,
        text="Organic debris was observed throughout. Especially at the low spots of the roof.")

    add(roof=R, category="Paving Slabs", para=82, pos=0,
        text="There is an excessive amount of paving slabs on the roof areas.")
    add(roof=R, category="Paving Slabs", para=83, pos=1,
        text="Paving slabs are also surrounding the internal roof drains.")
    add(roof=R, category="Paving Slabs", para=84, pos=2,
        text="The membrane is unprotected underneath this paving stone. They can become imbedded into the membrane and in some cases cause punctures.")
    add(roof=R, category="Paving Slabs", para=85, pos=3,
        text="It should be removed, the roof be reviewed, repaired if applicable and a sacrificial sheet of SBS installed underneath.")

    add(roof=R, category="Ponding Water", para=87, pos=0,
        text="Ponding water was observed in several locations.")

    add(roof=R, category="Punctures", para=89, pos=0,
        text="Multiple punctures were observed throughout the roof areas.")
    add(roof=R, category="Punctures", para=90, pos=1,
        text="An open corner was observed at an extraction fan curb. It requires to be repaired.")

    add(roof=R, category="Rust/Corrosion", para=92, pos=0,
        text="Corrosion was observed to be well established on the roof hatch.")
    add(roof=R, category="Rust/Corrosion", para=93, pos=1,
        text="Solution - It requires to be treated with a rust inhibiting paint.")

    # ---------- Vinyl Decking ----------
    R = "Vinyl Decking"
    add(roof=R, category="Corners", para=96, pos=0,
        text="A few corners are open to water ingress.")
    add(roof=R, category="Trim", para=98, pos=0,
        text="The outer trim was observed to be damaged on approximately 30% of the vinyl decks.")

    return rows


def summarize(rows: List[Entry]) -> Dict[str, Any]:
    from collections import Counter

    by_roof = Counter(r["roof_type"] for r in rows)
    by_status = Counter(r["item_status"] for r in rows)
    max_len = max(len(r["original_text"]) for r in rows) if rows else 0
    return {
        "source_doc": SOURCE_DOC,
        "source_pack": SOURCE_PACK,
        "target_list_observed": TARGET_LIST_OBSERVED,
        "target_list_work_performed": TARGET_LIST_WORK,
        "work_performed_entries": 0,
        "original_entries": len(rows),
        "selectable_active_leaves": by_status.get("active", 0),
        "reference_inactive_leaves": by_status.get("inactive", 0),
        "by_roof_type": dict(by_roof),
        "max_phrase_chars": max_len,
        "name_column_limit": 500,
        "fits_name_column": max_len <= 500,
        "hierarchy": "Roof type (L1) → Category (L2) → Phrase (L3)",
        "max_depth_supported": 3,
    }
