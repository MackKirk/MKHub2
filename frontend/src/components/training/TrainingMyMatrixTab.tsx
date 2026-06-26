import { useMemo } from 'react';
import {
  formatStatusLabel,
  matrixCellTone,
  type HrTrainingRecord,
} from '@/lib/trainingPersonalUtils';
import type { MatrixSnapshotItem } from '@/hooks/useMyTrainingData';
import {
  AppBadge,
  AppCard,
  AppEmptyState,
  AppSectionHeader,
  AppTable,
  AppTooltip,
  appSectionPresetProps,
  uiTypography,
} from '@/components/ui';

function toneDotClass(tone: ReturnType<typeof matrixCellTone>) {
  if (tone === 'green') return 'bg-emerald-500 shadow-emerald-500/30';
  if (tone === 'yellow') return 'bg-amber-400 shadow-amber-400/35';
  if (tone === 'red') return 'bg-red-500 shadow-red-500/30';
  return 'bg-gray-200';
}

function statusFromTone(tone: ReturnType<typeof matrixCellTone>, record: HrTrainingRecord | null) {
  if (!record) return <AppBadge variant="neutral">Missing</AppBadge>;
  if (tone === 'red') return <AppBadge variant="danger">Expired / overdue</AppBadge>;
  if (tone === 'yellow') {
    const st = (record.status || '').toLowerCase();
    if (st === 'scheduled' || st === 'in_progress') {
      return <AppBadge variant="warning">{formatStatusLabel(record.status)}</AppBadge>;
    }
    return <AppBadge variant="warning">Expiring soon</AppBadge>;
  }
  return <AppBadge variant="success">Current</AppBadge>;
}

function fmt(s: string | null | undefined) {
  return s ? String(s).slice(0, 10) : '—';
}

type Props = {
  matrixItems: MatrixSnapshotItem[];
  isLoading?: boolean;
};

export default function TrainingMyMatrixTab({ matrixItems, isLoading }: Props) {
  const rows = useMemo(
    () =>
      matrixItems.map((item) => {
        const record = item.record;
        const tone = matrixCellTone(record);
        const taken = record?.completion_date || record?.start_date || '';
        const exp = record?.expiry_date || '';
        const tooltip = [`Date taken: ${fmt(taken)}`, `Expires: ${fmt(exp)}`].join('\n');

        return [
          <div key={`slot-${item.id}`} className="flex items-center gap-2">
            {tone ? (
              <AppTooltip content={tooltip} wrap>
                <span
                  className={`inline-block h-3.5 w-3.5 shrink-0 rounded-full ${toneDotClass(tone)} shadow-md ring-1 ring-black/5`}
                  aria-hidden
                />
              </AppTooltip>
            ) : (
              <span className="inline-block h-3.5 w-3.5 shrink-0 rounded-full bg-gray-200" aria-hidden />
            )}
            <span className="text-sm font-medium text-gray-900">{item.label}</span>
          </div>,
          statusFromTone(tone, record),
          fmt(record?.completion_date),
          fmt(record?.expiry_date),
          item.display || '—',
        ];
      }),
    [matrixItems],
  );

  if (isLoading) {
    return <div className="h-40 animate-pulse rounded-xl bg-gray-100" />;
  }

  return (
    <AppCard bodyClassName="space-y-4">
      <AppSectionHeader
        title="My training matrix"
        description="Standard compliance checklist for your role. Green = current, yellow = expiring or in progress, red = expired or missing."
        {...appSectionPresetProps('workload')}
      />
      {matrixItems.length === 0 ? (
        <AppEmptyState
          title="No matrix slots configured"
          description="Your organization has not defined standard training requirements yet."
        />
      ) : (
        <>
          <div className={uiTypography.helper}>
            {matrixItems.filter((i) => i.record).length} of {matrixItems.length} slots covered
          </div>
          <AppTable
            columns={['Slot', 'Status', 'Completed', 'Expires', 'Display']}
            rows={rows}
          />
        </>
      )}
    </AppCard>
  );
}
