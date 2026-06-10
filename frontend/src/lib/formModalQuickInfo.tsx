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

/** Project Timesheet tab — edit an existing time entry. */
export const editTimeEntryQuickInfo = formModalQuickInfo({
  purpose: (
    <>
      Adjust clock times or break minutes for a row already on this project&apos;s timesheet — for example, correct an
      end time after a supervisor review.
    </>
  ),
  howToUse: (
    <>
      Set {uiLabel('Start Time')} and {uiLabel('End Time')}, then enter {uiLabel('Break (minutes)')} if time should be
      deducted from the total.
    </>
  ),
  behavior: (
    <>
      Break cannot be greater than or equal to the span between start and end. Saved changes refresh the list and totals
      for the selected month.
    </>
  ),
  actions: (
    <>
      {uiLabel('Cancel')} closes without saving. {uiLabel('Save')} updates the entry and refreshes the timesheet table.
    </>
  ),
});

/** Project Timesheet tab — clock in or out for a scheduled shift. */
export function projectClockInOutQuickInfo(clockType: 'in' | 'out'): ReactNode {
  return formModalQuickInfo({
    purpose:
      clockType === 'in' ? (
        <>
          Record when a worker started a scheduled shift on this project — for example, arrival at the site for the day.
        </>
      ) : (
        <>
          Record when the worker finished the shift — you can add optional break time before the hours are calculated.
        </>
      ),
    howToUse: (
      <>
        Choose {uiLabel('Time')}. For clock-out you may check {uiLabel('Insert Break Time')} and set hours and minutes.
        Add a {uiLabel('Reason')} when required (clocking for someone else). Location may be captured when you submit.
      </>
    ),
    behavior: (
      <>
        Future times are limited for your own clock events; supervisors and on-site leads can set times for other workers
        with a minimum 15-character reason. Geofence messages appear when the shift has a site boundary defined.
      </>
    ),
    actions: (
      <>
        {uiLabel('Cancel')} closes without submitting. {uiLabel('Submit')} sends the clock event and refreshes shifts and
        the timesheet list.
      </>
    ),
  });
}

/** Project Timesheet tab — subcontractor QR clock-in/out (scan badge). */
export function subcontractorProjectClockQuickInfo(
  phase: 'scan' | 'clockIn' | 'clockOut' | 'blocked',
): ReactNode {
  return formModalQuickInfo({
    purpose: (
      <>
        Clock a subcontractor worker on this project using their QR badge — for example, when they arrive at the site
        or leave for the day.
      </>
    ),
    howToUse: (
      <>
        {phase === 'scan' ? (
          <>
            Scan the badge with your camera or paste the {uiLabel('Token or full scan URL')}, then tap {uiLabel('Look up')}.
          </>
        ) : phase === 'clockIn' ? (
          <>
            Review the worker details, add an optional {uiLabel('Signature')}, then {uiLabel('Clock In')}.
          </>
        ) : phase === 'clockOut' ? (
          <>
            Check {uiLabel('I confirm that the recorded working hours are accurate')}, sign, then {uiLabel('Clock Out')}.
          </>
        ) : (
          <>Resolve the blocking message — for example, clock the worker out on the other project first.</>
        )}
      </>
    ),
    behavior: (
      <>
        Workers with open attendance on another project cannot clock in here until that session is closed. Clock-out
        requires a signature and the hours confirmation checkbox.
      </>
    ),
    actions: (
      <>
        {uiLabel('Close')} dismisses without saving. {uiLabel('Look up')} loads the worker from a pasted token.{' '}
        {uiLabel('Clock In')} or {uiLabel('Clock Out')} records attendance on this project.
      </>
    ),
  });
}

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

/** Employee or subcontractor worker — training record detail view. */
export function employeeTrainingDetailQuickInfo(opts: { isWorker: boolean; canEdit: boolean }): ReactNode {
  const { isWorker, canEdit } = opts;
  const subject = isWorker ? 'worker' : 'employee';
  return formModalQuickInfo({
    purpose: (
      <>Review one training record for this {subject} — dates, status, matrix link, certificate reference, and notes.</>
    ),
    howToUse: (
      <>
        Click a row in the training table to open this view. Records synced from the internal LMS show an{' '}
        {uiLabel('Internal LMS')} badge on the title.
      </>
    ),
    behavior: (
      <>
        Scheduled or in-progress rows with a start date can appear on the team training calendar. Matrix-linked records
        also satisfy checklist slots in the standard training matrix section.
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

/** Field hints for employee Reports tab filters (`Title\\n\\nBody`). */
export const USER_REPORTS_FIELD_HINTS = {
  search: 'Search\n\nMatches title, description, or ticket number.',
  type: 'Type\n\nFine, warning, suspension, behavior note, or other.',
  status: 'Status\n\nOpen, under review, or closed.',
  severity: 'Severity\n\nLow, medium, or high priority.',
  from_date: 'From date\n\nEarliest occurrence date to include.',
  to_date: 'To date\n\nLatest occurrence date to include.',
} as const;

/** Employee loans — create a new loan agreement. */
export const employeeLoanCreateQuickInfo = formModalQuickInfo({
  purpose: (
    <>Record a new loan issued to this employee — principal, optional fees, agreement date, and how repayments are collected.</>
  ),
  howToUse: (
    <>
      Enter {uiLabel('Loan amount')} and optional {uiLabel('Fees (%)')}; the total updates automatically. Set{' '}
      {uiLabel('Agreement date')}, {uiLabel('Payment method')}, and {uiLabel('Status')}. Add {uiLabel('Notes')} when you
      need context for payroll or HR.
    </>
  ),
  behavior: (
    <>
      Fees are added to the base amount and stored as the loan total. New loans typically start as {uiLabel('Active')}{' '}
      with repayments tracked through payments on the loan row.
    </>
  ),
  actions: (
    <>
      {uiLabel('Cancel')} closes without saving. {uiLabel('Create loan')} saves the agreement and refreshes the loans
      list and summary totals.
    </>
  ),
});

/** Employee loans — record a repayment. */
export const employeeLoanPaymentQuickInfo = formModalQuickInfo({
  purpose: <>Log a repayment against an active loan — date, amount, and how the payment was collected.</>,
  howToUse: (
    <>
      Set {uiLabel('Payment date')}, {uiLabel('Payment amount')}, and {uiLabel('Payment method')}. Optional{' '}
      {uiLabel('Notes')} help explain payroll deductions or manual collections.
    </>
  ),
  behavior: (
    <>
      If the amount exceeds the remaining balance, you are asked to confirm before the payment is capped to the balance.
      When the balance reaches zero, you may be prompted to close the loan.
    </>
  ),
  actions: (
    <>
      {uiLabel('Cancel')} closes without saving. {uiLabel('Add payment')} records the payment and updates balances on the
      loan.
    </>
  ),
});

/** Employee loans — read loan detail, payments, and history. */
export const employeeLoanDetailQuickInfo = formModalQuickInfo({
  purpose: (
    <>Review one loan agreement for this employee — amounts, status, payment history, and activity timeline.</>
  ),
  howToUse: (
    <>
      Click a row in the loans table to open this view. Use {uiLabel('Add payment')} on active loans when you need to
      record a repayment.
    </>
  ),
  behavior: (
    <>
      Payments list every deduction or manual payment with the balance after each entry. When the remaining balance is
      zero, {uiLabel('Close loan')} marks the agreement as closed.
    </>
  ),
  actions: (
    <>
      {uiLabel('Close')} returns to the loans list. {uiLabel('Add payment')} opens the payment form. {uiLabel('Close loan')}{' '}
      is available when the balance is fully paid.
    </>
  ),
});

/** Employee Assets — assign equipment to this employee. */
export const employeeEquipmentCheckoutQuickInfo = formModalQuickInfo({
  purpose: (
    <>Assign company equipment from inventory to this employee — tools, electronics, PPE, or other tracked items.</>
  ),
  howToUse: (
    <>
      Choose {uiLabel('Equipment')} from available items, set {uiLabel('Condition')} at hand-off, and optional{' '}
      {uiLabel('Expected return date')} and {uiLabel('Notes')}.
    </>
  ),
  behavior: (
    <>
      Only unassigned, active equipment appears in the list. The assignment shows under {uiLabel('Currently with this employee')}{' '}
      until someone checks it back in.
    </>
  ),
  actions: (
    <>
      {uiLabel('Cancel')} closes without saving. {uiLabel('Assign equipment')} records the assignment and refreshes the assets
      table.
    </>
  ),
});

/** Employee Assets — check in equipment from this employee. */
export const employeeEquipmentCheckinQuickInfo = formModalQuickInfo({
  purpose: <>Record that checked-out equipment was returned by this employee.</>,
  howToUse: (
    <>
      Set {uiLabel('Return date')}, {uiLabel('Condition in')} when the item comes back, and optional {uiLabel('Notes')}{' '}
      (damage, missing parts, etc.).
    </>
  ),
  behavior: (
    <>
      The active checkout moves to {uiLabel('History')} with return date and status. The equipment becomes available for
      checkout again.
    </>
  ),
  actions: (
    <>
      {uiLabel('Cancel')} closes without saving. {uiLabel('Check in')} completes the return and refreshes the assets
      table.
    </>
  ),
});

/** Employee Assets — assign a fleet vehicle to this employee. */
export const employeeVehicleCheckoutQuickInfo = formModalQuickInfo({
  purpose: <>Assign an unassigned fleet vehicle to this employee for field or site use.</>,
  howToUse: (
    <>
      Select {uiLabel('Vehicle')}, optionally enter {uiLabel('Odometer (out)')}, {uiLabel('Expected return date')}, and{' '}
      {uiLabel('Notes')}.
    </>
  ),
  behavior: (
    <>
      Only vehicles not currently assigned to another driver are listed. The assignment appears under{' '}
      {uiLabel('Currently with this employee')} until the vehicle is returned.
    </>
  ),
  actions: (
    <>
      {uiLabel('Cancel')} closes without saving. {uiLabel('Assign vehicle')} records the assignment and refreshes the
      assets table.
    </>
  ),
});

/** Employee Assets — return a fleet vehicle or machinery assignment. */
export const employeeFleetReturnQuickInfo = formModalQuickInfo({
  purpose: <>Close an active fleet assignment — record return readings and optional notes.</>,
  howToUse: (
    <>
      Enter {uiLabel('Odometer (in)')} or {uiLabel('Hours (in)')} when readings were taken at check-out. Return values must
      be at or above those readings. Add {uiLabel('Notes')} if needed.
    </>
  ),
  behavior: (
    <>
      Vehicles use odometer; heavy machinery and other fleet assets may use hour meters. Empty readings are allowed when
      not tracked for this asset.
    </>
  ),
  actions: (
    <>
      {uiLabel('Cancel')} closes without saving. {uiLabel('Confirm return')} ends the assignment and refreshes the assets
      table.
    </>
  ),
});

/** Field hints for employee Assets checkout / return modals (`Title\\n\\nBody`). */
export const USER_ASSETS_FIELD_HINTS = {
  equipment: 'Equipment\n\nAvailable item not currently assigned to another employee.',
  condition_out: 'Condition\n\nPhysical state when the item leaves inventory.',
  expected_return_date: 'Expected return date\n\nTarget date the employee should return the item.',
  notes_out: 'Notes\n\nOptional context at checkout (project, job site, etc.).',
  return_date: 'Return date\n\nCalendar day the equipment was returned.',
  condition_in: 'Condition in\n\nPhysical state when the item comes back.',
  notes_in: 'Notes\n\nOptional notes on return (damage, missing parts, etc.).',
  vehicle: 'Vehicle\n\nUnassigned fleet vehicle to assign to this employee.',
  odometer_out: 'Odometer (out)\n\nReading when the vehicle is assigned; optional but recommended.',
  odometer_in: 'Odometer (in)\n\nReading when returned; must be at or above the check-out reading.',
  hours_in: 'Hours (in)\n\nHour meter when returned; must be at or above the check-out reading.',
} as const;

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

/** Safety — Form Custom Lists: create a new reusable dropdown list. */
/** Opportunity detail — edit workflow status. */
export const opportunityEditStatusQuickInfo = formModalQuickInfo({
  purpose: (
    <>
      Update where this opportunity sits in your sales pipeline — for example, from {uiLabel('Estimating')} to{' '}
      {uiLabel('Sent to Customer')}.
    </>
  ),
  howToUse: (
    <>
      Choose a {uiLabel('Status')} from the list. Optionally add {uiLabel('Notes (optional)')} to explain the change; notes
      can appear in Notes/History.
    </>
  ),
  actions: (
    <>
      {uiLabel('Cancel')} closes without saving. {uiLabel('Save')} updates the status on this opportunity.
    </>
  ),
});

/** Opportunity detail — rename opportunity. */
export const opportunityEditNameQuickInfo = formModalQuickInfo({
  purpose: <>Change the display name shown on the opportunity header, lists, and reports.</>,
  howToUse: (
    <>
      Edit {uiLabel('Project Name')} and save. Use a name your team will recognize in calendars and proposals.
    </>
  ),
  actions: (
    <>
      {uiLabel('Cancel')} discards changes. {uiLabel('Save')} applies the new name everywhere this opportunity appears.
    </>
  ),
});

/** Opportunity detail — link a customer site. */
export const opportunityEditSiteQuickInfo = formModalQuickInfo({
  purpose: (
    <>
      Link this opportunity to a job site under the project owner customer — required before converting to a project.
    </>
  ),
  howToUse: (
    <>
      Pick {uiLabel('Site')} from sites registered for the owner customer. Review the site summary below the list before
      saving.
    </>
  ),
  behavior: (
    <>Changing the site updates location fields shown on the opportunity overview.</>
  ),
  actions: (
    <>
      {uiLabel('Cancel')} closes without changes. {uiLabel('Save')} links the selected site to this opportunity.
    </>
  ),
});

/** Opportunity detail — assign estimators. */
export const opportunityEditEstimatorsQuickInfo = formModalQuickInfo({
  purpose: (
    <>
      Assign who estimates this opportunity — typically people in {uiLabel('Sales / Estimating')}.
    </>
  ),
  howToUse: (
    <>
      Use {uiLabel('Estimators')} to search and select one or more team members. At least one estimator is required before
      converting to a project.
    </>
  ),
  actions: (
    <>
      {uiLabel('Cancel')} closes without saving. {uiLabel('Save')} stores the estimator list on this opportunity.
    </>
  ),
});

/** Project / opportunity detail — edit project divisions. */
export const editProjectDivisionsQuickInfo = formModalQuickInfo({
  purpose: (
    <>
      Choose which work divisions apply to this record — for example, {uiLabel('Roofing')},{' '}
      {uiLabel('Mechanical')}, or {uiLabel('Electrical')}. Divisions drive pricing splits and how work is categorized
      across the app.
    </>
  ),
  howToUse: (
    <>
      Tap a division to select or clear it. When a parent has subdivisions, use the arrow to expand the list and pick
      the specific trade. Selected divisions are highlighted.
    </>
  ),
  behavior: (
    <>
      Percentages shown beside each icon are calculated from approved pricing items — you do not set them here. Removing a
      division may affect pricing approval on linked proposal lines.
    </>
  ),
  actions: (
    <>
      {uiLabel('Cancel')} closes without saving. {uiLabel('Save')} updates the division list on this project or
      opportunity.
    </>
  ),
});

/** Opportunity / project calendar — create or edit event. */
export const projectCalendarEventQuickInfo = formModalQuickInfo({
  purpose: (
    <>
      Schedule work on the opportunity calendar — single days, multi-day blocks, or repeating patterns such as
      weekdays or weekends.
    </>
  ),
  howToUse: (
    <>
      Enter {uiLabel('Event Name')}, set {uiLabel('Start Date')} and {uiLabel('End Date')}, then choose{' '}
      {uiLabel('All-day')} or specific times. Use {uiLabel('Repeat')} for recurring events. Review the summary and
      preview before saving.
    </>
  ),
  behavior: (
    <>
      Exception dates skip a recurrence; extra dates add one-off occurrences. Times use the selected{' '}
      {uiLabel('Timezone')}.
    </>
  ),
  actions: (
    <>
      {uiLabel('Cancel')} closes without saving. {uiLabel('Create Event')} or {uiLabel('Save Changes')} updates the
      calendar.
    </>
  ),
});

/** Opportunity detail — lead source. */
export const opportunityEditLeadSourceQuickInfo = formModalQuickInfo({
  purpose: (
    <>
      Record how this opportunity entered your pipeline — for example, referral, repeat customer, or marketing campaign.
    </>
  ),
  howToUse: (
    <>
      Choose {uiLabel('Lead source')} from the list configured in system settings. Leave blank only if the source is
      unknown.
    </>
  ),
  actions: (
    <>
      {uiLabel('Cancel')} closes without saving. {uiLabel('Save')} updates the lead source on this opportunity.
    </>
  ),
});

/** Opportunity detail — convert bidding opportunity to active project. */
export const opportunityConvertToProjectQuickInfo = formModalQuickInfo({
  purpose: (
    <>
      Turn this bidding opportunity into an active project so you can use workload, timesheets, and full project
      operations.
    </>
  ),
  howToUse: (
    <>
      Set {uiLabel('Project admin')}, {uiLabel('Lead source')}, {uiLabel('On-site leads')} per division, and{' '}
      {uiLabel('Start date')} / {uiLabel('End date')}. If related customers exist, mark bid winners as awarded. Review
      pricing line items and approve what should carry into the project.
    </>
  ),
  behavior: (
    <>
      Required opportunity fields (name, site, estimator, divisions) must already be complete before you can convert.
      This action cannot be undone.
    </>
  ),
  actions: (
    <>
      {uiLabel('Cancel')} closes without converting. {uiLabel('Convert')} creates the active project and opens the
      project view.
    </>
  ),
});

/** Opportunity detail — create a note on the Notes/History tab. */
export const opportunityCreateNoteQuickInfo = formModalQuickInfo({
  purpose: (
    <>
      Record commercial updates, site visits, or other activity on this opportunity so the team has a shared
      timeline.
    </>
  ),
  howToUse: (
    <>
      Enter a {uiLabel('Title')}, choose a {uiLabel('Category')}, and write a {uiLabel('Description')}. Add
      attachments if needed. For financial categories, enter the amount when prompted.
    </>
  ),
  actions: (
    <>
      {uiLabel('Cancel')} closes without saving. {uiLabel('Create Note')} saves the note to Notes/History.
    </>
  ),
});

/** Opportunity detail — related customers on a bid. */
export const opportunityEditRelatedCustomersQuickInfo = formModalQuickInfo({
  purpose: (
    <>
      Link other customers involved in this bid besides the project owner — for example, partners or additional owners.
    </>
  ),
  howToUse: (
    <>
      Search customers, then check each name to add or remove it from the related list. The owner customer is not shown
      here.
    </>
  ),
  actions: (
    <>
      {uiLabel('Cancel')} closes without saving. {uiLabel('Save')} updates related customers for this opportunity.
    </>
  ),
});

/** Project Safety tab — start a new inspection from an active form template. */
export const projectSafetyNewInspectionQuickInfo = formModalQuickInfo({
  purpose: (
    <>
      Start a new safety inspection on this project using a published form template — for example, a daily site walk or
      a formal MKI-style report.
    </>
  ),
  howToUse: (
    <>
      Choose a {uiLabel('Form template')} from the list. Only active templates marked for scheduling appear here. After
      you create the inspection, you fill it out on the Safety tab.
    </>
  ),
  behavior: (
    <>
      The inspection opens as a {uiLabel('Draft')} with today&apos;s date. You can save progress, collect signatures,
      and finalize when the form is complete.
    </>
  ),
  actions: (
    <>
      {uiLabel('Cancel')} closes without creating an inspection. {uiLabel('Create')} adds the draft and opens it for
      editing.
    </>
  ),
});

/** Create Shift (Workload / Dispatch). */
export const createShiftQuickInfo = formModalQuickInfo({
  purpose: (
    <>
      Schedule one or more shifts for workers on this project — for example, a full week of day shifts or a single
      coverage day.
    </>
  ),
  howToUse: (
    <>
      Choose {uiLabel('Workers')}, pick {uiLabel('Single Date')} or {uiLabel('Date Range')}, set start and end times,
      and optionally assign a {uiLabel('Job Type')}. The button label shows how many shifts will be created.
    </>
  ),
  behavior: (
    <>
      In range mode you can {uiLabel('Exclude weekends')} so Saturday and Sunday are skipped. Each worker × date
      combination becomes its own shift.
    </>
  ),
  actions: (
    <>
      {uiLabel('Cancel')} closes without creating shifts. {uiLabel('Create Shift')} (or the plural label) saves all
      shifts and refreshes the calendar.
    </>
  ),
});

/** Edit Shift (Workload / Dispatch). */
export const editShiftQuickInfo = formModalQuickInfo({
  purpose: <>View or update an existing scheduled shift — times and job type only.</>,
  howToUse: (
    <>
      Worker and date are fixed. Change {uiLabel('Start Time')}, {uiLabel('End Time')}, or {uiLabel('Job Type')} when
      you have edit permission.
    </>
  ),
  actions: (
    <>
      {uiLabel('Cancel')} closes without saving. {uiLabel('Save Changes')} updates the shift on the calendar.
    </>
  ),
});

/** Project Files tab — upload files to the library. */
export const projectFilesUploadQuickInfo = formModalQuickInfo({
  purpose: (
    <>
      Add one or more documents to this project&apos;s file library — for example, site photos, submittals, or
      signed contracts.
    </>
  ),
  howToUse: (
    <>
      Pick files with the upload area or drag them in. Files upload to the category and folder you have selected in
      the file browser.
    </>
  ),
  behavior: (
    <>
      You can also drop files directly onto the category sidebar or file list without opening this window. Upload
      progress appears in the corner while files are sent.
    </>
  ),
  actions: (
    <>
      {uiLabel('Cancel')} closes without uploading. Selecting files starts the upload and closes this window.
    </>
  ),
});

/** Project Files tab — create a folder in a category. */
export const projectFilesNewFolderQuickInfo = formModalQuickInfo({
  purpose: (
    <>
      Organize project documents in folders — for example, &quot;Drawings&quot; under Plans or a subfolder for a
      specific phase.
    </>
  ),
  howToUse: (
    <>
      Enter a {uiLabel('Folder name')}. When you are not inside a category yet, choose {uiLabel('Category')} first.
      Subfolders are created inside the folder shown in the breadcrumb.
    </>
  ),
  actions: (
    <>
      {uiLabel('Cancel')} closes without creating a folder. {uiLabel('Create')} adds the folder and refreshes the
      list.
    </>
  ),
});

/** Project Files tab — move a file to another category. */
export const projectFilesMoveCategoryQuickInfo = formModalQuickInfo({
  purpose: <>Move a file from its current category to another — for example, from Uncategorized into Plans.</>,
  howToUse: (
    <>
      Choose {uiLabel('Category')}. The file is placed at the root of that category (not inside a subfolder).
    </>
  ),
  actions: (
    <>
      {uiLabel('Cancel')} closes without moving. {uiLabel('Move')} updates the file location and refreshes the
      library.
    </>
  ),
});

/** Project Documents tab — pick blank or preset when creating a document. */
export const projectDocumentsChooseTypeQuickInfo = formModalQuickInfo({
  purpose: (
    <>
      Start a new document for this {uiLabel('Opportunity')} — either from a company template (multi-page layouts) or
      as a single blank page.
    </>
  ),
  howToUse: (
    <>
      Pick {uiLabel('Blank (single page)')} for one empty page, or choose a named template to pre-fill pages and
      backgrounds from {uiLabel('Document Types')} settings.
    </>
  ),
  behavior: (
    <>
      Creating opens the document editor inline on this tab. Changes auto-save while you edit. You can expand to
      full screen from the editor toolbar.
    </>
  ),
  actions: (
    <>
      {uiLabel('Cancel')} closes without creating. Selecting a template or blank creates the document and opens the
      editor.
    </>
  ),
});

export const formCustomListNewQuickInfo = formModalQuickInfo({
  purpose: (
    <>
      Create a named list of options you can attach to drop-down fields in {uiLabel('Form Templates')} — for example
      hazard types, locations, or equipment categories.
    </>
  ),
  howToUse: (
    <>
      Enter a clear {uiLabel('Name')}, then {uiLabel('Create')}. After the list appears on the left, select it to add
      items, nest children (up to three levels), and turn {uiLabel('Include "Other"')} on if users should type a custom
      answer below the drop-down.
    </>
  ),
  behavior: (
    <>
      Lists used in a published template cannot be deleted until you remove them from that template. You can set a list
      to {uiLabel('Inactive')} to hide it from new use while keeping existing forms unchanged.
    </>
  ),
  actions: (
    <>
      {uiLabel('Cancel')} closes without creating a list. {uiLabel('Create')} saves the list and opens it for editing.
    </>
  ),
});

/** Company Files — upload modal. */
export const companyFilesUploadQuickInfo = formModalQuickInfo({
  purpose: <>Add one or more files to the open folder in Company Files.</>,
  howToUse: (
    <>
      Choose files with {uiLabel('Files')}, or drag and drop onto the folder area. The folder must be open before
      uploading.
    </>
  ),
  actions: (
    <>
      {uiLabel('Cancel')} closes without uploading. Selected files upload immediately after you pick them.
    </>
  ),
});

/** Company Files — new folder / subfolder. */
export const companyFilesNewFolderQuickInfo = formModalQuickInfo({
  purpose: <>Create a folder to organize company documents within the selected file category.</>,
  howToUse: <>Enter a {uiLabel('Folder name')} your team will recognize, then create the folder.</>,
  actions: (
    <>
      {uiLabel('Create')} saves the folder. {uiLabel('Cancel')} closes without changes.
    </>
  ),
});

/** Company Files — move document. */
export const companyFilesMoveDocQuickInfo = formModalQuickInfo({
  purpose: <>Move a document to a different folder within Company Files.</>,
  howToUse: <>Pick the {uiLabel('Destination folder')}, then confirm the move.</>,
  actions: (
    <>
      {uiLabel('Move')} updates the document location. {uiLabel('Cancel')} closes without changes.
    </>
  ),
});

/** User profile — Basic Information section. */
export const userBasicInfoQuickInfo = formModalQuickInfo({
  purpose: <>Update legal name, identity, and uniform sizing for this employee.</>,
  howToUse: (
    <>
      Edit the fields you need. Use {uiLabel('?')} beside a label for field-level help. {uiLabel('Preferred name')} appears
      on the profile hero when set.
    </>
  ),
  actions: (
    <>
      {uiLabel('Save')} updates this section only. {uiLabel('Cancel')} closes without saving.
    </>
  ),
});

/** User profile — Address section. */
export const userAddressQuickInfo = formModalQuickInfo({
  purpose: <>Set the employee&apos;s primary mailing and location address.</>,
  howToUse: (
    <>
      Start typing in {uiLabel('Address line 1')} to pick a suggestion, then adjust city, province, and postal code if
      needed.
    </>
  ),
  actions: (
    <>
      {uiLabel('Save')} updates the address for this employee. {uiLabel('Cancel')} closes without saving.
    </>
  ),
});

/** User profile — Contact section. */
export const userContactQuickInfo = formModalQuickInfo({
  purpose: <>Personal phone numbers used to reach this employee outside of work systems.</>,
  howToUse: (
    <>
      Enter {uiLabel('Phone 1')} and optional {uiLabel('Phone 2')}. Numbers are formatted as you type.
    </>
  ),
  actions: (
    <>
      {uiLabel('Save')} applies phone number changes. {uiLabel('Cancel')} closes without saving.
    </>
  ),
});

/** User profile — Education section. */
export const userEducationQuickInfo = formModalQuickInfo({
  purpose: <>Record schools, degrees, and study dates for this employee.</>,
  howToUse: (
    <>
      Use {uiLabel('Add education')} to create a record. {uiLabel('Delete')} removes a card you no longer need.
    </>
  ),
  actions: (
    <>
      {uiLabel('Save')} in the add window creates a record. Deletes save immediately. {uiLabel('Done')} closes the
      education list.
    </>
  ),
});

/** User profile — Add / edit visa entry (Legal & Documents). */
export const userVisaEntryQuickInfo = formModalQuickInfo({
  purpose: <>Record a work permit, study permit, or other visa held by this employee.</>,
  howToUse: (
    <>
      Enter {uiLabel('Visa Type')} and dates. {uiLabel('Status')} drives the badge on the profile card. Use{' '}
      {uiLabel('Notes')} for LMIA numbers or other reference details.
    </>
  ),
  actions: (
    <>
      {uiLabel('Create')} or {uiLabel('Save')} stores the entry. {uiLabel('Cancel')} closes without saving.
    </>
  ),
});

/** User profile — Legal & Documents section. */
export const userLegalDocumentsQuickInfo = formModalQuickInfo({
  purpose: (
    <>
      SIN, work eligibility, driver&apos;s licence, and immigration documents required for payroll and compliance.
    </>
  ),
  howToUse: (
    <>
      Set {uiLabel('Work Eligibility Status')} first — it controls which document sections appear. Upload or update
      supporting files where shown.
    </>
  ),
  behavior: (
    <>
      While {uiLabel('Work Eligibility Status')} is {uiLabel('Select...')} or {uiLabel('Canadian Citizen')}, only SIN,
      eligibility, and driver&apos;s licence are shown. Visa and immigration sections appear after you choose another
      status (for example Permanent Resident or Temporary Resident).
    </>
  ),
  actions: (
    <>
      {uiLabel('Save')} applies profile field changes from this window. {uiLabel('Cancel')} closes without saving.
    </>
  ),
});

/** User profile — Emergency Contacts section. */
export const userEmergencyContactsQuickInfo = formModalQuickInfo({
  purpose: <>People to call if something happens to this employee on or off site.</>,
  howToUse: (
    <>
      {uiLabel('New Contact')} adds a person. Mark one as {uiLabel('Primary')} for the default emergency contact.
    </>
  ),
  actions: (
    <>
      {uiLabel('Create')} in the new-contact window saves a contact. Card edits save from each card. {uiLabel('Done')}{' '}
      closes the list.
    </>
  ),
});

/** User profile — Organization (Job tab). */
export const userOrganizationQuickInfo = formModalQuickInfo({
  purpose: (
    <>
      Job title, supervisor, departments, project divisions, and work contact details for this employee.
    </>
  ),
  howToUse: (
    <>
      Update employment fields and multi-select {uiLabel('Departments')} and {uiLabel('Project Divisions')} as needed.
    </>
  ),
  actions: (
    <>
      {uiLabel('Save')} updates organization data for this employee. {uiLabel('Cancel')} closes without saving.
    </>
  ),
});

/** User profile — Salary (Job tab). */
export const userSalaryQuickInfo = formModalQuickInfo({
  purpose: <>Current pay rate and pay type on file for this employee.</>,
  howToUse: (
    <>
      Enter {uiLabel('Pay rate')} and choose or type {uiLabel('Pay type')}. Salary history is managed separately on the
      profile card.
    </>
  ),
  actions: (
    <>
      {uiLabel('Save')} updates compensation fields. {uiLabel('Cancel')} closes without saving.
    </>
  ),
});

/** User profile — Manual time-off balance adjustment (Sick Leave, Vacation, etc.). */
export function userTimeOffBalanceAdjustQuickInfo(policyLabel: string) {
  return formModalQuickInfo({
    purpose: (
      <>
        Manually adjust this employee&apos;s {uiLabel(policyLabel)} balance when payroll or BambooHR data needs a
        correction.
      </>
    ),
    howToUse: (
      <>
        Choose {uiLabel('Add')} or {uiLabel('Subtract')}, enter days, set {uiLabel('Effective date')}, and provide a{' '}
        {uiLabel('Note')}. The summary shows the projected balance after you save.
      </>
    ),
    behavior: (
      <>
        The adjustment is recorded in time-off history as a manual entry. Sick leave requests can still be submitted
        without sufficient balance; vacation typically requires available days.
      </>
    ),
    actions: (
      <>
        {uiLabel('Save')} applies the adjustment and refreshes balances and history. {uiLabel('Cancel')} closes without
        saving.
      </>
    ),
  });
}

/** User profile — New salary history entry (Job tab). */
export const userSalaryEntryQuickInfo = formModalQuickInfo({
  purpose: (
    <>
      Record a compensation change for this employee. The new {uiLabel('Pay rate')} and {uiLabel('Pay type')} update the
      profile when you save.
    </>
  ),
  howToUse: (
    <>
      Set {uiLabel('Effective date')}, enter the new {uiLabel('Pay rate')}, and choose {uiLabel('Pay type')} if needed.
      {uiLabel('Change reason')} is required; {uiLabel('Comment')} is optional.
    </>
  ),
  behavior: (
    <>
      Each entry appears in the salary history table. The most recent effective entry updates the current pay fields on
      the profile card.
    </>
  ),
  actions: (
    <>
      {uiLabel('Save')} creates the history entry and refreshes compensation on the profile. {uiLabel('Cancel')} closes
      without saving.
    </>
  ),
});

/** Company Files — folder permissions. */
export const companyFilesPermissionsQuickInfo = formModalQuickInfo({
  purpose: <>Control who can access this folder when it is not public to all users.</>,
  howToUse: (
    <>
      Leave {uiLabel('Public (all users can access)')} checked for open access, or restrict to selected users and
      divisions.
    </>
  ),
  actions: (
    <>
      {uiLabel('Save')} applies permissions. {uiLabel('Cancel')} closes without saving.
    </>
  ),
});
