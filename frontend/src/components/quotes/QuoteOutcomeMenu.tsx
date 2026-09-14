import { MoreHorizontal } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { AppButton, uiBorders, uiCx, uiRadius, uiShadows } from '@/components/ui';
import { QUOTE_OUTCOME_LABELS, type QuoteOutcomeStatus } from '@/pages/quotesOutcome';

type Props = {
  currentStatus?: string | null;
  disabled?: boolean;
  onSelect: (status: QuoteOutcomeStatus) => void;
};

export function QuoteOutcomeMenu({ currentStatus, disabled, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const options: QuoteOutcomeStatus[] = ['successful', 'not_successful', 'pending'];

  return (
    <div ref={rootRef} className="relative inline-flex">
      <AppButton
        type="button"
        variant="ghost"
        size="sm"
        className="!px-1.5"
        disabled={disabled}
        title="Mark outcome"
        aria-label="Mark outcome"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <MoreHorizontal className="h-4 w-4" />
      </AppButton>
      {open && (
        <div
          className={uiCx(
            'absolute right-0 top-full z-30 mt-1 min-w-[160px] overflow-hidden bg-white py-1',
            uiRadius.control,
            uiBorders.subtle,
            uiShadows.elevated,
          )}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          {options.map((status) => (
            <button
              key={status}
              type="button"
              className={uiCx(
                'block w-full px-3 py-1.5 text-left text-xs hover:bg-gray-50',
                currentStatus === status ? 'font-semibold text-brand-red' : 'text-gray-700',
              )}
              onClick={() => {
                setOpen(false);
                onSelect(status);
              }}
            >
              {status === 'pending' ? 'Reopen (pending)' : `Mark ${QUOTE_OUTCOME_LABELS[status].toLowerCase()}`}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
