import { formModalQuickInfo, uiLabel } from '@/lib/formModalQuickInfo';

export const fleetAssignmentLogDetailQuickInfo = formModalQuickInfo({
  purpose: (
    <>
      View the check-out or return record for this assignment — who had the asset, contact details, readings,
      notes, and photos captured at that time.
    </>
  ),
  howToUse: (
    <>
      Open an entry from {uiLabel('Activity history')} (check-out or return). Review the fields below; tap a
      photo thumbnail to view it full size.
    </>
  ),
  behavior: (
    <>
      {uiLabel('Performed by')} shows the user who recorded the action in MK Hub. Check-out and return sections
      appear when both apply to the same assignment.
    </>
  ),
  actions: (
    <>
      {uiLabel('Close')} dismisses this window and returns to the activity list.
    </>
  ),
});

export const fleetHistoryAuditChangeQuickInfo = formModalQuickInfo({
  purpose: (
    <>
      See exactly what changed on this asset or related record — field-by-field before and after values from the
      audit log.
    </>
  ),
  howToUse: (
    <>
      Open a {uiLabel('Change')} row from {uiLabel('Activity history')}. The summary at the top describes the
      event; the table lists each field that changed.
    </>
  ),
  behavior: (
    <>
      Deletions may only show a summary. When no breakdown is available, expand {uiLabel('Technical payload')} for
      raw audit data.
    </>
  ),
  actions: (
    <>
      {uiLabel('Close')} dismisses this window and returns to the activity list.
    </>
  ),
});
