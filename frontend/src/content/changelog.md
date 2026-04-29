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
id: 2026-04-29-1
date: 2026-04-29
title: Update 1.1.027 - Week 18

### New
- On a **vehicle’s page**, you can see an **activity history** of what changed over time.
- **Work orders** for fleet and equipment: you can **start** and **finish** service more clearly, see an **activity** list on the order, and admins can **reopen** some closed orders when needed.
- On **equipment**, a **Work orders** section to view and create orders for that item.
- **Fleet schedule**: calendar of service and inspections, with buttons to plan a new inspection or work order.
- **Vehicle list**: filters (like on Opportunities) so you can narrow the list more easily.
- Training certificates: layout editor (logo position/size, content margins, text sizes, spacing, signature left/right inset) with defaults tuned for the corporate background; reset layout control.
- Live certificate preview uses the real PDF engine via an unsaved-payload render endpoint so what you adjust matches the exported PDF; optional “final PDF” preview mode.
- Certificate validity can be set to never expire (no fixed day count).
- Course editor **Setup** tab redesigned (clear sections, Udemy-style landing context, duration field with minutes suffix).

### Improved
- Service **calendar** is easier to read (vehicle name and unit).
- **Who can use Fleet** is clearer in your profile permissions (vehicles vs equipment).
- Certificate backgrounds come only from **System Settings** library presets (legacy bundled course backgrounds removed).
- Larger organization logo on generated certificates; signatures show instructor/participant names without extra redundant labels; cleaner signature block vs artwork.
- Instructor and participant names on certificates resolved automatically from course/completion context where applicable.
- PDF viewer embedded preview: fit-to-page, hides thumbnails/toolbars via viewer params; iframe sizing improves edge cropping in live preview.
- **Requirements** tab: searchable lists with checkboxes and removable chips for roles, divisions, and users.
- **Publication** status: Draft / Published controls and a status badge moved to the **top course header** (visible on every tab); removed duplicate block from Setup.
- **Navigation**: **My Training** is now the first item under **Personal** in the sidebar; it was removed from the Training & Learning group to avoid a duplicate link (certificates and admin remain there).

### Fixed
- **Photos and documents** on vehicles save more reliably.
- **Side menu** and **search lists inside pop-up windows** behave more predictably.
- **Dates** on your profile’s assets tab show on the correct day.
- Saving a course draft no longer dropped the selected certificate background back to a default (library selection persists).
- Reduced mismatch between certificate preview and generated PDF (scaling, spacing, title/body gap behavior).

### Known issues
- (none this release)

<<<RELEASE>>>
id: 2026-04-20-1
date: 2026-04-20
title: Update 1.1.026 - Week 17

### New
- New Form Templates and For Custom Lists areas.
- New Safety Tab inside Projects, allowing to create Inspections from created Form Templates.
- Corporate cards: inventory, custody assign/return.
- Company assets area in the sidebar (equipment + corporate cards), split from Fleet.
- Training Matrix.
- Repairs & Maintenance: New Leak Investigation tab. These investigations can be related to an Opportunity or a Project, but they run independently.

### Improved
- Header bar: shortcuts grouped in one toolbar (What’s new, notifications, report bug) with consistent icon buttons;
- Global search field styling aligned with the top bar.
- What’s new opens as a large centered modal (backdrop, larger content area, close button, Escape to close) instead of a small dropdown.
- Equipment detail design improved.
- Dynamic safety forms: comment and Y/N photo attachments use safer state updates so fast paste or multiple uploads merge with the latest image list instead of dropping or overwriting IDs.

### Fixed
- File upload (upload proxy): each upload gets a unique storage key so repeated pastes or duplicate names no longer overwrite earlier blobs.

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
