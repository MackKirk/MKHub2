import { AppBadge } from '@/components/ui';
import {
  parseQuoteOutcomeStatus,
  QUOTE_OUTCOME_LABELS,
  type QuoteOutcomeStatus,
} from '@/pages/quotesOutcome';

const variantByStatus: Record<QuoteOutcomeStatus, 'neutral' | 'success' | 'danger'> = {
  pending: 'neutral',
  successful: 'success',
  not_successful: 'danger',
};

export function QuoteOutcomeBadge({
  status,
  className,
}: {
  status?: string | null;
  className?: string;
}) {
  const parsed = parseQuoteOutcomeStatus(status);
  return (
    <AppBadge variant={variantByStatus[parsed]} className={className}>
      {QUOTE_OUTCOME_LABELS[parsed]}
    </AppBadge>
  );
}
