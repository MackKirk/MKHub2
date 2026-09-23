import { MoreHorizontal } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { AppButton, uiBorders, uiCx, uiRadius, uiShadows } from '@/components/ui';
import { QUOTE_OUTCOME_LABELS, type QuoteOutcomeStatus } from '@/pages/quotesOutcome';

type Props = {
  currentStatus?: string | null;
  disabled?: boolean;
  onSelect: (status: QuoteOutcomeStatus) => void;
  onDelete?: () => void;
};

const MENU_MIN_WIDTH = 176;

export function QuoteOutcomeMenu({ currentStatus, disabled, onSelect, onDelete }: Props) {
  const [open, setOpen] = useState(false);
  const [panelStyle, setPanelStyle] = useState<CSSProperties | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open) {
      setPanelStyle(null);
      return;
    }
    const update = () => {
      const el = rootRef.current;
      if (!el) {
        setPanelStyle(null);
        return;
      }
      const r = el.getBoundingClientRect();
      const top = r.bottom + 4;
      const left = Math.min(
        Math.max(8, r.right - MENU_MIN_WIDTH),
        window.innerWidth - MENU_MIN_WIDTH - 8,
      );
      setPanelStyle({
        position: 'fixed',
        zIndex: 100050,
        top,
        left,
        minWidth: MENU_MIN_WIDTH,
      });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t)) return;
      if (panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('keydown', onKey);
    };
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
        title="Quote actions"
        aria-label="Quote actions"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <MoreHorizontal className="h-4 w-4" />
      </AppButton>
      {open &&
        panelStyle != null &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={panelRef}
            style={panelStyle}
            role="menu"
            className={uiCx(
              'overflow-hidden bg-white py-1',
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
                role="menuitem"
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
            {onDelete ? (
              <>
                <div className="my-1 border-t border-gray-100" role="separator" />
                <button
                  type="button"
                  role="menuitem"
                  className="block w-full px-3 py-1.5 text-left text-xs text-red-600 hover:bg-red-50"
                  onClick={() => {
                    setOpen(false);
                    onDelete();
                  }}
                >
                  Delete quotation
                </button>
              </>
            ) : null}
          </div>,
          document.body,
        )}
    </div>
  );
}
