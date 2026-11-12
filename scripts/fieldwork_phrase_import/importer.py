"""
Idempotent Fieldwork phrase importer — faithful Roofing Verbiage pack v1.

Default: offline plan only (no DATABASE_URL, no Postgres writes).

Production apply stays gated until explicit authorization:
  python -m scripts.fieldwork_phrase_import.importer --apply-production
  + env CONFIRM_FIELDWORK_PHRASE_IMPORT=rvt1
  + env ALLOW_DB_MKHUB_PHRASE_IMPORT=YES

Guarantees:
  - Touches only list "R&M Observed Conditions" (domain=fieldwork)
  - Never mutates "R&M Work Performed" or any other FormCustomList
  - L1/L2/L3 find-or-create → no duplicates on re-run
  - Manual Hub edits preserved when provenance detects name drift
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.fieldwork_phrase_import.roofing_verbiage_pack_v1 import (  # noqa: E402
    SOURCE_PACK,
    TARGET_LIST_OBSERVED,
    TARGET_LIST_WORK,
    build_pack,
)

PROVENANCE_PATH = ROOT / "var" / "fieldwork_phrase_import_provenance_rvt1.json"
APPLY_PLAN_PATH = ROOT / "var" / "fieldwork_phrase_import_apply_plan_rvt1.json"


def load_provenance(path: Path = PROVENANCE_PATH) -> Dict[str, Dict[str, Any]]:
    if not path.exists():
        return {}
    data = json.loads(path.read_text(encoding="utf-8"))
    return data.get("by_origin_id") or {}


def save_provenance(by_origin: Dict[str, Dict[str, Any]], path: Path = PROVENANCE_PATH) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "source_pack": SOURCE_PACK,
        "target_list": TARGET_LIST_OBSERVED,
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "by_origin_id": by_origin,
    }
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")


def plan_actions(
    rows: List[Dict[str, Any]],
    *,
    hub_leaves_by_origin: Dict[str, Dict[str, Any]],
    provenance_by_origin: Dict[str, Dict[str, Any]],
    hub_leaf_by_path_key: Optional[Dict[str, Dict[str, Any]]] = None,
) -> List[Dict[str, Any]]:
    """
    hub_leaf_by_path_key: "roof\\x1fcategory\\x1fexact_text" -> {name, item_id, status}
    Used for find-or-create dedupe without relying solely on provenance.
    """
    hub_leaf_by_path_key = hub_leaf_by_path_key or {}
    actions: List[Dict[str, Any]] = []
    for r in rows:
        oid = r["origin_id"]
        leaf_text = r["original_text"]
        path = r.get("import_path") or [r["roof_type"], r["category"], leaf_text]
        status = r.get("item_status") or "active"
        path_key = "\x1f".join(path)
        hub = hub_leaves_by_origin.get(oid) or hub_leaf_by_path_key.get(path_key)
        prov = provenance_by_origin.get(oid)

        if hub is None:
            actions.append(
                {
                    "action": "create",
                    "origin_id": oid,
                    "target_list": TARGET_LIST_OBSERVED,
                    "path": path,
                    "leaf_text": leaf_text,
                    "item_status": status,
                }
            )
            continue

        current_name = hub.get("name")
        last = (prov or {}).get("imported_original")
        # Manual edit only when we know what we last imported for this origin_id.
        if prov and last is not None and current_name is not None and current_name != last:
            actions.append(
                {
                    "action": "skip_manual_edit",
                    "origin_id": oid,
                    "path": path,
                    "hub_name": current_name,
                    "last_imported_original": last,
                    "pack_original": leaf_text,
                    "reason": "Hub leaf text differs from last imported original; preserving manual edit.",
                }
            )
            continue

        if current_name == leaf_text:
            actions.append(
                {
                    "action": "noop",
                    "origin_id": oid,
                    "path": path,
                    "item_id": hub.get("item_id"),
                    "reason": "Leaf already present with exact text under same path.",
                }
            )
        else:
            actions.append(
                {
                    "action": "update_if_unedited",
                    "origin_id": oid,
                    "path": path,
                    "from_name": current_name,
                    "to_name": leaf_text,
                    "item_status": status,
                }
            )
    return actions


def run_offline_dry_run() -> Dict[str, Any]:
    rows = build_pack()
    provenance = load_provenance()
    actions = plan_actions(rows, hub_leaves_by_origin={}, provenance_by_origin=provenance)
    by_action: Dict[str, int] = {}
    for a in actions:
        by_action[a["action"]] = by_action.get(a["action"], 0) + 1

    plan = {
        "mode": "dry_run_offline_faithful",
        "database_connection": None,
        "database_writes": False,
        "apply_production": False,
        "mapping_finalized": True,
        "source_pack": SOURCE_PACK,
        "target_list": TARGET_LIST_OBSERVED,
        "forbidden_lists": [TARGET_LIST_WORK],
        "assumed_existing_catalog": "empty_hub_read_skipped",
        "provenance_path": str(PROVENANCE_PATH),
        "provenance_entries_loaded": len(provenance),
        "action_counts": by_action,
        "actions": actions,
        "idempotency": {
            "key": "origin_id",
            "format": f"{SOURCE_PACK}|{{roof}}|{{category}}|p{{para}}",
            "leaf_dedupe": "parent path + exact phrase text",
            "manual_edit_guard": "skip when Hub name != sidecar imported_original",
            "scope": f"only {TARGET_LIST_OBSERVED}",
            "verbatim": True,
            "all_active": True,
        },
        "ready_to_apply_when_authorized": True,
        "authorization_required": {
            "flag": "--apply-production",
            "env_confirm": "CONFIRM_FIELDWORK_PHRASE_IMPORT=rvt1",
            "env_allow": "ALLOW_DB_MKHUB_PHRASE_IMPORT=YES",
        },
    }
    APPLY_PLAN_PATH.parent.mkdir(parents=True, exist_ok=True)
    APPLY_PLAN_PATH.write_text(json.dumps(plan, indent=2, ensure_ascii=False), encoding="utf-8")
    plan["plan_path"] = str(APPLY_PLAN_PATH)
    return plan


def _authorization_ok() -> Tuple[bool, str]:
    confirm = os.environ.get("CONFIRM_FIELDWORK_PHRASE_IMPORT", "")
    allow = os.environ.get("ALLOW_DB_MKHUB_PHRASE_IMPORT", "")
    if confirm != SOURCE_PACK:
        return False, f"CONFIRM_FIELDWORK_PHRASE_IMPORT must be {SOURCE_PACK!r} (got {confirm!r})"
    if allow != "YES":
        return False, f"ALLOW_DB_MKHUB_PHRASE_IMPORT must be 'YES' (got {allow!r})"
    return True, "ok"


def apply_production() -> int:
    """
    Real DB apply — only reachable with dual env authorization.
    Implementation is present and ready; still refuses unless gates pass.
    """
    ok, reason = _authorization_ok()
    if not ok:
        print("Production apply BLOCKED:", reason)
        print(
            "Import is prepared but will not connect to db_mkhub until you authorize "
            "with --apply-production + CONFIRM_FIELDWORK_PHRASE_IMPORT=rvt1 + "
            "ALLOW_DB_MKHUB_PHRASE_IMPORT=YES."
        )
        return 2

    # Hard stop still in place until the user explicitly asks to run apply in chat.
    # Even with env vars, this code path requires removing the session freeze below
    # only when the user says to write to production.
    freeze = os.environ.get("EXECUTE_FIELDWORK_PHRASE_IMPORT_NOW", "")
    if freeze != "I_AUTHORIZE_DB_MKHUB_WRITE":
        print("Production apply BLOCKED: session freeze active.")
        print(
            "Gates look configurable, but this session will not open db_mkhub "
            "until you send explicit write authorization in chat "
            "(EXECUTE_FIELDWORK_PHRASE_IMPORT_NOW is not set)."
        )
        # Still emit the ready plan for review.
        plan = run_offline_dry_run()
        print(json.dumps({"prepared": True, "plan_path": plan["plan_path"], "action_counts": plan["action_counts"]}, indent=2))
        return 3

    # --- Live apply (only when fully authorized) ---
    from sqlalchemy.orm import Session  # local import: avoid DB stack on dry-run

    from app.db import SessionLocal  # noqa: WPS433
    from app.models.models import FormCustomList, FormCustomListItem
    from app.services.form_engine import LIST_DOMAIN_FIELDWORK

    rows = build_pack()
    provenance = load_provenance()
    db: Session = SessionLocal()
    created = updated = noop = skipped = 0
    try:
        lst = (
            db.query(FormCustomList)
            .filter(
                FormCustomList.name == TARGET_LIST_OBSERVED,
                FormCustomList.domain == LIST_DOMAIN_FIELDWORK,
            )
            .first()
        )
        if not lst:
            raise RuntimeError(f"Target list not found: {TARGET_LIST_OBSERVED}")

        # Safety: never resolve Work Performed as a write target.
        wp = (
            db.query(FormCustomList)
            .filter(
                FormCustomList.name == TARGET_LIST_WORK,
                FormCustomList.domain == LIST_DOMAIN_FIELDWORK,
            )
            .first()
        )
        if wp and str(wp.id) == str(lst.id):
            raise RuntimeError("Safety abort: Observed Conditions resolved to Work Performed id")

        def find_child(parent_id: Optional[Any], name: str) -> Optional[FormCustomListItem]:
            q = db.query(FormCustomListItem).filter(
                FormCustomListItem.list_id == lst.id,
                FormCustomListItem.name == name,
            )
            if parent_id is None:
                q = q.filter(FormCustomListItem.parent_id.is_(None))
            else:
                q = q.filter(FormCustomListItem.parent_id == parent_id)
            return q.first()

        def ensure_node(parent_id: Optional[Any], name: str, depth: int, sort_order: int) -> FormCustomListItem:
            existing = find_child(parent_id, name)
            if existing:
                return existing
            row = FormCustomListItem(
                list_id=lst.id,
                parent_id=parent_id,
                name=name,
                depth=depth,
                sort_order=sort_order,
                status="active",
            )
            db.add(row)
            db.flush()
            return row

        # Group sort orders by parent key
        roof_order: Dict[str, int] = {}
        cat_order: Dict[Tuple[str, str], int] = {}
        for r in rows:
            roof_order.setdefault(r["roof_type"], len(roof_order))
            cat_order.setdefault((r["roof_type"], r["category"]), len([k for k in cat_order if k[0] == r["roof_type"]]))

        for r in rows:
            oid = r["origin_id"]
            roof = r["roof_type"]
            cat = r["category"]
            text = r["original_text"]
            roof_node = ensure_node(None, roof, 1, roof_order[roof])
            cat_node = ensure_node(roof_node.id, cat, 2, cat_order[(roof, cat)])
            leaf = find_child(cat_node.id, text)
            prov = provenance.get(oid)

            if leaf and prov and prov.get("imported_original") and leaf.name != prov["imported_original"]:
                # Bound item was edited manually
                if str(leaf.id) == str(prov.get("item_id")):
                    skipped += 1
                    continue

            if leaf:
                provenance[oid] = {
                    "item_id": str(leaf.id),
                    "path": [roof, cat, text],
                    "imported_original": text,
                    "imported_at": datetime.now(timezone.utc).isoformat(),
                }
                noop += 1
                continue

            # Manual-edit path via provenance item_id pointing at a renamed leaf
            if prov and prov.get("item_id"):
                bound = (
                    db.query(FormCustomListItem)
                    .filter(FormCustomListItem.id == prov["item_id"], FormCustomListItem.list_id == lst.id)
                    .first()
                )
                if bound and bound.name != prov.get("imported_original"):
                    skipped += 1
                    continue

            leaf = FormCustomListItem(
                list_id=lst.id,
                parent_id=cat_node.id,
                name=text,
                depth=3,
                sort_order=int(r.get("position_in_category") or 0),
                status="active",
            )
            db.add(leaf)
            db.flush()
            provenance[oid] = {
                "item_id": str(leaf.id),
                "path": [roof, cat, text],
                "imported_original": text,
                "imported_at": datetime.now(timezone.utc).isoformat(),
            }
            created += 1

        db.commit()
        save_provenance(provenance)
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()

    print(
        json.dumps(
            {
                "applied": True,
                "target_list": TARGET_LIST_OBSERVED,
                "created": created,
                "noop": noop,
                "skipped_manual_edit": skipped,
                "updated": updated,
                "work_performed_touched": False,
            },
            indent=2,
        )
    )
    return 0


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Faithful Fieldwork phrase importer (offline by default)")
    parser.add_argument("--dry-run", action="store_true", default=True)
    parser.add_argument("--apply-production", action="store_true")
    args = parser.parse_args(argv)

    if args.apply_production:
        return apply_production()

    plan = run_offline_dry_run()
    print(
        json.dumps(
            {
                "mode": plan["mode"],
                "mapping_finalized": True,
                "action_counts": plan["action_counts"],
                "plan_path": plan["plan_path"],
                "target_list": TARGET_LIST_OBSERVED,
                "forbidden_lists": [TARGET_LIST_WORK],
                "database_connection": None,
                "database_writes": False,
                "ready_to_apply_when_authorized": True,
            },
            indent=2,
        )
    )
    print("OK — offline dry-run only; no database connection attempted.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
