import { useNavigate, useSearchParams } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import {
  AppButton,
  AppClientSelect,
  AppFormModal,
  uiCx,
  uiLayout,
  uiSpacing,
} from '@/components/ui';

export default function QuoteNew() {
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const initialClientId = sp.get('client_id') || '';

  const [clientId, setClientId] = useState<string>(initialClientId);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: nextCode } = useQuery({
    queryKey: ['quoteCode', clientId],
    queryFn: () =>
      clientId
        ? api<any>('GET', `/quotes/next-code?client_id=${encodeURIComponent(clientId)}`)
        : Promise.resolve(null),
    enabled: !!clientId,
  });

  useEffect(() => {
    if (initialClientId) {
      setClientId(initialClientId);
    }
  }, [initialClientId]);

  const canSubmit = useMemo(() => String(clientId || '').trim().length > 0, [clientId]);

  const submit = async () => {
    if (!canSubmit || isSubmitting) return;
    try {
      setIsSubmitting(true);
      const code = nextCode?.order_number || '';
      const payload: Record<string, string> = {
        client_id: clientId,
        code,
        order_number: code,
      };
      const quote: { id?: string } = await api('POST', '/quotes', payload);
      toast.success('Quote created');
      nav(`/quotes/${encodeURIComponent(String(quote?.id || ''))}`);
    } catch (_e) {
      toast.error('Failed to create quote');
      setIsSubmitting(false);
    }
  };

  return (
    <AppFormModal
      open
      onClose={() => nav(-1)}
      title="New Quote"
      description="Select customer to create quote"
      formWidth="comfortable"
      quickInfo={
        <>
          <p>Pick the customer this quotation belongs to.</p>
          <p>After you create it, you can add line items and details on the quote page.</p>
        </>
      }
      footer={
        <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
          <AppButton
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => nav(-1)}
            disabled={isSubmitting}
          >
            Cancel
          </AppButton>
          <AppButton
            type="button"
            size="sm"
            disabled={!canSubmit || isSubmitting}
            loading={isSubmitting}
            onClick={submit}
          >
            {isSubmitting ? 'Creating…' : 'Create Quote'}
          </AppButton>
        </div>
      }
    >
      <div className={uiSpacing.sectionStack}>
        <AppClientSelect
          label="Customer *"
          value={clientId}
          onChange={setClientId}
          disabled={!!initialClientId}
          placeholder="Search or select customer…"
          emptyMessage="No customers found."
          fieldHint="Customer\n\nThe customer this quotation is for. Required before creating the quote."
        />
      </div>
    </AppFormModal>
  );
}
