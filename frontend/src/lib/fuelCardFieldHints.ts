/** fieldHint strings for fuel card create/edit forms. */
export const FUEL_CARD_FIELD_HINTS = {
  card_number: 'Card #\n\nThe number printed on the fuel card.',
  pin: 'PIN #\n\nThe PIN used at the pump for this fuel card.',
  date_issued: 'Date card issued\n\nWhen this fuel card was issued.',
  crew: 'Crew\n\nDivision or crew this fuel card belongs to (e.g. Metal, Flat, Repairs).',
  status: 'Status\n\nActive cards can be assigned. Cancelled, replaced, or lost cards stay in history.',
  notes: 'Notes\n\nOptional internal notes about use or limits.',
  assign_employee: 'Employee\n\nThe team member who will physically hold this fuel card.',
  assign_reason: 'Reason\n\nOptional reason for assigning this card (e.g. job, travel, spare).',
  assign_notes: 'Notes\n\nOptional context for this assignment (e.g. project, vehicle, or travel).',
  assign_attachments: 'Attachments\n\nOptional photos or documents recorded with this assignment.',
  return_reason: 'Reason\n\nOptional reason for returning this card (e.g. end of job, spare again).',
  return_notes:
    'Notes\n\nOptional notes about the return (e.g. card received at the office or handoff details).',
  return_attachments: 'Attachments\n\nOptional photos or documents recorded with this return.',
} as const;
