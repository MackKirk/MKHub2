"""
Offline dry-run: faithful Roofing Verbiage → R&M Observed Conditions.

- Does NOT read DATABASE_URL
- Does NOT connect to Postgres / db_mkhub
- Verbatim texts; all 57 leaves active
"""
from __future__ import annotations

import json
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.fieldwork_phrase_import.roofing_verbiage_pack_v1 import (  # noqa: E402
    SOURCE_PACK,
    TARGET_LIST_OBSERVED,
    TARGET_LIST_WORK,
    build_pack,
    summarize,
)


def main() -> int:
    rows = build_pack()
    summary = summarize(rows)
    assert len(rows) == 57, f"Expected 57 originals, got {len(rows)}"
    assert summary["fits_name_column"]
    assert summary["selectable_active_leaves"] == 57
    assert summary["reference_inactive_leaves"] == 0

    plan = {
        "mode": "dry_run_offline_faithful",
        "database_connection": None,
        "database_writes": False,
        "apply_production": False,
        "mapping_finalized": True,
        "policy": {
            "verbatim_text": True,
            "all_57_active": True,
            "no_spelling_fixes": True,
            "no_splits": True,
            "no_recommended_actions_list": True,
            "no_work_performed_invention": True,
            "source_of_truth": "R&M Word document",
        },
        "source_pack": SOURCE_PACK,
        "target_list_observed": TARGET_LIST_OBSERVED,
        "target_list_work_performed": TARGET_LIST_WORK,
        "work_performed_import_count": 0,
        "summary": summary,
        "scope_guard": {
            "writes_allowed_to": [TARGET_LIST_OBSERVED],
            "writes_forbidden_to": [TARGET_LIST_WORK, "*any_other_form_custom_list*"],
        },
        "idempotency": {
            "key": "origin_id",
            "format": "rvt1|{roof_type}|{category}|p{source_para_index}",
            "leaf_dedupe": "find-or-create by parent path + exact leaf name",
            "manual_edit_guard": (
                "If provenance origin_id → item_id exists and Hub name != imported_original, skip"
            ),
            "re_run_safe": True,
        },
        "entries": rows,
    }

    out_json = ROOT / "var" / "fieldwork_phrase_import_dry_run_rvt1.json"
    out_json.parent.mkdir(parents=True, exist_ok=True)
    out_json.write_text(json.dumps(plan, indent=2, ensure_ascii=False), encoding="utf-8")

    md = ROOT / "docs" / "fieldwork_phrase_import_final_preview_rvt1.md"
    lines: list[str] = []
    lines.append("# Final mapping — Roofing Verbiage Templates → Observed Conditions")
    lines.append("")
    lines.append("**Mapping finalized.** Offline dry-run only — no `db_mkhub` writes, no deploy.")
    lines.append("")
    lines.append("## Locked policy")
    lines.append("")
    lines.append("- 57 entries, all **active**, verbatim Word text")
    lines.append("- Hierarchy: Roof type → Category → Phrase (document order)")
    lines.append("- Target: `R&M Observed Conditions` only")
    lines.append("- `R&M Work Performed` untouched")
    lines.append("- No corrections, splits, or reinterpretation")
    lines.append("")
    lines.append("## Counts")
    lines.append("")
    lines.append("| | Count |")
    lines.append("|--|------:|")
    lines.append(f"| Original entries (all active) | **{len(rows)}** |")
    lines.append("| Work Performed | **0** |")
    for roof, n in summary["by_roof_type"].items():
        lines.append(f"| {roof} | {n} |")
    lines.append("")

    by_roof: dict[str, list] = defaultdict(list)
    for r in rows:
        by_roof[r["roof_type"]].append(r)

    for roof in ("Asphalt Shingles", "SBS", "Vinyl Decking"):
        lines.append(f"## {roof}")
        lines.append("")
        current_cat = None
        for r in by_roof[roof]:
            if r["category"] != current_cat:
                current_cat = r["category"]
                lines.append(f"### {current_cat}")
                lines.append("")
            lines.append(f"- `{r['origin_id']}`")
            lines.append(f"  - {r['original_text']}")
            lines.append("")
        lines.append("")

    lines.append("## Idempotency & scope (apply-ready)")
    lines.append("")
    lines.append("1. Only mutates `R&M Observed Conditions` (domain=fieldwork).")
    lines.append("2. Never creates/updates/deletes items in `R&M Work Performed` or any other list.")
    lines.append("3. L1/L2: find-or-create by name under parent (no duplicate roof/category nodes).")
    lines.append("4. L3: find-or-create by parent + **exact** phrase text (no duplicate identical leaves).")
    lines.append("5. Provenance sidecar binds `origin_id` → `item_id` + `imported_original`.")
    lines.append("6. If Hub leaf was manually edited (name ≠ imported_original) → **skip**, do not overwrite.")
    lines.append("7. Re-running the same pack is safe: existing matches → noop.")
    lines.append("")
    lines.append("## Status")
    lines.append("")
    lines.append("- Mapping: **final**")
    lines.append("- Apply prepared: **yes** (gated)")
    lines.append("- Production write: **blocked until explicit authorization**")
    lines.append("- Deploy: **not executed**")
    lines.append("")

    md.write_text("\n".join(lines), encoding="utf-8")
    print(json.dumps({**summary, "json": str(out_json), "md": str(md)}, indent=2, ensure_ascii=False))
    print("OK dry-run offline faithful — no database connection attempted.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
