/** fieldHint strings for fuel card create/edit forms. */
export const FUEL_CARD_FIELD_HINTS = {
  card_number: 'Card #\n\nThe number printed on the fuel card.',
  pin: 'PIN #\n\nThe PIN used at the pump for this fuel card.',
  date_issued: 'Date card issued\n\nWhen this fuel card was issued.',
  status: 'Status\n\nActive cards can be assigned. Cancelled, replaced, or lost cards stay in history.',
  notes: 'Notes\n\nOptional internal notes about use or limits.',
  assign_employee: 'Employee\n\nThe team member who will physically hold this fuel card.',
  assign_notes: 'Notes\n\nOptional context for this assignment (e.g. project, vehicle, or travel).',
  return_notes:
    'Notes\n\nOptional notes about the return (e.g. card received at the office or handoff details).',
} as const;
