# Preview — Roofing Verbiage Templates → Fieldwork phrase catalogs

**Status:** analysis only — **no import executed**, no production DB writes, no deploy.

**Source:** `Roofing Verbiage Templates .docx` (R&M)

**Existing catalogs:** `R&M Observed Conditions` · `R&M Work Performed` (Form Custom Lists, domain `fieldwork`)

## Proposed hierarchy (fits Form Custom List max depth)

```
List: R&M Observed Conditions
├── Asphalt Shingles
│   ├── Damage/Punctures/Tears → phrases…
│   ├── Debris → …
│   └── …
├── SBS
│   ├── Alligatoring/Crazing → …
│   └── …
└── Vinyl Decking
    ├── Corners → …
    └── Trim → …
```

Depth plan: roof type (L1) → technical category (L2) → selectable phrase leaf (L3). Supports mobile path + search.

## Import preview table

| # | Roof type | Category | Original text | Info type | Destination catalog | Needs review? | Suggestion / note |
|---|-----------|----------|---------------|-----------|---------------------|---------------|-------------------|
| 1 | Asphalt Shingles | Damage/Punctures/Tears | Ripped/torn asphalt shingles were observed throughout the roof areas. | observation | Observed Conditions | No | — |
| 2 | Asphalt Shingles | Damage/Punctures/Tears | Several shingles were observed to be punctured. | observation | Observed Conditions | No | — |
| 3 | Asphalt Shingles | Debris | Various types of debris were found on the roof surfaces. | observation | Observed Conditions | Note | Also appears under SBS › Debris (General). Keep separate under each roof type (do not collapse). |
| 4 | Asphalt Shingles | Debris | Animal feces accumulated in a corner. | observation | Observed Conditions | Note | Also appears under SBS › Debris (General). Keep separate. |
| 5 | Asphalt Shingles | Debris | Organic debris was observed throughout. | observation | Observed Conditions | Note | Also appears under SBS › Organic Growth. Keep separate. |
| 6 | Asphalt Shingles | Debris | A build up of general debris has accumulated within the debris strainers, causing blockages. | observation | Observed Conditions | Yes (writing) | Suggestion: “A build-up of general debris has accumulated within the debris strainers, causing blockages.” |
| 7 | Asphalt Shingles | Granular Loss | Granular loss was noted on the asphalt shingles. | observation | Observed Conditions | No | — |
| 8 | Asphalt Shingles | Granular Loss | The asphalt shingles are suffering from severe granule loss. | observation | Observed Conditions | Yes (absolute tone) | Suggestion (optional soften): “The asphalt shingles show severe granule loss.” Keep original if dept. prefers stronger language. |
| 9 | Asphalt Shingles | Gutters | Damaged gutters were noted in multiple areas. | observation | Observed Conditions | Note | Repeated under SBS › Damage and SBS › Gutters. Keep per roof type. |
| 10 | Asphalt Shingles | Gutters | The gutter was damaged. | observation | Observed Conditions | No | — |
| 11 | Asphalt Shingles | Gutters | Debris was noted within some of the gutters. | observation | Observed Conditions | No | — |
| 12 | Asphalt Shingles | Gutters | The loose granules have accumulated within the gutters, causing blockages at the downpipe elbow/s. | observation | Observed Conditions | Yes (writing) | Suggestion: “…downpipe elbow(s).” |
| 13 | Asphalt Shingles | Organic Growth | Organic growth was observed throughout. | observation | Observed Conditions | Note | Also under SBS. Keep separate. |
| 14 | Asphalt Shingles | Organic Growth | Several well-established concentrations of organic growth were seen. | observation | Observed Conditions | No | — |
| 15 | Asphalt Shingles | Organic Growth | The roof is suffering from large pockets of organic growth. | observation | Observed Conditions | Yes (absolute tone) | Optional: “The roof shows large pockets of organic growth.” |
| 16 | Asphalt Shingles | Plumbing Stacks | A settlement cap is missing. The flashing is also too high and needs to be cut down. | mixed_obs_recommendation | Observed Conditions (+ flag recommendation segment) | Yes (split?) | Split suggestion: (1) Obs: “A settlement cap is missing. The flashing sits too high.” (2) Rec: “Flashing needs to be cut down.” Or keep as one mixed leaf under Plumbing Stacks. |
| 17 | Asphalt Shingles | Plumbing Stacks | The 5 in 1 flashing for the plumbing stack is severely degraded. | observation | Observed Conditions | Yes (writing) | Suggestion: “The 5-in-1 flashing for the plumbing stack is severely degraded.” |
| 18 | Asphalt Shingles | Plumbing Stacks | The lead flashing that encapsulates the plumbing stack has degraded and needs replacing. | mixed_obs_recommendation | Observed Conditions (+ flag) | Yes (split?) | Obs: “…has degraded.” Rec: “…needs replacing.” |
| 19 | Asphalt Shingles | Punctures | Multiple punctures were observed throughout the roof areas. | observation | Observed Conditions | Note | Also under SBS › Punctures. Keep separate. Overlaps thematically with Damage/Punctures/Tears. |
| 20 | Asphalt Shingles | Ridge Caps | All the ridge caps are cracked. | observation | Observed Conditions | Yes (absolute) | Suggestion: “All inspected ridge caps are cracked.” or “Ridge caps were observed cracked throughout.” |
| 21 | Asphalt Shingles | Ridge Caps | Several of the ridge caps are cracked. | observation | Observed Conditions | No | — |
| 22 | Asphalt Shingles | Ridge Caps | Several of the ridge caps are either missing or needs to be replaced. | mixed_obs_recommendation | Observed Conditions (+ flag) | Yes (grammar) | Original grammar issue. Suggestion: “Several of the ridge caps are either missing or need to be replaced.” |
| 23 | Asphalt Shingles | Safety | Temporary safety anchors are fixed through the roof surface throughout. | observation | Observed Conditions | No | — |
| 24 | Asphalt Shingles | Safety | A temporary roof anchor has been left. | observation | Observed Conditions | Yes (clarity) | Suggestion: “A temporary roof anchor has been left in place.” |
| 25 | SBS | Alligatoring/Crazing | Crazing or ‘Alligatoring’ is characterized by a pattern of cracks resembling an alligator's skin, caused by the sun's UV rays drying out and damaging the roof's surface. | technical_explanation | Observed Conditions (as category note / non-leaf) OR exclude from photo picker | Yes (role) | Not a photo caption. Prefer store as inactive helper text / category description, not selectable leaf. If imported as leaf, mark inactive for mobile picker. |
| 26 | SBS | Alligatoring/Crazing | Crazing or ‘alligatioring’ was observed throughout. | observation | Observed Conditions | Yes (typo) | Original typo “alligatioring”. Suggestion: “Crazing or ‘alligatoring’ was observed throughout.” |
| 27 | SBS | Blisters | Severe granular loss and minor blisters were observed throughout. | observation | Observed Conditions | Note | Exact duplicate also under SBS › Granular Loss. Import once under each category only if dept. wants both browse paths; else keep under Blisters and reference from Granular Loss. |
| 28 | SBS | BUR vent/Dryer Vent | A dryer/BUR vent was noted to have an additional modified opening on it. This is far below the industry standard of a minimum 8" flood plain/finished roof surface height. | observation | Observed Conditions | Yes (fixed value) | Contains fixed industry claim (8"). Keep as-is pending dept. confirmation of standard wording. |
| 29 | SBS | Damage/Punctures/Tears | The roof has been damaged in multiple locations. | observation | Observed Conditions | No | — |
| 30 | SBS | Damage/Punctures/Tears | Damaged gutters were noted in multiple areas. | observation | Observed Conditions | Yes (category fit) | Same text as Gutters. Suggestion: move/only keep under Gutters; or keep if intentionally listed under Damage too. |
| 31 | SBS | Debris (General) | Various types of debris were found on the roof surfaces. | observation | Observed Conditions | Note | Duplicate of Asphalt › Debris (separate roof-type branch). |
| 32 | SBS | Debris (General) | Animal feces accumulated in a corner. | observation | Observed Conditions | Note | Duplicate of Asphalt › Debris (separate roof-type branch). |
| 33 | SBS | Debris (Organic) | The internal roof drain sumps are packed with organic debris. This impedes water flow. | observation | Observed Conditions | No | — |
| 34 | SBS | Granular Loss | Granular loss was observed on the roof surface throughout. | observation | Observed Conditions | No | — |
| 35 | SBS | Granular Loss | Severe granular loss and minor blisters were observed throughout. | observation | Observed Conditions | Note | Duplicate of SBS › Blisters text. |
| 36 | SBS | Gutters | Damaged gutters were noted in multiple areas. | observation | Observed Conditions | Note | Also Asphalt › Gutters and SBS › Damage. |
| 37 | SBS | Gutters | The gutter was damaged. | observation | Observed Conditions | Note | Also Asphalt › Gutters. |
| 38 | SBS | Gutters | Debris was noted within some of the gutters. | observation | Observed Conditions | Note | Also Asphalt › Gutters. |
| 39 | SBS | Membrane | The membrane was not trimmed back when initially installed. | observation | Observed Conditions | No | — |
| 40 | SBS | Metal Flashings | Several of the metal skirt flashings around the RTU’s are loose or open to water ingress. | observation | Observed Conditions | Yes (writing) | Suggestion: “Several of the metal skirt flashings around the RTUs are loose or open to water ingress.” |
| 41 | SBS | Menzie/Plumbing stack | A settlement cap was observed to be missing from a plumbing stack. | observation | Observed Conditions | No | — |
| 42 | SBS | Menzie/Plumbing stack | All the penetrations require a new layer of liquid membrane and granules. | recommendation | Recommended Actions (proposed) OR Observed Conditions › Recommended Actions | Yes (absolute + not work performed) | Not Work Performed. Absolute “All”. Suggestion: “All inspected penetrations require a new layer of liquid membrane and granules.” |
| 43 | SBS | Menzie/Plumbing stack | A plumbing stack has a cap that is the incorrect size. It can cause moisture to enter the roof system and building. | observation | Observed Conditions | No | — |
| 44 | SBS | Organic Growth | Organic growth was observed throughout. | observation | Observed Conditions | Note | Also Asphalt. |
| 45 | SBS | Organic Growth | Organic debris was observed throughout. | observation | Observed Conditions | Note | Also Asphalt › Debris. |
| 46 | SBS | Organic Growth | Organic debris was observed throughout. Especially at the low spots of the roof. | observation | Observed Conditions | Yes (writing) | Suggestion: “Organic debris was observed throughout, especially at the low spots of the roof.” |
| 47 | SBS | Paving Slabs | There is an excessive amount of paving slabs on the roof areas. | observation | Observed Conditions | No | — |
| 48 | SBS | Paving Slabs | Paving slabs are also surrounding the internal roof drains. | observation | Observed Conditions | No | — |
| 49 | SBS | Paving Slabs | The membrane is unprotected underneath this paving stone. They can become imbedded into the membrane and in some cases cause punctures. | observation | Observed Conditions | Yes (writing) | Suggestion: “…become embedded into the membrane…” |
| 50 | SBS | Paving Slabs | It should be removed, the roof be reviewed, repaired if applicable and a sacrificial sheet of SBS installed underneath. | recommendation | Recommended Actions (proposed) | Yes (not work performed) | Clear recommendation. Do NOT map to Work Performed. |
| 51 | SBS | Ponding Water | Ponding water was observed in several locations. | observation | Observed Conditions | No | — |
| 52 | SBS | Punctures | Multiple punctures were observed throughout the roof areas. | observation | Observed Conditions | Note | Also Asphalt › Punctures. |
| 53 | SBS | Punctures | An open corner was observed at an extraction fan curb. It requires to be repaired. | mixed_obs_recommendation | Split or Observed + Recommended Actions | Yes (split + writing) | Obs: “An open corner was observed at an extraction fan curb.” Rec suggestion: “It requires repair.” / “It needs to be repaired.” |
| 54 | SBS | Rust/Corrosion | Corrosion was observed to be well established on the roof hatch. | observation | Observed Conditions | No | — |
| 55 | SBS | Rust/Corrosion | Solution - It requires to be treated with a rust inhibiting paint. | recommendation | Recommended Actions (proposed) | Yes (writing + not work performed) | Suggestion: “It requires treatment with a rust-inhibiting paint.” Strip “Solution -” prefix or keep as labeled recommendation. |
| 56 | Vinyl Decking | Corners | A few corners are open to water ingress. | observation | Observed Conditions | No | — |
| 57 | Vinyl Decking | Trim | The outer trim was observed to be damaged on approximately 30% of the vinyl decks. | observation | Observed Conditions | Yes (fixed %) | Contains fixed percentage (30%). Keep pending dept. confirmation; may need site-specific editing in Additional Comments. |

## Counts

- Total document phrases/entries mapped: **57**
- By info type: mixed_obs_recommendation=4, observation=49, recommendation=3, technical_explanation=1
- Entries flagged for review (Yes*): **22**
- Work Performed mappings in this document: **0** (no completed-service verbiage present)

## Empty category headings in source

- SBS › **BUR vent/Dryer Vent** — heading present; one phrase follows after blank lines (included above).
- No other empty technical categories with zero phrases.

## Cross-roof duplicates (keep separate branches)

| Text | Appears under |
|------|---------------|
| Various types of debris were found on the roof surfaces. | Asphalt › Debris; SBS › Debris (General) |
| Animal feces accumulated in a corner. | Asphalt › Debris; SBS › Debris (General) |
| Organic debris was observed throughout. | Asphalt › Debris; SBS › Organic Growth |
| Damaged gutters were noted in multiple areas. | Asphalt › Gutters; SBS › Damage; SBS › Gutters |
| The gutter was damaged. | Asphalt › Gutters; SBS › Gutters |
| Debris was noted within some of the gutters. | Asphalt › Gutters; SBS › Gutters |
| Organic growth was observed throughout. | Asphalt › Organic Growth; SBS › Organic Growth |
| Multiple punctures were observed throughout the roof areas. | Asphalt › Punctures; SBS › Punctures |
| Severe granular loss and minor blisters were observed throughout. | SBS › Blisters; SBS › Granular Loss (same roof) |

## Idempotent import plan (for later approval)

1. Target list: `R&M Observed Conditions` (and optionally new `R&M Recommended Actions` if approved).
2. Stable keys: `(list_name, path_of_names…)` e.g. `Observed Conditions / SBS / Paving Slabs / <exact original leaf>`.
3. Upsert by path: create missing nodes; do not rename existing leaves that already have PhotoObservation snapshots.
4. Corrections (grammar/typos) only applied when explicitly approved — otherwise store original text.
5. Never run against production until mapping is signed off; use disposable DB for dry-run.

﻿## Recommendation — third catalog Recommended Actions

### What the document contains
- Mostly **observations** (photo-ready condition statements).
- A few clear **recommendations** (should be removed…, Solution - It requires…, All the penetrations require…).
- Several **mixed** sentences (observation + needs replacing / needs to be repaired).
- One **technical explanation** (alligatoring definition) — not a caption.
- **Zero** phrases that describe work already performed (we installed…, replaced…, sealed…).

### Recommendation for pilot (approve before any import)
**Do not add a third entry_type / mobile picker tab yet.**

Reasons:
1. Mobile today is optimized for two paths: Observed Conditions vs Work Performed.
2. This document does not supply Work Performed content; a third tab with only a handful of items adds taps without finishing the work-report story.
3. Form Custom Lists already support hierarchy: place **Recommended Actions** under each roof type **inside** `R&M Observed Conditions` without schema/API changes.

**Phase 1 (this import, after approval):**
- Import observations into `R&M Observed Conditions` as `Roof type → Category → Phrase`.
- Map pure recommendations under `Roof type → Recommended Actions → Phrase` (still Observed Conditions) **or** keep under their technical category — your call on flagged rows.
- Leave `R&M Work Performed` empty until R&M provides completion verbiage.
- Mark the alligatoring definition as **inactive** (or category description only) so it does not appear in mobile phrase search.

**Phase 2 (only if reports/AI need hard separation):**
- Add catalog `R&M Recommended Actions` + `entry_type=recommended_action`.
- Small API/UI/mobile change: third classify segment.
- Not required to ship this first phrase pack.

### UI / API adaptations for Phase 1
| Area | Needed? |
|------|---------|
| New Form Custom List domain | No |
| New entry_type / PhotoObservation column | No |
| Mobile classify UI (third button) | No |
| Web Fieldwork photo UI | No |
| Import script (idempotent upsert by path) | Yes — after mapping approval |
| Inactive flag on explanation leaf | Yes (already supported) |

### UI / API if a true third catalog is required now
- `form_engine`: new entry constant + list name
- `fieldwork_phrases`: seed third list
- Photo create/patch/submit: accept new entry_type
- Mobile + web + Files classify modal: third option
- More taps unless defaults by report kind

### Decisions to approve
1. Hierarchy `Roof type → Category → Phrase` under Observed Conditions — yes/no
2. Cross-roof duplicate text: keep separate branches — yes/no
3. Recommendations: nest in Observed Conditions now vs third catalog now — choose
4. Apply grammar/typo suggestions — which rows
5. Alligatoring definition: inactive / exclude — choose
6. Absolute wording (All the…, suffering from…) — keep vs soften — choose
