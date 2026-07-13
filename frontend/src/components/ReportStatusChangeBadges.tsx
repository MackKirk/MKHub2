import { AppBadge } from '@/components/ui/AppBadge';
import { getProjectStatusBadgeVariant } from '@/lib/projectUi';
import {
  getStatusChangeTransition,
  getStatusNoteOnlyLabel,
  type ReportNoteLike,
} from '@/lib/reportNotes';

type StatusColorSetting = { label?: string; value?: string };

type ReportStatusChangeBadgesProps = {
  report: ReportNoteLike;
  designSystem?: boolean;
  statusColors?: StatusColorSetting[];
  compact?: boolean;
  className?: string;
};

function statusColorForLabel(label: string, statusColors?: StatusColorSetting[]): string {
  return statusColors?.find((s) => s.label === label)?.value || '#e5e7eb';
}

function StatusLabelBadge({
  label,
  designSystem = true,
  statusColors,
  compact = false,
}: {
  label: string;
  designSystem?: boolean;
  statusColors?: StatusColorSetting[];
  compact?: boolean;
}) {
  if (designSystem) {
    return (
      <AppBadge
        variant={getProjectStatusBadgeVariant(label)}
        className={compact ? 'normal-case !text-[9px]' : 'normal-case'}
      >
        {label}
      </AppBadge>
    );
  }

  return (
    <span
      className={
        compact
          ? 'inline-block rounded px-1.5 py-0.5 text-[9px] font-medium'
          : 'inline-block rounded px-2 py-0.5 text-[10px] font-medium'
      }
      style={{
        backgroundColor: statusColorForLabel(label, statusColors),
        color: '#000',
      }}
    >
      {label}
    </span>
  );
}

export function ReportStatusChangeBadges({
  report,
  designSystem = true,
  statusColors,
  compact = false,
  className,
}: ReportStatusChangeBadgesProps) {
  const noteOnlyLabel = getStatusNoteOnlyLabel(report);
  const transition = getStatusChangeTransition(report);

  if (noteOnlyLabel) {
    return (
      <span className={className}>
        <StatusLabelBadge
          label={noteOnlyLabel}
          designSystem={designSystem}
          statusColors={statusColors}
          compact={compact}
        />
      </span>
    );
  }

  if (!transition) return null;

  const { fromLabel, toLabel } = transition;

  if (fromLabel && toLabel) {
    return (
      <span className={`inline-flex flex-wrap items-center gap-1.5 ${className || ''}`}>
        <StatusLabelBadge
          label={fromLabel}
          designSystem={designSystem}
          statusColors={statusColors}
          compact={compact}
        />
        <span className={compact ? 'text-[10px] text-gray-400' : 'text-xs text-gray-400'}>→</span>
        <StatusLabelBadge
          label={toLabel}
          designSystem={designSystem}
          statusColors={statusColors}
          compact={compact}
        />
      </span>
    );
  }

  const singleLabel = toLabel || fromLabel;
  if (!singleLabel) return null;

  return (
    <span className={className}>
      <StatusLabelBadge
        label={singleLabel}
        designSystem={designSystem}
        statusColors={statusColors}
        compact={compact}
      />
    </span>
  );
}
