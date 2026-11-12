# Fieldwork R&M Pilot Checklist

Manual validation for a real pilot with the R&M department. Use **approved phrase library content** from the department — do not invent production technical phrases.

**Environment reality:** MKHub has no Staging. The pilot runs on production (`db_mkhub` + Render app) after a normal deploy. See `docs/fieldwork_single_env_deploy_readiness.md` for backup, permissions, and rollback.

## Roles

| Role | Tool | Focus |
|------|------|--------|
| Technician | Mobile | Capture, classify, submit |
| Office reviewer | Web | Review, request changes, approve |
| Observer (optional) | Both | Count taps / time-to-classify |

## Data setup (before pilot day)

- [ ] R&M Opportunity + Project available (or convert after Site Assessment)
- [ ] Active Site Assessment template
- [ ] Active Work Report template with `require_final_comments = true`
- [ ] Phrase catalogs populated with **department-approved** Observed Conditions + Work Performed items
- [ ] Technician has fieldwork **write**; office user has fieldwork **review**
- [ ] Files categories include Proposal Photos / Invoice Photos

## Technician — Site Assessment (Opportunity)

- [ ] Open Opportunity → Fieldwork → create Site Assessment
- [ ] Fill required template fields
- [ ] Capture **5–8** photos; classify each (Observed vs Work Performed as applicable)
- [ ] Confirm last-used phrase / batch classify saves taps
- [ ] Save draft; force-close app; reopen and confirm draft + pending photos recover
- [ ] Submit Site Assessment
- [ ] Note time from first photo to submit: _____ min · taps estimate: _____

## Convert Opportunity → Project

- [ ] Convert to Project on web
- [ ] Confirm Site Assessment still listed with same photos
- [ ] Confirm Proposal Photos still show the same images in Files (no duplicates)

## Technician — Work Report (Project)

- [ ] Create Work Report
- [ ] Add **10–15** photos total across the pilot (combine with Site Assessment set)
- [ ] Mix Observed Conditions and Work Performed
- [ ] Classify individually and at least one batch of 3+
- [ ] Fill **Additional / Final comments** (required)
- [ ] Attempt submit with one upload still pending → must block
- [ ] Finish uploads → submit for review

## Office — Review cycle

- [ ] Web Fieldwork tab shows **Pending review**
- [ ] Open report; review photos, phrases, comments
- [ ] Request changes with a clear note
- [ ] Technician corrects and resubmits
- [ ] Approve
- [ ] Confirm approved report is read-only
- [ ] Create revision → new draft version appears; prior marked superseded

## Files — Needs Classification

- [ ] Upload one image directly into Invoice Photos (Files tab)
- [ ] See **Needs Classification** in **list and grid**
- [ ] Classify via modal → link to editable Work Report
- [ ] Confirm same FileObject (no duplicate bytes / library row)
- [ ] After approval, attempt delete/move from Files → blocked with clear message

## Usability notes (fill during pilot)

- Steps that felt slow: _______________________
- Phrase search quality: _______________________
- Correction flow clarity: _______________________
- Would pilot again with larger crew? Y / N

## Explicit non-goals this pilot

- AI report / invoice generation
- Construction line
- Full offline mode
- Mobile administrative approve
