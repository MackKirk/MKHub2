<!--
  MKHub changelog — edit this file only (no code changes needed for new releases).

  How to add a release:
  1. Copy the TEMPLATE block at the bottom of this file (inside the second HTML comment).
  2. Paste it at the top of this file, directly below this comment (newest releases always go first).
  3. Fill in id, date, title (optional), and bullet lists under each ### heading.

  Rules:
  - id: unique string per release (e.g. 2026-04-17-1). Used for the “new” badge in the browser.
  - date: use YYYY-MM-DD.
  - Keep section headings exactly: ### New / ### Improved / ### Fixed / ### Known issues
-->

<<<RELEASE>>>
id: 2026-04-20-1
date: 2026-04-20
title: Update 1.1.026 - Week 17

### New
- New Form Templates and For Custom Lists areas.
- New Safety Tab inside Projects, allowing to create Inspections from created Form Templates.
- Corporate cards: inventory (last four + expiry), custody assign/return, PCI-safe fields only.
- Company assets area in the sidebar (equipment + corporate cards), split from Fleet.
- **System settings → Lookup lists:** a **Training matrix slots** list. You can rename columns, add or remove them, and pick whether each column treats the cell as **expiry**, **date taken**, or **plain text**.

### Improved
- Header bar: shortcuts grouped in one toolbar (What’s new, notifications, report bug) with consistent icon buttons;
- Global search field styling aligned with the top bar.
- What’s new opens as a large centered modal (backdrop, larger content area, close button, Escape to close) instead of a small dropdown.
- Corporate card detail page: clearer layout, Details/Custody tabs, header card preview.
- Corporate cards list: filters, search, sorting, custody filters, and table layout aligned with the Equipment list.
- Equipment detail: title bar, tabs, typography, and primary/secondary buttons aligned with the rest of the app (e.g. Projects/Opportunities).
- Corporate cards: **Mark cancelled** sends a status update (`PATCH`, no longer uses `DELETE`). Administrators see **Delete card** to remove the record permanently (with confirmation). Equipment detail: administrators see **Delete equipment** to retire the item (with confirmation).
- API: `DELETE /company-credit-cards/:id` permanently removes the row and is **administrator-only** (use `PATCH` with `status: cancelled` to cancel). Equipment: `DELETE /fleet/equipment/:id` **retires** the item (`equipment:write`). **`POST /fleet/equipment/:id/purge`** removes the row from the database (and linked work orders) — **administrators only**.
- The HR training matrix table, CSV download, and training dropdowns on user profiles now use that same list—what you save in settings is what everyone sees.

### Fixed
- (none this release)

### Known issues
- (none this release)

<<<RELEASE>>>
id: 2026-04-17-1
date: 2026-04-17
title: Update 1.1.025 - Week 16

### New
- News panel in the header with product updates (next to notifications).
- Drag-and-drop folder trees from Windows Explorer into project file categories.
- “Add new contact” button, to new opportunity without leaving the page.
- Quick filters in the Opportunities and Projects lists.
- Chat is now working

### Improved
- Creating subfolders while browsing inside a folder now keeps the correct parent.
- Proposal/quote section images save at higher resolution (sharper PDFs; click image to view larger).

### Fixed
- (none this release)

### Known issues
- (none this release)

<<<RELEASE>>>
id: 2026-04-01-1
date: 2026-04-01
title: Earlier updates

### New
- Safety area with site Inspection

### Improved

### Fixed

### Known issues

<!--
  TEMPLATE — copy everything from the next line through the last line of this block, then paste above.

<<<RELEASE>>>
id: YYYY-MM-DD-N
date: YYYY-MM-DD
title:

### New
-

### Improved
-

### Fixed
-

### Known issues
-

-->
