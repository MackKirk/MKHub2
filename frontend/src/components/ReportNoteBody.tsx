import { useMemo } from 'react';
import { sanitizeInboundEmailHtml } from '@/lib/inboundEmailHtmlSanitize';
import {
  getInboundEmailBodyHtml,
  type ReportNoteLike,
} from '@/lib/reportNotes';
import { uiCx, uiTypography } from '@/components/ui';
import './ReportNoteBody.css';

type Props = {
  report: ReportNoteLike | null | undefined;
  /** Extra class on the outer wrapper. */
  className?: string;
  /** Tighter typography for the legacy ProjectDetail panel. */
  compact?: boolean;
};

/**
 * Renders inbound-email HTML (DOMPurify) when present; otherwise plain-text description.
 * Manual notes stay plain text.
 */
export function ReportNoteBody({ report, className, compact }: Props) {
  const inboundHtml = getInboundEmailBodyHtml(report);
  const sanitized = useMemo(
    () => (inboundHtml ? sanitizeInboundEmailHtml(inboundHtml) : ''),
    [inboundHtml],
  );

  if (sanitized) {
    return (
      <div
        className={uiCx('mkhub-inbound-email-root', compact && 'mkhub-inbound-email-root--compact', className)}
        dangerouslySetInnerHTML={{ __html: sanitized }}
      />
    );
  }

  return (
    <div
      className={uiCx(
        compact ? 'text-xs text-gray-800 whitespace-pre-wrap leading-relaxed' : uiTypography.body,
        !compact && 'whitespace-pre-wrap leading-relaxed',
        className,
      )}
    >
      {report?.description || 'No description provided.'}
    </div>
  );
}
