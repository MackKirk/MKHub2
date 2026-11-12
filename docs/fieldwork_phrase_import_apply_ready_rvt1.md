# Import execution readiness — rvt1

**Status:** mapping finalized · apply code prepared · **no `db_mkhub` write yet** · **no deploy**

## What will be written (when authorized)

| Target | Action |
|--------|--------|
| `R&M Observed Conditions` (domain=fieldwork) | Find-or-create L1/L2/L3 for 57 verbatim phrases |
| `R&M Work Performed` | **No writes** |
| Any other Form Custom List | **No writes** |

## Idempotency

- `origin_id = rvt1\|{roof}\|{category}\|p{para}`
- Roof/category: find-or-create by name under parent → no duplicate nodes
- Phrase leaf: find-or-create by parent + exact Word text → no duplicate identical leaves
- Re-run → existing matches become `noop`
- If a leaf bound by provenance was manually renamed → `skip` (no silent overwrite)
- Provenance sidecar after apply: `var/fieldwork_phrase_import_provenance_rvt1.json`

## Authorization to write (explicit)

```text
python -m scripts.fieldwork_phrase_import.importer --apply-production
```

Requires all of:

1. `--apply-production`
2. `CONFIRM_FIELDWORK_PHRASE_IMPORT=rvt1`
3. `ALLOW_DB_MKHUB_PHRASE_IMPORT=YES`
4. Explicit chat authorization that sets `EXECUTE_FIELDWORK_PHRASE_IMPORT_NOW=I_AUTHORIZE_DB_MKHUB_WRITE`

Until then, only offline dry-run / apply-plan artifacts are produced.

## Offline artifacts

- `docs/fieldwork_phrase_import_final_preview_rvt1.md`
- `var/fieldwork_phrase_import_dry_run_rvt1.json`
- `var/fieldwork_phrase_import_apply_plan_rvt1.json`
