"""Canonical markdown seeds for in-app tutorials (admin DB overrides merge on top)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Optional


@dataclass(frozen=True)
class SeedSection:
    id: str
    title: str
    body_md: str
    allows_media: bool
    sort_order: int


OPPORTUNITIES_LIST_ID = "opportunities.list"

_OPPORTUNITIES_SECTIONS: List[SeedSection] = [
    SeedSection(
        id="what-it-is",
        title="What an Opportunity is",
        body_md=(
            "An Opportunity is a bid or quote still in the sales pipeline — before it becomes a live project. "
            "Construction and Repairs & Maintenance each have their own Opportunities list; the workflow is the same.\n\n"
            "- Use Opportunities to track work you are pricing or waiting on a customer decision.\n"
            "- When the job is awarded, convert it to a Project from the detail page — same record, now ready for execution.\n"
            "- Do not convert from the list; open the opportunity and use **Convert to Project**."
        ),
        allows_media=False,
        sort_order=10,
    ),
    SeedSection(
        id="create",
        title="Create an Opportunity",
        body_md=(
            "From the Opportunities list, open **New Opportunity** (write access required). Creation is two steps.\n\n"
            "1. **Basics** — name, owner customer, and site (pick an existing site or use the customer address).\n"
            "2. **Setup** — add at least one project division to submit. Estimator, contact, related customers, and cover are optional here.\n\n"
            "New opportunities start in **Prospecting**. You can assign an estimator later, but you will need one before convert."
        ),
        allows_media=True,
        sort_order=20,
    ),
    SeedSection(
        id="fill-record",
        title="Fill the record before you bid",
        body_md=(
            "Open the opportunity and complete the hero fields early. Gaps show as “pending data” on list cards and "
            "block convert until fixed.\n\n"
            "**You’ll need before convert:**\n\n"
            "- Name\n"
            "- Site\n"
            "- At least one estimator\n"
            "- At least one project division\n\n"
            "Also set lead source and related customers when they apply — related customers are marked awarded or not during convert."
        ),
        allows_media=True,
        sort_order=30,
    ),
    SeedSection(
        id="work",
        title="Work the opportunity",
        body_md=(
            "These tabs are how you work the opportunity after the record exists. You will not need every one on every bid.\n\n"
            "- **Notes/History** — the written record: customer conversations, site notes, and financial adjustments that are not a pricing line. Create them with **New Note**.\n"
            "- **Dispatch** — who is scheduled, and when. Create a shift per worker and date before anyone records time.\n"
            "- **Timesheet** — hours worked against those shifts. Clock in and clock out here; it does not create the schedule.\n"
            "- **Files** — uploads for this opportunity (plans, photos, scans). Put them in a category so the team can find them without opening a note.\n"
            "- **Documents** — paperwork the system builds from a template, then exports to PDF. Use this when you do not already have the file.\n"
            "- **Pricing** — the prices and optional services on the bid. Edit while status is **Prospecting**. These are the lines you accept or reject at convert.\n"
            "- **Costs** — the internal estimate (products, labour, shop, sub-contractors, miscellaneous), separate from the customer price. Also editable in **Prospecting**.\n\n"
            "Leaving **Pricing** or **Costs** with unsaved edits asks you to save or discard before you switch tabs."
        ),
        allows_media=True,
        sort_order=40,
    ),
    SeedSection(
        id="work-notes",
        title="Notes / History",
        body_md=(
            "**Notes/History** is the written record on this opportunity: customer conversations, site observations, and money adjustments that are not a pricing line. "
            "A status change can also land here as a note.\n\n"
            "**Create a note**\n\n"
            "1. Open **Notes/History** and choose **New Note**.\n"
            "2. Enter a **title** and a **description**. Both are required.\n"
            "3. Pick a **category**. Categories are grouped as Commercial, Production / Execution, and Financial.\n"
            "4. Attach files only when the note needs them.\n"
            "5. Save. The note appears in the list; select it to read or edit it.\n\n"
            "**Particulars**\n\n"
            "- Use **Commercial** while you are still bidding (calls, scope clarifications, customer decisions).\n"
            "- **Production / Execution** is for how the work will be done on site. Prefer it once the job is moving, not as a substitute for the proposal.\n"
            "- **Financial** notes such as additional income or expense require a value. They update the opportunity’s values; they do not replace Pricing lines.\n"
            "- You only see and create categories your access allows. The filter above the list narrows by category.\n"
            "- Notes created from an inbound email show up in this same list."
        ),
        allows_media=True,
        sort_order=41,
    ),
    SeedSection(
        id="work-dispatch",
        title="Dispatch",
        body_md=(
            "**Dispatch** schedules who will be on this job and when. Timesheet later records hours against these shifts, so create the shifts before anyone clocks in.\n\n"
            "**Create shifts**\n\n"
            "1. Open **Dispatch** and start **Create Shift**.\n"
            "2. Select one or more **workers**.\n"
            "3. Choose **Single Date** or **Date Range**. On a range, turn on **Exclude weekends** when Saturday and Sunday should be skipped.\n"
            "4. Set the time of day: **All day**, **Morning**, **Afternoon**, **Evening**, or **Custom** start and end.\n"
            "5. Optionally set a **job type**.\n"
            "6. If a division still has no on-site lead, you can turn on **Also assign as on-site lead**. That only fills empty slots; it never replaces a lead already set.\n"
            "7. Create. The button shows how many shifts will be saved (one per worker per date). The calendar refreshes.\n\n"
            "**Particulars**\n\n"
            "- Overlapping times for the same worker show a warning and still save.\n"
            "- To change a shift, open it. Worker and date stay fixed; you can change time of day, job type, and notes.\n"
            "- Dispatch is available on the opportunity, not only after convert. Use it when you already know the crew."
        ),
        allows_media=True,
        sort_order=42,
    ),
    SeedSection(
        id="work-timesheet",
        title="Timesheet",
        body_md=(
            "**Timesheet** records hours worked against shifts from Dispatch. It does not create the schedule — if a person is missing, add their shift on **Dispatch** first.\n\n"
            "**Record time**\n\n"
            "1. Open **Timesheet** and find the worker’s shift for that day.\n"
            "2. **Clock in** when the shift starts.\n"
            "3. **Clock out** when it ends. Clock-out must be after clock-in.\n"
            "4. On clock-out you can enter a break. The break cannot be as long as the whole attendance.\n"
            "5. Confirm the time. The row shows clock-in and clock-out, or that the person has not clocked in yet.\n\n"
            "**Particulars**\n\n"
            "- Clocking yourself in or out on the shift’s own day usually does not need a written reason.\n"
            "- Clocking **someone else** in or out requires a reason of at least 15 characters. Admins, supervisors, and on-site leads can do this.\n"
            "- If the shift has a geofence, the screen tells you whether you are at the site. Without a geofence, location is captured but not required.\n"
            "- Some entries approve immediately; others are submitted for approval, depending on who entered them.\n"
            "- A rejected clock-in or clock-out can be entered again.\n\n"
            "**Subcontractor clock-in**\n\n"
            "Subcontractor workers do not use Dispatch shifts. On **Timesheet**, use **Subcontractor Clock-In/Out**.\n\n"
            "1. Open **Subcontractor Clock-In/Out**.\n"
            "2. Scan the worker’s QR badge, or paste the token or the full scan URL and choose **Look up**.\n"
            "3. Review the worker and company. Add a signature if you want — it is optional on clock-in — then **Clock In**.\n"
            "4. To clock out later, open the same button, scan the badge again, confirm that the recorded hours are accurate, add the required signature, and **Clock Out**.\n\n"
            "- An inactive worker, or a worker whose subcontractor company is inactive, cannot clock in.\n"
            "- If they are still clocked in on another project, clock them out there first. This project will not start a second open session.\n"
            "- Clock-out stays unavailable until the hours confirmation is checked and a signature is saved."
        ),
        allows_media=True,
        sort_order=43,
    ),
    SeedSection(
        id="work-files",
        title="Files",
        body_md=(
            "**Files** is the library of uploads for this opportunity: plans, photos, submittals, signed scans, and anything else you received. "
            "It is not the customer proposal and not a generated document.\n\n"
            "**Add files**\n\n"
            "1. Open **Files** and select the category the files belong in. Pick one category — not **All files**.\n"
            "2. Upload from the upload area, or drag files from your computer onto the category or the file list.\n"
            "3. You can also drag a folder, or several folders. The system creates that same folder tree here and puts each file in the matching folder, including nested folders. Empty folders in the drop are created too.\n"
            "4. Wait until the upload finishes. Progress shows while files are sent.\n\n"
            "**Particulars**\n\n"
            "- Dropping onto a folder inside the category builds the new tree inside that folder.\n"
            "- If a folder with the same name already exists in that place, the drop uses it instead of making a second one.\n"
            "- You can still move a file later if it landed in the wrong category.\n"
            "- Attachments on a note stay with that note. Use Files for documents the whole team should find without opening a note."
        ),
        allows_media=True,
        sort_order=44,
    ),
    SeedSection(
        id="work-documents",
        title="Documents",
        body_md=(
            "**Documents** builds a page from a template and exports it to PDF. "
            "Use it to assemble something for this opportunity — an **estimate**, a **report**, a letter, a form, or another composed document. "
            "Use **Files** when you already have the file.\n\n"
            "**Create a document**\n\n"
            "1. Open **Documents** and start a new document.\n"
            "2. Choose the document type or template.\n"
            "3. Edit the pages, then save.\n"
            "4. Use **Export PDF** when you need a file to send or store.\n\n"
            "**Particulars**\n\n"
            "- The document stays on this opportunity, so the next person opens the same record instead of a loose file.\n"
            "- Exporting does not replace the editable document. You can change the pages and export again.\n\n"
            "For how the builder itself works — templates, pages, and export — open the [Document builder tutorial](/tutorials/documents.builder)."
        ),
        allows_media=True,
        sort_order=45,
    ),
    SeedSection(
        id="work-proposal",
        title="Proposal",
        body_md=(
            "**Proposal** is the customer-facing bid: general information, sections, pricing, optional services, and terms. "
            "**Pricing** is a narrower view of the same engine. Edit the story of the bid here; use Pricing when you only need the numbers.\n\n"
            "**Build the proposal**\n\n"
            "1. Open **Proposal** while the opportunity is in **Prospecting**.\n"
            "2. Complete general information, then the sections the customer should read.\n"
            "3. Add pricing lines and optional services that belong on the customer document.\n"
            "4. Set terms.\n"
            "5. Save before you leave the tab.\n\n"
            "**Particulars**\n\n"
            "- Editing locks when status is no longer Prospecting (for example after **Sent to Customer**). Change the status back only when you truly need to revise the bid.\n"
            "- A later revision can be a **change order**. An approved change order cannot be edited.\n"
            "- Unsaved edits block the tab change until you save or discard them."
        ),
        allows_media=True,
        sort_order=46,
    ),
    SeedSection(
        id="work-pricing",
        title="Pricing",
        body_md=(
            "**Pricing** is the numbers view of the proposal: pricing items and optional services, without walking the full customer document. "
            "What you approve here is what **Convert to Project** asks you to accept or reject.\n\n"
            "**Work the prices**\n\n"
            "1. Open **Pricing** while status is **Prospecting**.\n"
            "2. Add or adjust pricing lines and optional services.\n"
            "3. Save before leaving the tab.\n\n"
            "**Particulars**\n\n"
            "- Pricing and Proposal share one bid. A line you add in one place is the same line in the other.\n"
            "- The same Prospecting lock applies. After the bid is sent, this tab is read-only until status allows edits again.\n"
            "- Unapproved pricing at convert can drop divisions. Settle the lines you intend to award before you convert."
        ),
        allows_media=True,
        sort_order=47,
    ),
    SeedSection(
        id="work-costs",
        title="Costs",
        body_md=(
            "**Costs** is the internal estimate: what the job costs you, not the price the customer sees. "
            "You need access to this tab. It is separate from Pricing.\n\n"
            "**Build the estimate**\n\n"
            "1. Open **Costs** while the opportunity is still in **Prospecting** (also blocked for Sent to Customer, Refused, and Cancelled).\n"
            "2. Add cost lines by type: products from the catalog, labour, shop or fabrication, sub-contractors, and miscellaneous costs that do not fit those types.\n"
            "3. Review markups, taxes, and totals before you treat the number as final.\n"
            "4. Save. Product lines can refresh the crew material list on the opportunity.\n\n"
            "**Particulars**\n\n"
            "- Do not put internal cost detail on the Proposal. The customer document should show price, not your markup math.\n"
            "- Leaving with unsaved estimate edits asks you to save or discard, the same as Proposal and Pricing."
        ),
        allows_media=True,
        sort_order=48,
    ),
    SeedSection(
        id="status",
        title="Move status with intent",
        body_md=(
            "Update status from the opportunity header as the deal progresses (for example **Prospecting** → "
            "**Sent to Customer** → awarded or lost outcomes). You can add a note when changing status; it can appear in notes/history.\n\n"
            "- Status should reflect where the customer conversation actually is.\n"
            "- The system can send follow-up reminders while you stay in Prospecting or Sent to Customer for longer periods — keep status current so alerts stay useful."
        ),
        allows_media=False,
        sort_order=50,
    ),
    SeedSection(
        id="convert",
        title="Convert to Project",
        body_md=(
            "When the work is awarded, use **Convert to Project** in the opportunity header. The button stays disabled until name, site, estimator, and division are set.\n\n"
            "**In the convert modal you will:**\n\n"
            "1. Set project admin, lead source, and on-site lead per division.\n"
            "2. Set start and end dates.\n"
            "3. Mark related customers as awarded or not awarded.\n"
            "4. Approve or reject pricing line items (and optional services). Unapproved pricing can drop divisions.\n\n"
            "Conversion cannot be undone: status moves to in progress, bidding ends, and you land on the Project page for the same record. Workload and timesheet become available for execution."
        ),
        allows_media=True,
        sort_order=60,
    ),
    SeedSection(
        id="also-useful",
        title="Also useful",
        body_md=(
            "- **Related to Me** on the list focuses opportunities where you are involved (and clears status quick filters when turned on).\n"
            "- **Filters** combine rules (status, division, client, estimator, dates, value) — all rules must match.\n"
            "- Duplicate an opportunity from detail when you need a full commercial copy without timesheet or dispatch history."
        ),
        allows_media=False,
        sort_order=70,
    ),
]

DOCUMENTS_BUILDER_ID = "documents.builder"

_DOCUMENTS_BUILDER_SECTIONS: List[SeedSection] = [
    SeedSection(
        id="overview",
        title="Document builder",
        body_md=(
            "This is the detailed guide to the document builder: choosing a template, editing pages, and exporting a PDF.\n\n"
            "On an opportunity, start from the **Documents** tab when you need to assemble an estimate, a report, or a similar document."
        ),
        allows_media=True,
        sort_order=10,
    ),
]

TUTORIAL_SEEDS: Dict[str, List[SeedSection]] = {
    OPPORTUNITIES_LIST_ID: _OPPORTUNITIES_SECTIONS,
    DOCUMENTS_BUILDER_ID: _DOCUMENTS_BUILDER_SECTIONS,
}


def known_tutorial_ids() -> List[str]:
    return list(TUTORIAL_SEEDS.keys())


def get_seed_sections(tutorial_id: str) -> Optional[List[SeedSection]]:
    sections = TUTORIAL_SEEDS.get(tutorial_id)
    if sections is None:
        return None
    return list(sections)


def get_seed_section(tutorial_id: str, section_id: str) -> Optional[SeedSection]:
    sections = get_seed_sections(tutorial_id)
    if not sections:
        return None
    for s in sections:
        if s.id == section_id:
            return s
    return None
