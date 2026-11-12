"""Build import preview markdown from extracted Roofing Verbiage Templates. Analysis only."""
from __future__ import annotations

from pathlib import Path

# (roof_type, category, original_text, info_type, dest_catalog, needs_review, suggestion_or_note)
# info_type: observation | recommendation | technical_explanation | mixed_obs_recommendation | empty_heading
# dest_catalog: Observed Conditions | Work Performed | Recommended Actions (proposed) | — (skip)

ROWS: list[tuple[str, str, str, str, str, str, str]] = [
    # --- Asphalt Shingles ---
    ("Asphalt Shingles", "Damage/Punctures/Tears", "Ripped/torn asphalt shingles were observed throughout the roof areas.", "observation", "Observed Conditions", "No", "—"),
    ("Asphalt Shingles", "Damage/Punctures/Tears", "Several shingles were observed to be punctured.", "observation", "Observed Conditions", "No", "—"),
    ("Asphalt Shingles", "Debris", "Various types of debris were found on the roof surfaces.", "observation", "Observed Conditions", "Note", "Also appears under SBS › Debris (General). Keep separate under each roof type (do not collapse)."),
    ("Asphalt Shingles", "Debris", "Animal feces accumulated in a corner.", "observation", "Observed Conditions", "Note", "Also appears under SBS › Debris (General). Keep separate."),
    ("Asphalt Shingles", "Debris", "Organic debris was observed throughout.", "observation", "Observed Conditions", "Note", "Also appears under SBS › Organic Growth. Keep separate."),
    ("Asphalt Shingles", "Debris", "A build up of general debris has accumulated within the debris strainers, causing blockages.", "observation", "Observed Conditions", "Yes (writing)", "Suggestion: “A build-up of general debris has accumulated within the debris strainers, causing blockages.”"),
    ("Asphalt Shingles", "Granular Loss", "Granular loss was noted on the asphalt shingles.", "observation", "Observed Conditions", "No", "—"),
    ("Asphalt Shingles", "Granular Loss", "The asphalt shingles are suffering from severe granule loss.", "observation", "Observed Conditions", "Yes (absolute tone)", "Suggestion (optional soften): “The asphalt shingles show severe granule loss.” Keep original if dept. prefers stronger language."),
    ("Asphalt Shingles", "Gutters", "Damaged gutters were noted in multiple areas.", "observation", "Observed Conditions", "Note", "Repeated under SBS › Damage and SBS › Gutters. Keep per roof type."),
    ("Asphalt Shingles", "Gutters", "The gutter was damaged.", "observation", "Observed Conditions", "No", "—"),
    ("Asphalt Shingles", "Gutters", "Debris was noted within some of the gutters.", "observation", "Observed Conditions", "No", "—"),
    ("Asphalt Shingles", "Gutters", "The loose granules have accumulated within the gutters, causing blockages at the downpipe elbow/s.", "observation", "Observed Conditions", "Yes (writing)", "Suggestion: “…downpipe elbow(s).”"),
    ("Asphalt Shingles", "Organic Growth", "Organic growth was observed throughout.", "observation", "Observed Conditions", "Note", "Also under SBS. Keep separate."),
    ("Asphalt Shingles", "Organic Growth", "Several well-established concentrations of organic growth were seen.", "observation", "Observed Conditions", "No", "—"),
    ("Asphalt Shingles", "Organic Growth", "The roof is suffering from large pockets of organic growth.", "observation", "Observed Conditions", "Yes (absolute tone)", "Optional: “The roof shows large pockets of organic growth.”"),
    ("Asphalt Shingles", "Plumbing Stacks", "A settlement cap is missing. The flashing is also too high and needs to be cut down.", "mixed_obs_recommendation", "Observed Conditions (+ flag recommendation segment)", "Yes (split?)", "Split suggestion: (1) Obs: “A settlement cap is missing. The flashing sits too high.” (2) Rec: “Flashing needs to be cut down.” Or keep as one mixed leaf under Plumbing Stacks."),
    ("Asphalt Shingles", "Plumbing Stacks", "The 5 in 1 flashing for the plumbing stack is severely degraded.", "observation", "Observed Conditions", "Yes (writing)", "Suggestion: “The 5-in-1 flashing for the plumbing stack is severely degraded.”"),
    ("Asphalt Shingles", "Plumbing Stacks", "The lead flashing that encapsulates the plumbing stack has degraded and needs replacing.", "mixed_obs_recommendation", "Observed Conditions (+ flag)", "Yes (split?)", "Obs: “…has degraded.” Rec: “…needs replacing.”"),
    ("Asphalt Shingles", "Punctures", "Multiple punctures were observed throughout the roof areas.", "observation", "Observed Conditions", "Note", "Also under SBS › Punctures. Keep separate. Overlaps thematically with Damage/Punctures/Tears."),
    ("Asphalt Shingles", "Ridge Caps", "All the ridge caps are cracked.", "observation", "Observed Conditions", "Yes (absolute)", "Suggestion: “All inspected ridge caps are cracked.” or “Ridge caps were observed cracked throughout.”"),
    ("Asphalt Shingles", "Ridge Caps", "Several of the ridge caps are cracked.", "observation", "Observed Conditions", "No", "—"),
    ("Asphalt Shingles", "Ridge Caps", "Several of the ridge caps are either missing or needs to be replaced.", "mixed_obs_recommendation", "Observed Conditions (+ flag)", "Yes (grammar)", "Original grammar issue. Suggestion: “Several of the ridge caps are either missing or need to be replaced.”"),
    ("Asphalt Shingles", "Safety", "Temporary safety anchors are fixed through the roof surface throughout.", "observation", "Observed Conditions", "No", "—"),
    ("Asphalt Shingles", "Safety", "A temporary roof anchor has been left.", "observation", "Observed Conditions", "Yes (clarity)", "Suggestion: “A temporary roof anchor has been left in place.”"),
    # --- SBS ---
    ("SBS", "Alligatoring/Crazing", "Crazing or ‘Alligatoring’ is characterized by a pattern of cracks resembling an alligator's skin, caused by the sun's UV rays drying out and damaging the roof's surface.", "technical_explanation", "Observed Conditions (as category note / non-leaf) OR exclude from photo picker", "Yes (role)", "Not a photo caption. Prefer store as inactive helper text / category description, not selectable leaf. If imported as leaf, mark inactive for mobile picker."),
    ("SBS", "Alligatoring/Crazing", "Crazing or ‘alligatioring’ was observed throughout.", "observation", "Observed Conditions", "Yes (typo)", "Original typo “alligatioring”. Suggestion: “Crazing or ‘alligatoring’ was observed throughout.”"),
    ("SBS", "Blisters", "Severe granular loss and minor blisters were observed throughout.", "observation", "Observed Conditions", "Note", "Exact duplicate also under SBS › Granular Loss. Import once under each category only if dept. wants both browse paths; else keep under Blisters and reference from Granular Loss."),
    ("SBS", "BUR vent/Dryer Vent", "A dryer/BUR vent was noted to have an additional modified opening on it. This is far below the industry standard of a minimum 8\" flood plain/finished roof surface height.", "observation", "Observed Conditions", "Yes (fixed value)", "Contains fixed industry claim (8\"). Keep as-is pending dept. confirmation of standard wording."),
    ("SBS", "Damage/Punctures/Tears", "The roof has been damaged in multiple locations.", "observation", "Observed Conditions", "No", "—"),
    ("SBS", "Damage/Punctures/Tears", "Damaged gutters were noted in multiple areas.", "observation", "Observed Conditions", "Yes (category fit)", "Same text as Gutters. Suggestion: move/only keep under Gutters; or keep if intentionally listed under Damage too."),
    ("SBS", "Debris (General)", "Various types of debris were found on the roof surfaces.", "observation", "Observed Conditions", "Note", "Duplicate of Asphalt › Debris (separate roof-type branch)."),
    ("SBS", "Debris (General)", "Animal feces accumulated in a corner.", "observation", "Observed Conditions", "Note", "Duplicate of Asphalt › Debris (separate roof-type branch)."),
    ("SBS", "Debris (Organic)", "The internal roof drain sumps are packed with organic debris. This impedes water flow.", "observation", "Observed Conditions", "No", "—"),
    ("SBS", "Granular Loss", "Granular loss was observed on the roof surface throughout.", "observation", "Observed Conditions", "No", "—"),
    ("SBS", "Granular Loss", "Severe granular loss and minor blisters were observed throughout.", "observation", "Observed Conditions", "Note", "Duplicate of SBS › Blisters text."),
    ("SBS", "Gutters", "Damaged gutters were noted in multiple areas.", "observation", "Observed Conditions", "Note", "Also Asphalt › Gutters and SBS › Damage."),
    ("SBS", "Gutters", "The gutter was damaged.", "observation", "Observed Conditions", "Note", "Also Asphalt › Gutters."),
    ("SBS", "Gutters", "Debris was noted within some of the gutters.", "observation", "Observed Conditions", "Note", "Also Asphalt › Gutters."),
    ("SBS", "Membrane", "The membrane was not trimmed back when initially installed.", "observation", "Observed Conditions", "No", "—"),
    ("SBS", "Metal Flashings", "Several of the metal skirt flashings around the RTU’s are loose or open to water ingress.", "observation", "Observed Conditions", "Yes (writing)", "Suggestion: “Several of the metal skirt flashings around the RTUs are loose or open to water ingress.”"),
    ("SBS", "Menzie/Plumbing stack", "A settlement cap was observed to be missing from a plumbing stack.", "observation", "Observed Conditions", "No", "—"),
    ("SBS", "Menzie/Plumbing stack", "All the penetrations require a new layer of liquid membrane and granules.", "recommendation", "Recommended Actions (proposed) OR Observed Conditions › Recommended Actions", "Yes (absolute + not work performed)", "Not Work Performed. Absolute “All”. Suggestion: “All inspected penetrations require a new layer of liquid membrane and granules.”"),
    ("SBS", "Menzie/Plumbing stack", "A plumbing stack has a cap that is the incorrect size. It can cause moisture to enter the roof system and building.", "observation", "Observed Conditions", "No", "—"),
    ("SBS", "Organic Growth", "Organic growth was observed throughout.", "observation", "Observed Conditions", "Note", "Also Asphalt."),
    ("SBS", "Organic Growth", "Organic debris was observed throughout.", "observation", "Observed Conditions", "Note", "Also Asphalt › Debris."),
    ("SBS", "Organic Growth", "Organic debris was observed throughout. Especially at the low spots of the roof.", "observation", "Observed Conditions", "Yes (writing)", "Suggestion: “Organic debris was observed throughout, especially at the low spots of the roof.”"),
    ("SBS", "Paving Slabs", "There is an excessive amount of paving slabs on the roof areas.", "observation", "Observed Conditions", "No", "—"),
    ("SBS", "Paving Slabs", "Paving slabs are also surrounding the internal roof drains.", "observation", "Observed Conditions", "No", "—"),
    ("SBS", "Paving Slabs", "The membrane is unprotected underneath this paving stone. They can become imbedded into the membrane and in some cases cause punctures.", "observation", "Observed Conditions", "Yes (writing)", "Suggestion: “…become embedded into the membrane…”"),
    ("SBS", "Paving Slabs", "It should be removed, the roof be reviewed, repaired if applicable and a sacrificial sheet of SBS installed underneath.", "recommendation", "Recommended Actions (proposed)", "Yes (not work performed)", "Clear recommendation. Do NOT map to Work Performed."),
    ("SBS", "Ponding Water", "Ponding water was observed in several locations.", "observation", "Observed Conditions", "No", "—"),
    ("SBS", "Punctures", "Multiple punctures were observed throughout the roof areas.", "observation", "Observed Conditions", "Note", "Also Asphalt › Punctures."),
    ("SBS", "Punctures", "An open corner was observed at an extraction fan curb. It requires to be repaired.", "mixed_obs_recommendation", "Split or Observed + Recommended Actions", "Yes (split + writing)", "Obs: “An open corner was observed at an extraction fan curb.” Rec suggestion: “It requires repair.” / “It needs to be repaired.”"),
    ("SBS", "Rust/Corrosion", "Corrosion was observed to be well established on the roof hatch.", "observation", "Observed Conditions", "No", "—"),
    ("SBS", "Rust/Corrosion", "Solution - It requires to be treated with a rust inhibiting paint.", "recommendation", "Recommended Actions (proposed)", "Yes (writing + not work performed)", "Suggestion: “It requires treatment with a rust-inhibiting paint.” Strip “Solution -” prefix or keep as labeled recommendation."),
    # --- Vinyl Decking ---
    ("Vinyl Decking", "Corners", "A few corners are open to water ingress.", "observation", "Observed Conditions", "No", "—"),
    ("Vinyl Decking", "Trim", "The outer trim was observed to be damaged on approximately 30% of the vinyl decks.", "observation", "Observed Conditions", "Yes (fixed %)", "Contains fixed percentage (30%). Keep pending dept. confirmation; may need site-specific editing in Additional Comments."),
]

out = Path(r"c:\_MK\Dev\MKHub\docs\fieldwork_phrase_import_preview_roofing_verbiage.md")

def esc(s: str) -> str:
    return s.replace("|", "\\|").replace("\n", " ")

lines = []
lines.append("# Preview — Roofing Verbiage Templates → Fieldwork phrase catalogs")
lines.append("")
lines.append("**Status:** analysis only — **no import executed**, no production DB writes, no deploy.")
lines.append("")
lines.append("**Source:** `Roofing Verbiage Templates .docx` (R&M)")
lines.append("")
lines.append("**Existing catalogs:** `R&M Observed Conditions` · `R&M Work Performed` (Form Custom Lists, domain `fieldwork`)")
lines.append("")
lines.append("## Proposed hierarchy (fits Form Custom List max depth)")
lines.append("")
lines.append("```")
lines.append("List: R&M Observed Conditions")
lines.append("├── Asphalt Shingles")
lines.append("│   ├── Damage/Punctures/Tears → phrases…")
lines.append("│   ├── Debris → …")
lines.append("│   └── …")
lines.append("├── SBS")
lines.append("│   ├── Alligatoring/Crazing → …")
lines.append("│   └── …")
lines.append("└── Vinyl Decking")
lines.append("    ├── Corners → …")
lines.append("    └── Trim → …")
lines.append("```")
lines.append("")
lines.append("Depth plan: roof type (L1) → technical category (L2) → selectable phrase leaf (L3). Supports mobile path + search.")
lines.append("")
lines.append("## Import preview table")
lines.append("")
lines.append("| # | Roof type | Category | Original text | Info type | Destination catalog | Needs review? | Suggestion / note |")
lines.append("|---|-----------|----------|---------------|-----------|---------------------|---------------|-------------------|")

for i, (roof, cat, text, itype, dest, rev, sug) in enumerate(ROWS, 1):
    lines.append(
        f"| {i} | {esc(roof)} | {esc(cat)} | {esc(text)} | {esc(itype)} | {esc(dest)} | {esc(rev)} | {esc(sug)} |"
    )

# stats
from collections import Counter
itype_c = Counter(r[3] for r in ROWS)
dest_c = Counter(r[4].split(" OR")[0].split(" (+")[0].strip() for r in ROWS)
rev_yes = sum(1 for r in ROWS if r[5].startswith("Yes"))

lines.append("")
lines.append("## Counts")
lines.append("")
lines.append(f"- Total document phrases/entries mapped: **{len(ROWS)}**")
lines.append(f"- By info type: " + ", ".join(f"{k}={v}" for k, v in sorted(itype_c.items())))
lines.append(f"- Entries flagged for review (Yes*): **{rev_yes}**")
lines.append(f"- Work Performed mappings in this document: **0** (no completed-service verbiage present)")
lines.append("")
lines.append("## Empty category headings in source")
lines.append("")
lines.append("- SBS › **BUR vent/Dryer Vent** — heading present; one phrase follows after blank lines (included above).")
lines.append("- No other empty technical categories with zero phrases.")
lines.append("")
lines.append("## Cross-roof duplicates (keep separate branches)")
lines.append("")
lines.append("| Text | Appears under |")
lines.append("|------|---------------|")
lines.append("| Various types of debris were found on the roof surfaces. | Asphalt › Debris; SBS › Debris (General) |")
lines.append("| Animal feces accumulated in a corner. | Asphalt › Debris; SBS › Debris (General) |")
lines.append("| Organic debris was observed throughout. | Asphalt › Debris; SBS › Organic Growth |")
lines.append("| Damaged gutters were noted in multiple areas. | Asphalt › Gutters; SBS › Damage; SBS › Gutters |")
lines.append("| The gutter was damaged. | Asphalt › Gutters; SBS › Gutters |")
lines.append("| Debris was noted within some of the gutters. | Asphalt › Gutters; SBS › Gutters |")
lines.append("| Organic growth was observed throughout. | Asphalt › Organic Growth; SBS › Organic Growth |")
lines.append("| Multiple punctures were observed throughout the roof areas. | Asphalt › Punctures; SBS › Punctures |")
lines.append("| Severe granular loss and minor blisters were observed throughout. | SBS › Blisters; SBS › Granular Loss (same roof) |")
lines.append("")
lines.append("## Idempotent import plan (for later approval)")
lines.append("")
lines.append("1. Target list: `R&M Observed Conditions` (and optionally new `R&M Recommended Actions` if approved).")
lines.append("2. Stable keys: `(list_name, path_of_names…)` e.g. `Observed Conditions / SBS / Paving Slabs / <exact original leaf>`.")
lines.append("3. Upsert by path: create missing nodes; do not rename existing leaves that already have PhotoObservation snapshots.")
lines.append("4. Corrections (grammar/typos) only applied when explicitly approved — otherwise store original text.")
lines.append("5. Never run against production until mapping is signed off; use disposable DB for dry-run.")
lines.append("")

out.write_text("\n".join(lines), encoding="utf-8")
print(f"Wrote {out} rows={len(ROWS)} review_yes={rev_yes}")
for k, v in itype_c.most_common():
    print(f"  {k}: {v}")
