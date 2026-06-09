/** fieldHint strings for corporate card create/edit forms. */
export const COMPANY_CREDIT_CARD_FIELD_HINTS = {
  label: 'Internal label\n\nShort name used in lists and search (e.g. Marketing fuel card).',
  status: 'Status\n\nActive cards can be assigned. Cancelled, replaced, or lost cards stay in history.',
  network: 'Network\n\nCard brand: Visa, Mastercard, Amex, or Other.',
  last_four:
    'Last four digits\n\nExactly 4 digits. Never store full card number, CVV, or PIN in MKHub.',
  expiry_month: 'Expiry month\n\nCalendar month when the card expires (1–12).',
  expiry_year: 'Expiry year\n\nFour-digit expiry year on the card.',
  cardholder_name: 'Name on card\n\nCardholder name as printed on the card (optional).',
  issuer: 'Issuer / bank\n\nIssuing bank or financial institution (optional).',
  billing_entity: 'Billing entity\n\nCompany entity billed for this card (optional).',
  notes: 'Notes\n\nOptional internal notes about use or limits.',
  assign_employee: 'Employee\n\nThe team member who will physically hold this corporate card.',
  assign_notes: 'Notes\n\nOptional context for this assignment (e.g. project, vehicle, or travel).',
  return_notes:
    'Notes\n\nOptional notes about the return (e.g. card received at the office or handoff details).',
} as const;
