import type { ReactNode } from 'react';

/**
 * Standard Quick Info structure for `AppFormModal` (`quickInfo` prop).
 *
 * Write for end users — explain what the window does and how to use it.
 * Do not mention component names, props, or implementation details.
 *
 * **Paragraph order**
 * 1. **Purpose** — What this window is for, with one or two concrete examples.
 * 2. **How to use** — Main steps; name visible UI labels (buttons, sections, fields).
 * 3. **Behavior** *(optional)* — Multiple items, combined rules, or “what happens when…”.
 * 4. **Actions** — What Cancel, the primary button, and any secondary buttons do.
 *
 * Use `uiLabel()` for button names and key labels so they stand out in the panel.
 */
export type FormModalQuickInfoCopy = {
  purpose: ReactNode;
  howToUse: ReactNode;
  behavior?: ReactNode;
  actions: ReactNode;
};

/** Emphasize a visible UI label inside Quick Info copy. */
export function uiLabel(children: ReactNode) {
  return <span className="font-medium text-gray-800">{children}</span>;
}

export function formModalQuickInfo(copy: FormModalQuickInfoCopy): ReactNode {
  return (
    <>
      <p>{copy.purpose}</p>
      <p>{copy.howToUse}</p>
      {copy.behavior ? <p>{copy.behavior}</p> : null}
      <p>{copy.actions}</p>
    </>
  );
}

/** Reference copy — Filters modal (Projects, Opportunities, etc.). */
export const filtersModalQuickInfo = formModalQuickInfo({
  purpose: (
    <>
      Use this window to narrow the list — for example, only projects in progress, or opportunities for a
      specific customer.
    </>
  ),
  howToUse: (
    <>
      Tap {uiLabel('Add filter')} to start. For each filter, choose what to look at (such as Status or Division), how
      to compare it (is, is not, before a date, and so on), then pick the value.
    </>
  ),
  behavior: (
    <>
      You can add more than one filter. The list shows items that match {uiLabel('all')} of your filters at the same
      time.
    </>
  ),
  actions: (
    <>
      {uiLabel('Apply Filters')} updates the list and closes this window. {uiLabel('Clear All')} removes every filter
      before you apply. {uiLabel('Cancel')} closes without changing what is already on the list.
    </>
  ),
});

/** Reference copy — Create Request (Task Requests). */
export const createRequestQuickInfo = formModalQuickInfo({
  purpose: (
    <>
      Start a conversation with someone on your team before it becomes a task — useful when you need more detail or
      approval first.
    </>
  ),
  howToUse: (
    <>
      Add a {uiLabel('Title')}, choose {uiLabel('Priority')}, and pick who receives the request (a specific person or a
      whole division). Project and due date are optional but help set expectations.
    </>
  ),
  behavior: (
    <>
      The recipient can reply and ask questions. Once they accept, the request can move forward as regular work.
    </>
  ),
  actions: (
    <>
      {uiLabel('Cancel')} closes without sending. {uiLabel('Create Request')} sends the request and adds it to your sent
      list.
    </>
  ),
});

/** Subcontractor worker — Clock In / Clock Out modal on the Timesheet tab. */
export function scWorkerClockQuickInfo(clockType: 'in' | 'out'): ReactNode {
  return formModalQuickInfo({
    purpose:
      clockType === 'in' ? (
        <>
          Record when this subcontractor worker started on site — for example, arrival at a project in the morning.
        </>
      ) : (
        <>
          End the worker&apos;s open session — for example, when they leave the site for the day.
        </>
      ),
    howToUse:
      clockType === 'in' ? (
        <>
          Choose {uiLabel('Date')} and {uiLabel('Time')}, then select the {uiLabel('Project')}. Location may be captured
          when you submit.
        </>
      ) : (
        <>
          Confirm {uiLabel('Date')} and {uiLabel('Time')}, check {uiLabel('I confirm that the recorded working hours are accurate')},
          add optional break time, and provide the required {uiLabel('Signature')}.
        </>
      ),
    behavior: (
      <>
        Time is usually locked to the current time unless your account can edit clock times. Clock-out needs an open
        clock-in for this worker.
      </>
    ),
    actions: (
      <>
        {uiLabel('Cancel')} closes without saving. {uiLabel('Submit')} records the clock event and refreshes the
        timesheet list.
      </>
    ),
  });
}

/** Subcontractor worker — manual New / Edit attendance on the Timesheet tab. */
export function scWorkerManualAttendanceQuickInfo(editing: boolean): ReactNode {
  return formModalQuickInfo({
    purpose: (
      <>
        {editing
          ? 'Correct an existing attendance row — for example, fix the project or clock times after a site report.'
          : 'Add a past or manual attendance row when clock-in/out was not done live — for example, office entry from a paper timesheet.'}
      </>
    ),
    howToUse: (
      <>
        Select a {uiLabel('Project')}, choose {uiLabel('Entry type')} ({uiLabel('Clock in / out')} or{' '}
        {uiLabel('Hours worked')}), set {uiLabel('HR status')}, then fill all required dates and times. For{' '}
        {uiLabel('Clock in / out')}, both clock-in and clock-out are required.
      </>
    ),
    behavior: (
      <>
        {uiLabel('Hours worked')} stores total time for one day without separate in/out times. Break minutes apply when
        clock-out or hours are set. The row appears in the table after you save.
      </>
    ),
    actions: (
      <>
        {uiLabel('Cancel')} discards changes. {editing ? uiLabel('Update') : uiLabel('Create')} saves the record and
        updates the list.
      </>
    ),
  });
}

/** Subcontractor worker — read-only attendance detail from the timesheet table. */
/** Employee or subcontractor worker — add / edit training record. */
export function employeeTrainingRecordQuickInfo(opts: {
  isWorker: boolean;
  editing: boolean;
  hasCertificateFile?: boolean;
}): ReactNode {
  const { isWorker, editing, hasCertificateFile } = opts;
  const docsTarget = isWorker ? (
    <>
      worker&apos;s {uiLabel('Documents')} tab ({uiLabel('Training certificates')})
    </>
  ) : (
    <>
      {uiLabel('Docs')} → {uiLabel('Training certificates')}
    </>
  );

  return formModalQuickInfo({
    purpose: (
      <>
        {editing
          ? 'Update course, certification, or matrix-linked training — for example, fix dates or upload a renewed certificate.'
          : isWorker
            ? 'Add training required for site access — courses, certifications, or a standard matrix item not yet on file.'
            : 'Add HR training history — courses, certifications, renewals, or scheduled sessions for the team calendar.'}
      </>
    ),
    howToUse: (
      <>
        Enter {uiLabel('Title')}, optional {uiLabel('Matrix slot')}, dates, and {uiLabel('Status')}. For{' '}
        {uiLabel('completed')} or {uiLabel('expired')}, set {uiLabel('End date')} (used as completion unless you check{' '}
        {uiLabel('Use different completion date')}). Daily {uiLabel('Start time')} / {uiLabel('End time')} calculate{' '}
        {uiLabel('Duration (hours)')} across the date range.
      </>
    ),
    behavior: (
      <>
        An optional certificate file saves to {docsTarget} when you save. Matrix shortcuts pre-fill the title when
        adding from the standard matrix section below the table.
      </>
    ),
    actions: (
      <>
        {uiLabel('Cancel')} closes without saving. {uiLabel('Save')} stores the record and refreshes the training list
        {hasCertificateFile ? ' (and uploads the certificate when selected)' : ''}.
      </>
    ),
  });
}

/** Employee or subcontractor worker — create / edit safety or incident report. */
export function employeeReportFormQuickInfo(opts: { isWorker: boolean; editing: boolean }): ReactNode {
  const { isWorker, editing } = opts;
  const subject = isWorker ? 'this worker' : 'this employee';
  return formModalQuickInfo({
    purpose: (
      <>
        {editing
          ? `Update an existing report on file for ${subject} — title, status, type-specific fields, or linked projects.`
          : `Record a safety or HR incident for ${subject} — fines, warnings, suspensions, behavior notes, or general items.`}
      </>
    ),
    howToUse: (
      <>
        Choose {uiLabel('Report type')} first; extra fields appear for fines, suspensions, or behavior notes. Set{' '}
        {uiLabel('Occurrence date')}, {uiLabel('Severity')}, and {uiLabel('Status')}. Link optional projects or
        departments when the event ties to a site or team.
      </>
    ),
    behavior: (
      <>
        {editing
          ? 'Attachments upload when you pick files and attach to the report immediately. You can remove files before saving other changes.'
          : 'Attachments upload when you pick files and are saved with the new report when you create it.'}
      </>
    ),
    actions: (
      <>
        {uiLabel('Cancel')} closes without saving. {uiLabel(editing ? 'Update report' : 'Create report')} stores the
        record and refreshes the reports table.
      </>
    ),
  });
}

/** Employee or subcontractor worker — read / inline-edit report detail. */
export function employeeReportDetailQuickInfo(opts: { isWorker: boolean; canEdit: boolean }): ReactNode {
  const { isWorker, canEdit } = opts;
  const subject = isWorker ? 'worker' : 'employee';
  return formModalQuickInfo({
    purpose: <>Review one report filed for this {subject} — status, description, type-specific data, files, and comments.</>,
    howToUse: (
      <>
        Click a row to open this view. Use {uiLabel('Edit')} (when allowed) to change fields or add attachments in the edit
        window.
      </>
    ),
    behavior: (
      <>
        Attachments are view-only here — open files if present. Add comments below when you have permission. Closed
        reports still appear in history and filters.
      </>
    ),
    actions: (
      <>
        {uiLabel('Close')} returns to the list.
        {canEdit ? ` ${uiLabel('Edit')} opens the full edit form.` : ''}
      </>
    ),
  });
}

export const scWorkerAttendanceDetailQuickInfo = formModalQuickInfo({
  purpose: (
    <>Review everything recorded for one attendance session — times, project, status, notes, and signature.</>
  ),
  howToUse: (
    <>
      Open a row in the timesheet table to see this view. Scroll to read clock-in/out, who confirmed each step, and any
      GPS note on the record.
    </>
  ),
  behavior: (
    <>
      {uiLabel('Open')} sessions have no clock-out yet. Use {uiLabel('Edit')} on the row (if you have permission) to
      change times in the edit window.
    </>
  ),
  actions: (
    <>
      {uiLabel('Close')} returns to the timesheet list without changing the record.
    </>
  ),
});

/** Inventory — supplier read-only detail (Suppliers page). */
export function supplierDetailQuickInfo(canEdit: boolean): ReactNode {
  return formModalQuickInfo({
    purpose: (
      <>
        Review a vendor&apos;s company profile, contact people, and products stored in your inventory catalog.
      </>
    ),
    howToUse: (
      <>
        Switch between {uiLabel('Overview')}, {uiLabel('Contacts')}, and {uiLabel('Products')}. On{' '}
        {uiLabel('Contacts')}, click a row to edit or use {uiLabel('New Contact')}. Click the logo to change the supplier
        photo when you can edit.
      </>
    ),
    behavior: (
      <>
        Products open in a separate detail window. Contact rows show email and phone as quick links.
      </>
    ),
    actions: (
      <>
        {uiLabel('Close')} returns to the supplier list.
        {canEdit ? (
          <>
            {' '}
            {uiLabel('Edit')} opens the edit form. {uiLabel('Delete')} removes this supplier after you confirm.
          </>
        ) : null}
      </>
    ),
  });
}

/** Inventory — create or edit supplier form. */
export function supplierFormQuickInfo(editing: boolean): ReactNode {
  return formModalQuickInfo({
    purpose: (
      <>
        {editing
          ? 'Update a vendor’s legal and contact details used across inventory and estimates.'
          : 'Register a new vendor in two steps: company details, then address.'}
      </>
    ),
    howToUse: (
      <>
        Step 1: enter {uiLabel('Name')} (required), then optional legal name, email, phone, and website. Step 2: address
        lines; city and province fill in when you pick an address from search.
      </>
    ),
    actions: (
      <>
        {uiLabel('Cancel')} closes without saving. {uiLabel('Next')} and {uiLabel('Back')} move between steps when
        creating. {uiLabel(editing ? 'Update' : 'Create')} saves the supplier.
      </>
    ),
  });
}

/** Inventory — product read-only detail from a supplier. */
export function productDetailQuickInfo(canEdit: boolean): ReactNode {
  return formModalQuickInfo({
    purpose: <>Inspect one catalog product — pricing, units, usage in estimates, and related items.</>,
    howToUse: (
      <>
        Use {uiLabel('Details')}, {uiLabel('Usage')}, and {uiLabel('Related')} to switch sections. Open linked estimates
        or projects from the usage list when available.
      </>
    ),
    behavior: (
      <>
        Related products are bidirectional links for substitutes or companions. Usage lists estimates that reference
        this SKU.
      </>
    ),
    actions: (
      <>
        {uiLabel('Close')} returns to the supplier.
        {canEdit ? (
          <>
            {' '}
            {uiLabel('Edit')} opens the edit form.
          </>
        ) : null}
      </>
    ),
  });
}

/** Inventory — new product on a supplier. */
export const inventoryNewProductQuickInfo = formModalQuickInfo({
  purpose: <>Add a product row to this supplier’s catalog for estimates and inventory.</>,
  howToUse: (
    <>
      Enter {uiLabel('Name')} and {uiLabel('Price ($)')}, then unit type and optional category, coverage, image, or
      technical manual URL.
    </>
  ),
  actions: (
    <>
      {uiLabel('Cancel')} closes without saving. {uiLabel('Create')} adds the product to this supplier.
    </>
  ),
});

/** Inventory — supplier contact create/edit. */
export function inventoryContactFormQuickInfo(editing: boolean): ReactNode {
  return formModalQuickInfo({
    purpose: (
      <>
        {editing
          ? 'Update a person at this supplier — role, email, phone, and notes.'
          : 'Add a contact person for this supplier.'}
      </>
    ),
    howToUse: (
      <>
        {uiLabel('Name')} is required. Fill email, phone, title, and notes as needed. When editing, use{' '}
        {uiLabel('Contact photo')} to update the profile image.
      </>
    ),
    actions: (
      <>
        {uiLabel('Cancel')} closes without saving. {uiLabel(editing ? 'Update' : 'Create')} saves the contact.
      </>
    ),
  });
}
