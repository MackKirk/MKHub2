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
id: 2026-08-18-1
date: 2026-08-18
title: Update 1.1.045 - Week 34

### New
- Files: select several files and download them together as a ZIP (one file still downloads normally).

### Improved
- Onboarding: categories at the top show where information is missing; Go to the Hub opens that step and highlights the empty fields.
- Proposal PDF image captions can use up to three lines instead of two.
- Login: after several failed attempts, Sign in waits before the next try (helps against password stuffing).

### Fixed
- Login no longer stacks error toasts or sends a flood of requests when the Sign in button is clicked repeatedly.
- After filling a missing onboarding field, Go to the Hub goes to the Hub instead of bouncing to Emergency Contacts.
- Project Files: Download saves the image instead of opening it in a new tab.

### Known issues
- (none this release)

<<<RELEASE>>>
id: 2026-08-14-1
date: 2026-08-14
title: Update 1.1.044 - Week 33

### New
- Project/opportunity Notes from email via Microsoft 365 (`notes@…` + Power Automate → Hub webhook) when subject has `MK-#####`.
- Inbound email notes render as sanitized HTML (Outlook-like); manual notes stay plain text.

### Improved

### Fixed

### Known issues

===

### New
- Fuel cards under Company Assets, with assign and return custody.
- Picture Key on proposals (optional legend on the PDF).
- Phone extension on contacts.

### Improved
- Fuel card custody: crew, reasons, and attachments.
- Mobile clock and tasks screens.
- Project access now follows section permissions.
- Users list: quick filters (Active, Inactive, Admins) and custom filters like Projects.
- Training matrix hides inactive and terminated employees.
- User permissions: Production and Repairs now show a top **Projects & Opportunities** row (View only / View · Edit) so create and edit can be set without relying on legacy keys.

### Fixed
- User Docs: Upload File modal (and file picker) now accept PDF and the same file types as drag-and-drop onto the list.
- Customer logo upload no longer shows a false error, and the new image appears without a page refresh.
- Orange line under images removed from proposal PDFs.
- Login shows an error for wrong credentials or a deactivated account.
- Login screen layout (split panel, remember me, simpler copy).
- Login on mobile: compact header so the form is not hidden by the keyboard.
- Users with Repairs (or Production) edit permission can create opportunities and edit project status again; project detail no longer checks only the old shared write key.

### Known issues
- (none this release)

<<<RELEASE>>>
id: 2026-08-07-1
date: 2026-08-07
title: Update 1.1.042 - Week 32

### New
- Option to show unit price on proposal PDF pricing lines.
- Map / address lookup when setting a project location.

### Improved
- Document Creator: page backgrounds, types, and image handling.
- Onboarding documents and attendance.

### Fixed
- (none this release)

### Known issues
- (none this release)

<<<RELEASE>>>
id: 2026-07-31-1
date: 2026-07-31
title: Update 1.1.041 - Week 31

### New
- Project warranties.

### Improved
- Print shop requests can be edited after create (including date).
- Document editing and images.

### Fixed
- Print shop supply files open and download correctly.

### Known issues
- (none this release)

<<<RELEASE>>>
id: 2026-07-24-1
date: 2026-07-24
title: Update 1.1.040 - Week 30

### New
- Print shop requests.
- Project number on projects.
- Calendar on the Hub home.

### Improved
- Asset lists in System Settings.
- Navigation and page layout.

### Fixed
- (none this release)

### Known issues
- (none this release)

<<<RELEASE>>>
id: 2026-07-17-1
date: 2026-07-17
title: Update 1.1.039 - Week 29

### New
- Preview PDF and Office files without downloading.
- User activity log with export.

### Improved
- Project files layout and file notes.
- Fleet and work order permissions.
- Estimates and product handling.
- Proposal totals.

### Fixed
- (none this release)

### Known issues
- (none this release)

<<<RELEASE>>>
id: 2026-07-10-1
date: 2026-07-10
title: Update 1.1.038 - Week 28

### New
- More detailed permissions for inventory, fleet, company assets, and HR.

### Improved
- Offboarding: hub access and delete cases.
- Project reports and status.
- Files: grid and list view.
- Reviews import and cycle display.

### Fixed
- Review cycle scope and supervisor counts.

### Known issues
- (none this release)

<<<RELEASE>>>
id: 2026-07-03-1
date: 2026-07-03
title: Update 1.1.037 - Week 27

### New
- Field brief on projects.
- Notes on clock-in shifts.

### Improved
- Project address and division sorting.
- Billing snapshot on projects and clients.
- File notes on project files.
- Mobile app store listing.

### Fixed
- (none this release)

### Known issues
- (none this release)

<<<RELEASE>>>
id: 2026-06-26-1
date: 2026-06-26
title: Update 1.1.036 - Week 26

### New
- HR offboarding.

### Improved
- Business lines and project divisions.
- Certificates and PDF generation.
- Company files tab.
- Customer permissions.

### Fixed
- (none this release)

### Known issues
- (none this release)

<<<RELEASE>>>
id: 2026-06-12-1
date: 2026-06-12
title: Update 1.1.035 - Week 24

### New
- Permits on the employee profile.

### Improved
- Company files: recycle bin for client documents.
- Who can open client files.
- Equipment status and fleet.
- Education records on the profile.

### Fixed
- (none this release)

### Known issues
- (none this release)

<<<RELEASE>>>
id: 2026-06-05-1
date: 2026-06-05
title: Update 1.1.034 - Week 23

### New
- Company credit cards: assign and return.
- Fleet asset compliance.

### Improved
- Document Creator: sticky toolbar and inline editing.
- Project document and safety permissions.

### Fixed
- (none this release)

### Known issues
- (none this release)

<<<RELEASE>>>
id: 2026-05-29-1
date: 2026-05-29
title: Update 1.1.033 - Week 22

### New
- Customer insights.
- Company locations.

### Improved
- Edit customer, contact, and site in cleaner forms.
- Search inside filters.
- Timesheets and user reports (sort and delete).
- Suppliers.

### Fixed
- (none this release)

### Known issues
- (none this release)

<<<RELEASE>>>
id: 2026-05-22-1
date: 2026-05-22
title: Update 1.1.031 - Week 21

### New
- Project members and who can see a project.
- Report category permissions on projects.

### Improved
- Clock in/out job selection.
- Community and schedule.
- Subcontractor companies.
- Customer permissions.

### Fixed
- (none this release)

### Known issues
- (none this release)

<<<RELEASE>>>
id: 2026-05-15-1
date: 2026-05-15
title: Update 1.1.030 - Week 20

### New
- Subcontractor companies.

### Improved
- Document Creator: fill project info automatically.
- Training and attendance.
- Import older reviews on employee profiles.

### Fixed
- (none this release)

### Known issues
- (none this release)

<<<RELEASE>>>
id: 2026-05-07-1
date: 2026-05-07
title: Update 1.1.029

### New
- Reviews → My reviews → Director meeting: if HR cancels your slot, you see a short banner to book again; HR can add a message you can read there.
- HR → Director meetings (book tab): after you pick a free time, you choose which colleague that booking is for (new booking vs reschedule).

### Improved
- Director meeting calendar: the number on each day is how many openings are still free; a day turns red when it is fully booked.
- My reviews → Director meeting: other people’s bookings show simply as “Booked” (no names).
- Review cycle (open a cycle): top of the page matches the cleaner style used elsewhere; back button works like on user pages; less clutter in the header.
- Human Resources → Reviews: removed the extra “Admin” item from the side menu (same tools stay available where you already use them).

### Fixed
- Fewer mix-ups with director meeting times and who a slot belongs to, including older saved data.

### Known issues
- (none this release)

<<<RELEASE>>>
id: 2026-05-06-1
date: 2026-05-06
title: Update 1.1.028 - Week 19

### New
- Human Resources → Community: a hub with an Overview (shortcuts to create announcements, open Groups, and open Insights) and a My announcements tab for posts you authored, with filters and management actions.
- Community groups: create groups, manage members, and adjust details from the Groups area.
- Community insights: engagement and activity metrics for a selected date range, with export where available.
- Create and edit announcements using a dedicated composer: rich-text body with formatting and @mentions, optional preview before publishing, multiple file attachments, audience targeting, priority and related topic area, optional read confirmation, and publishing as send now, schedule for a date and time, or save as draft, with a warning if you try to leave with unsaved changes.
- When reading posts: comments and likes where enabled; attachments when authors include files; read confirmations when required.
- Document Creator: edit by scrolling vertically through stacked page previews; the active page stays in sync with the pages strip and editing tools.

### Improved
- Community Overview uses a cleaner, more consistent layout for shortcuts and navigation.
- Creating an announcement is highlighted as the primary shortcut alongside Groups and Insights; community headers and spacing match other HR pages more closely.
- Document Creator: stronger, easier-to-see selection outlines on canvas elements.
- Document Creator: PDF export tracks the on-screen preview more reliably (font scale reference, text metrics, padding so headers and body text line up better).
- Document Creator: image placeholders on the canvas use higher-resolution assets so photos look sharper while editing.
- Document Creator + image picker (project flow): confirming an image sizes the new frame to the exported photo’s aspect ratio so it lands undistorted; you can still stretch or shrink width and height independently afterward.

### Fixed
- Document Creator: Undo after moving elements restores the previous position correctly (drag history no longer merges with other steps).
- Document Creator: with multiple elements selected, Ctrl+C / Ctrl+V copies and pastes the whole selection (not only a single item).

### Known issues
- (none this release)

<<<RELEASE>>>
id: 2026-04-29-1
date: 2026-04-29
title: Update 1.1.027 - Week 18

### New
- On a vehicle’s page, you can see an activity history of what changed over time.
- Work orders for fleet and equipment: you can start and finish service more clearly, see an activity list on the order, and admins can reopen some closed orders when needed.
- On equipment, a Work orders section to view and create orders for that item.
- Fleet schedule: calendar of service and inspections, with buttons to plan a new inspection or work order.
- Vehicle list: filters (like on Opportunities) so you can narrow the list more easily.
- Training certificates: layout editor (logo position/size, content margins, text sizes, spacing, signature left/right inset) with defaults tuned for the corporate background; reset layout control.
- Live certificate preview uses the real PDF engine via an unsaved-payload render endpoint so what you adjust matches the exported PDF; optional “final PDF” preview mode.
- Certificate validity can be set to never expire (no fixed day count).
- Course editor 'Setup' tab redesigned (clear sections, Udemy-style landing context, duration field with minutes suffix).
- Human Resources → Overview: dashboard with summary cards and a list of active employees missing key org data (supervisor, department, project divisions, job title), with links to each user.

### Improved
- Fleet area reworked with better performance and usability.
- Service 'calendar' is easier to read (vehicle name and unit).
- Certificate backgrounds come from 'System Settings' library presets.
- Larger organization logo on generated certificates; signatures show instructor/participant names without extra redundant labels; cleaner signature block vs artwork.
- Instructor and participant names on certificates resolved automatically from course/completion context where applicable.
- PDF viewer embedded preview: fit-to-page, hides thumbnails/toolbars via viewer params; iframe sizing improves edge cropping in live preview.
- Requirements tab: searchable lists with checkboxes and removable chips for roles, divisions, and users.
- Publication status: Draft / Published controls and a status badge moved to the 'top course header' (visible on every tab); removed duplicate block from Setup.
- Navigation: 'My Training' is now the first item under 'Personal' in the sidebar; it was removed from the Training & Learning group to avoid a duplicate link (certificates and admin remain there).
- User profile (HR): 'Record audit' shows the last automatic profile change (who/when), separate from 'Last Update Sync (Bamboo files)'. Saving profile, departments, or account fields as HR/admin now updates that audit trail on the employee profile.

### Fixed
- Photos and documents on vehicles save more reliably.
- Side menu and search lists inside pop-up windows behave more predictably.
- Date* on your profile’s assets tab show on the correct day.
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
