## Recommendation — third catalog Recommended Actions

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
