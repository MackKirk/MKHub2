# Fieldwork vs Project closure states

**Business decision (not automated):** pending technical photos in Files do **not** automatically block Project Completed. Whether they should is a product policy choice for a later phase.

## Distinct states

| State | Meaning | System behavior today |
|-------|---------|------------------------|
| **Files — Needs Classification** | Image sits in an R&M technical folder (e.g. Invoice / Proposal Photos) without a PhotoObservation | Badge in Files list + grid; Classify opens Fieldwork phrase modal. Does **not** block general uploads or Project status changes. |
| **Photo classified in a Field Report** | PhotoObservation links FileObject → ClientFile → record with server phrase snapshot | Same bytes in Files and Fieldwork; Files shows derived phrase (read-only). |
| **Field Report Submitted** | Locked for technician edits; awaiting office review | Pending review badge; Files evidence protected from delete/move. |
| **Field Report Approved** | Immutable evidence for that version | Delete/move from Files blocked; edit requires creating a revision. |
| **Project Completed** | Project lifecycle status (unrelated Fieldwork gate) | **No** automatic Fieldwork or Needs Classification gate in PR6. |

## Guidance for R&M

- Treat **Approved Field Reports** as the operational “done” for technical documentation of a visit.
- Treat **Needs Classification** as a Files hygiene queue for the office/technician — not a project close-out hard stop unless leadership later decides otherwise.
- Completing a Project while Files still shows Needs Classification is allowed by software; teams may still enforce a soft checklist in the pilot.
