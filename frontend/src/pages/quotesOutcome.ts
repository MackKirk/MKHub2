export type QuoteOutcomeStatus = 'pending' | 'successful' | 'not_successful';

export type QuoteLostReason =
  | 'price'
  | 'competitor'
  | 'timing'
  | 'scope'
  | 'no_response'
  | 'other';

export const QUOTE_OUTCOME_STATUSES: QuoteOutcomeStatus[] = [
  'pending',
  'successful',
  'not_successful',
];

export const QUOTE_OUTCOME_LABELS: Record<QuoteOutcomeStatus, string> = {
  pending: 'Pending',
  successful: 'Successful',
  not_successful: 'Not successful',
};

export const QUOTE_LOST_REASONS: { value: QuoteLostReason; label: string }[] = [
  { value: 'price', label: 'Price' },
  { value: 'competitor', label: 'Competitor' },
  { value: 'timing', label: 'Timing' },
  { value: 'scope', label: 'Scope' },
  { value: 'no_response', label: 'No response' },
  { value: 'other', label: 'Other' },
];

export const QUOTE_LOST_REASON_LABELS: Record<QuoteLostReason, string> = Object.fromEntries(
  QUOTE_LOST_REASONS.map((r) => [r.value, r.label]),
) as Record<QuoteLostReason, string>;

export function parseQuoteOutcomeStatus(raw?: string | null): QuoteOutcomeStatus {
  if (raw === 'successful' || raw === 'not_successful' || raw === 'pending') return raw;
  return 'pending';
}

export function formatWinRate(rate: number | null | undefined): string {
  if (rate == null || Number.isNaN(rate)) return '—';
  return `${Math.round(rate * 100)}%`;
}
