import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { AppButton, AppModal, AppSelect, AppTextarea } from '@/components/ui';
import {
  parseQuoteOutcomeStatus,
  QUOTE_LOST_REASONS,
  QUOTE_OUTCOME_LABELS,
  type QuoteLostReason,
  type QuoteOutcomeStatus,
} from '@/pages/quotesOutcome';

type OutcomeTarget = {
  id: string;
  outcome_status?: string | null;
  outcome_note?: string | null;
  lost_reason?: string | null;
};

type Props = {
  open: boolean;
  quote: OutcomeTarget | null;
  /** When opening for a specific action; if omitted, modal uses current status. */
  initialStatus?: QuoteOutcomeStatus;
  onClose: () => void;
};

export function QuoteOutcomeModal({ open, quote, initialStatus, onClose }: Props) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<QuoteOutcomeStatus>('pending');
  const [lostReason, setLostReason] = useState<QuoteLostReason>('other');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!open || !quote) return;
    setStatus(initialStatus ?? parseQuoteOutcomeStatus(quote.outcome_status));
    setLostReason((quote.lost_reason as QuoteLostReason) || 'other');
    setNote(quote.outcome_note || '');
  }, [open, quote, initialStatus]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!quote?.id) throw new Error('Missing quote');
      return api('POST', `/quotes/${encodeURIComponent(quote.id)}/outcome`, {
        status,
        note: note.trim() || null,
        lost_reason: status === 'not_successful' ? lostReason : null,
      });
    },
    onSuccess: () => {
      toast.success(`Marked as ${QUOTE_OUTCOME_LABELS[status].toLowerCase()}`);
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
      queryClient.invalidateQueries({ queryKey: ['quotes-insights'] });
      if (quote?.id) {
        queryClient.invalidateQueries({ queryKey: ['quote', quote.id] });
      }
      onClose();
    },
    onError: (err: any) => {
      toast.error(err?.message || 'Failed to update outcome');
    },
  });

  return (
    <AppModal
      open={open && !!quote}
      onClose={onClose}
      size="sm"
      title="Quote outcome"
      description="Track whether this quotation was successful."
      footer={
        <div className="flex justify-end gap-2">
          <AppButton type="button" variant="secondary" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </AppButton>
          <AppButton
            type="button"
            variant="primary"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? 'Saving…' : 'Save'}
          </AppButton>
        </div>
      }
    >
      <div className="space-y-3">
        <AppSelect
          label="Outcome"
          value={status}
          onChange={(e) => setStatus(e.target.value as QuoteOutcomeStatus)}
          options={[
            { value: 'pending', label: QUOTE_OUTCOME_LABELS.pending },
            { value: 'successful', label: QUOTE_OUTCOME_LABELS.successful },
            { value: 'not_successful', label: QUOTE_OUTCOME_LABELS.not_successful },
          ]}
        />

        {status === 'not_successful' && (
          <AppSelect
            label="Reason"
            value={lostReason}
            onChange={(e) => setLostReason(e.target.value as QuoteLostReason)}
            options={QUOTE_LOST_REASONS}
          />
        )}

        <AppTextarea
          label="Note (optional)"
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Context for the team…"
        />
      </div>
    </AppModal>
  );
}
