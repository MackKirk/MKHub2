import { forwardRef } from 'react';
import { Calendar, Eye, FileText, PenLine, Shield } from 'lucide-react';
import { AppButton, uiCx } from '@/components/ui';
import {
  daysOverdueLabel,
  formatDueDate,
  getCardVariant,
  sourceLabel,
  type SignatureInboxItem,
} from './signatureInboxUtils';

type SignatureInboxCardProps = {
  item: SignatureInboxItem;
  onPreview?: () => void;
  onSign?: () => void;
  onViewPdf?: () => void;
  compact?: boolean;
};

const variantStyles = {
  overdue: {
    border: 'border-l-red-500',
    iconTile: 'bg-red-50 text-red-600',
    badge: 'bg-red-600 text-white',
    badgeLabel: 'OVERDUE',
    dueText: 'text-red-700',
    signClass: '',
  },
  your_turn: {
    border: 'border-l-amber-400',
    iconTile: 'bg-amber-50 text-amber-600',
    badge: 'bg-amber-100 text-amber-800',
    badgeLabel: 'YOUR TURN',
    dueText: 'text-gray-600',
    signClass: '',
  },
  waiting: {
    border: 'border-l-gray-300',
    iconTile: 'bg-gray-100 text-gray-500',
    badge: 'bg-gray-100 text-gray-600',
    badgeLabel: 'WAITING',
    dueText: 'text-gray-600',
    signClass: '',
  },
  signed: {
    border: 'border-l-green-500',
    iconTile: 'bg-green-50 text-green-600',
    badge: 'bg-green-100 text-green-800',
    badgeLabel: 'SIGNED',
    dueText: 'text-gray-600',
    signClass: '',
  },
  cancelled: {
    border: 'border-l-gray-300',
    iconTile: 'bg-gray-100 text-gray-500',
    badge: 'bg-gray-100 text-gray-600',
    badgeLabel: 'CANCELLED',
    dueText: 'text-gray-600',
    signClass: '',
  },
} as const;

const SignatureInboxCard = forwardRef<HTMLElement, SignatureInboxCardProps>(function SignatureInboxCard(
  { item, onPreview, onSign, onViewPdf, compact = false },
  ref,
) {
  const variant = getCardVariant(item);
  const styles = variantStyles[variant];
  const dueDate = formatDueDate(item.deadline_at);
  const overdueLabel = item.is_overdue ? daysOverdueLabel(item.deadline_at) : null;
  const sentBy = item.requested_by_name ? `Sent by ${item.requested_by_name}` : null;
  const metaParts = [sourceLabel(item), sentBy].filter(Boolean);

  const showPreview =
    item.status === 'action_required' ||
    (item.status === 'waiting' && item.source === 'document_builder');
  const showSign = item.status === 'action_required';
  const showViewPdf =
    item.status === 'signed' &&
    !!item.signed_file_id &&
    (item.source === 'document_builder' || item.source === 'onboarding');

  return (
    <article
      ref={ref}
      id={`signature-item-${item.source}-${item.id}`}
      className={uiCx(
        'flex flex-col gap-4 rounded-xl border border-gray-200 bg-white shadow-sm sm:flex-row sm:items-center sm:justify-between',
        'border-l-4',
        styles.border,
        compact ? 'p-3' : 'p-4 sm:p-5',
      )}
    >
      <div className="flex min-w-0 flex-1 gap-3 sm:gap-4">
        <div
          className={uiCx(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
            styles.iconTile,
          )}
        >
          <FileText className="h-5 w-5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-gray-900">{item.title || 'Document'}</h3>
            <span
              className={uiCx(
                'inline-flex shrink-0 rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
                styles.badge,
              )}
            >
              {styles.badgeLabel}
            </span>
          </div>
          {metaParts.length > 0 ? (
            <p className="mt-1 text-sm text-gray-500">{metaParts.join(' • ')}</p>
          ) : null}
          {item.subject_label ? (
            <p className="mt-1 text-xs text-gray-500">Related to onboarding of {item.subject_label}</p>
          ) : null}
          {dueDate ? (
            <p className={uiCx('mt-2 flex flex-wrap items-center gap-1.5 text-sm', styles.dueText)}>
              <Calendar className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>
                Due {dueDate}
                {overdueLabel ? ` • ${overdueLabel}` : ''}
              </span>
            </p>
          ) : null}
          {item.is_access_blocker ? (
            <p className="mt-1.5 flex items-center gap-1.5 text-sm font-medium text-red-700">
              <Shield className="h-3.5 w-3.5 shrink-0" aria-hidden />
              Required to restore Hub access
            </p>
          ) : null}
          {item.user_message && item.status === 'action_required' && !compact ? (
            <p className="mt-2 line-clamp-2 text-xs text-gray-500">{item.user_message}</p>
          ) : null}
        </div>
      </div>

      {(showPreview || showSign || showViewPdf) && (
        <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
          {showPreview && onPreview ? (
            <AppButton variant="secondary" leftIcon={<Eye className="h-4 w-4" />} onClick={onPreview}>
              Preview
            </AppButton>
          ) : null}
          {showSign && onSign ? (
            <AppButton
              variant="primary"
              leftIcon={<PenLine className="h-4 w-4" />}
              className={styles.signClass || undefined}
              onClick={onSign}
            >
              Sign document
            </AppButton>
          ) : null}
          {showViewPdf && onViewPdf ? (
            <AppButton variant="secondary" onClick={onViewPdf}>
              View PDF
            </AppButton>
          ) : null}
        </div>
      )}
    </article>
  );
});

export default SignatureInboxCard;
