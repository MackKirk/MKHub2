import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  formatRecordTypeLabel,
  formatStatusLabel,
  type HrTrainingRecord,
} from '@/lib/trainingPersonalUtils';
import {
  AppBadge,
  AppButton,
  AppCard,
  AppEmptyState,
  AppFormModal,
  AppSectionHeader,
  AppSortableEntityList,
  AppSortableEntityListFlatBody,
  AppSortableEntityListHeader,
  AppSortableEntityListRow,
  AppSortableEntityListSortColumn,
  appSectionPresetProps,
  resolveAppSortableListPreset,
  sortListByAppColumn,
  uiCx,
  uiLayout,
  uiSpacing,
  uiTypography,
  useLocalAppListSort,
} from '@/components/ui';

function TrainingDetailField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-1 border-b border-gray-100 py-3 last:border-0 sm:grid-cols-[9.5rem_minmax(0,1fr)] sm:items-start sm:gap-x-4 sm:py-2.5">
      <dt className={uiTypography.helper}>{label}</dt>
      <dd className={uiCx(uiTypography.body, 'min-w-0 break-words font-medium text-gray-900')}>{children}</dd>
    </div>
  );
}

function trainingStatusBadge(status: string | null | undefined) {
  const s = (status || '').toLowerCase();
  if (s === 'completed') return <AppBadge variant="success">Completed</AppBadge>;
  if (s === 'expired') return <AppBadge variant="neutral">Expired</AppBadge>;
  if (s === 'scheduled') return <AppBadge variant="info">Scheduled</AppBadge>;
  if (s === 'in_progress') return <AppBadge variant="warning">In progress</AppBadge>;
  return <AppBadge variant="neutral">{formatStatusLabel(status)}</AppBadge>;
}

function fmtDate(s: string | null | undefined) {
  if (!s) return '—';
  return String(s).slice(0, 10);
}

type Props = {
  userId: string;
  records: HrTrainingRecord[];
  isLoading?: boolean;
};

type SortColumn = 'type' | 'title' | 'provider' | 'start' | 'status' | 'expires';

export default function TrainingMyRecordsTab({ userId, records, isLoading }: Props) {
  const [viewing, setViewing] = useState<HrTrainingRecord | null>(null);
  const { sortBy, sortDir, setSort } = useLocalAppListSort<SortColumn>('start', 'desc');
  const preset = 'workerTrainingReadOnly';

  const sortedRows = useMemo(
    () =>
      sortListByAppColumn(records, sortBy, sortDir, {
        type: (r) => formatRecordTypeLabel(r),
        title: (r) => r.title || '',
        provider: (r) => r.provider || '',
        start: (r) => r.start_date || '',
        status: (r) => r.status || '',
        expires: (r) => r.expiry_date || '',
      }),
    [records, sortBy, sortDir],
  );

  if (isLoading) {
    return <div className="h-40 animate-pulse rounded-xl bg-gray-100" />;
  }

  return (
    <div className="space-y-4">
      <AppCard bodyClassName="space-y-4">
        <AppSectionHeader
          title="My schedule & records"
          description="In-person, external, and synced LMS training from your employee profile."
          {...appSectionPresetProps('education')}
        />
        {records.length === 0 ? (
          <AppEmptyState
            title="No training records yet"
            description="HR or your manager may add scheduled sessions and certifications to your profile."
          />
        ) : (
          <div className={uiCx('overflow-x-auto rounded-xl border bg-white', resolveAppSortableListPreset(preset).minWidth)}>
            <p className={uiCx(uiTypography.helper, 'px-4 pb-2 pt-3')}>Click a row to view details.</p>
            <AppSortableEntityList layout="flat">
              <AppSortableEntityListHeader preset={preset} variant="flat">
                <AppSortableEntityListSortColumn label="Type" column="type" sortBy={sortBy} sortDir={sortDir} onSort={setSort} />
                <AppSortableEntityListSortColumn label="Title" column="title" sortBy={sortBy} sortDir={sortDir} onSort={setSort} />
                <AppSortableEntityListSortColumn label="Provider" column="provider" sortBy={sortBy} sortDir={sortDir} onSort={setSort} />
                <AppSortableEntityListSortColumn label="Start" column="start" sortBy={sortBy} sortDir={sortDir} onSort={setSort} />
                <AppSortableEntityListSortColumn label="Status" column="status" sortBy={sortBy} sortDir={sortDir} onSort={setSort} />
                <AppSortableEntityListSortColumn label="Expires" column="expires" sortBy={sortBy} sortDir={sortDir} onSort={setSort} />
              </AppSortableEntityListHeader>
              <AppSortableEntityListFlatBody preset={preset}>
                {sortedRows.map((r) => (
                  <AppSortableEntityListRow
                    key={r.id}
                    as="div"
                    variant="flat"
                    preset={preset}
                    className="group cursor-pointer"
                    role="button"
                    tabIndex={0}
                    onClick={() => setViewing(r)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setViewing(r);
                      }
                    }}
                  >
                    <span className={uiCx(uiTypography.helper, 'min-w-0 truncate')}>{formatRecordTypeLabel(r)}</span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-bold text-gray-900 group-hover:text-brand-red">
                          {r.title}
                        </span>
                        {r.training_source === 'lms' ? <AppBadge variant="info">Internal LMS</AppBadge> : null}
                      </div>
                    </div>
                    <span className={uiCx(uiTypography.helper, 'min-w-0 truncate')}>{r.provider || '—'}</span>
                    <span className={uiCx(uiTypography.helper, 'whitespace-nowrap')}>{fmtDate(r.start_date)}</span>
                    <div className="min-w-0">{trainingStatusBadge(r.status)}</div>
                    <span className={uiCx(uiTypography.helper, 'whitespace-nowrap')}>{fmtDate(r.expiry_date)}</span>
                  </AppSortableEntityListRow>
                ))}
              </AppSortableEntityListFlatBody>
            </AppSortableEntityList>
          </div>
        )}
      </AppCard>

      <AppFormModal
        open={!!viewing}
        onClose={() => setViewing(null)}
        layout="detail"
        size="md"
        title="Training record details"
        description={viewing?.title || 'Training record'}
        bodyClassName={uiCx(uiSpacing.cardPadding, 'min-w-0')}
        footer={
          <div className={uiCx(uiLayout.actionsRow, 'w-full justify-end')}>
            <AppButton type="button" variant="secondary" size="sm" onClick={() => setViewing(null)}>
              Close
            </AppButton>
          </div>
        }
      >
        {viewing ? (
          <AppCard bodyClassName={uiCx(uiSpacing.cardPadding, 'min-w-0')}>
            <dl className="min-w-0">
              <TrainingDetailField label="Type">{formatRecordTypeLabel(viewing)}</TrainingDetailField>
              <TrainingDetailField label="Provider">{viewing.provider || '—'}</TrainingDetailField>
              <TrainingDetailField label="Category">{viewing.category || '—'}</TrainingDetailField>
              <TrainingDetailField label="Format">{viewing.delivery_format || '—'}</TrainingDetailField>
              <TrainingDetailField label="Status">{trainingStatusBadge(viewing.status)}</TrainingDetailField>
              <TrainingDetailField label="Start">{fmtDate(viewing.start_date)}</TrainingDetailField>
              <TrainingDetailField label="End">{fmtDate(viewing.end_date)}</TrainingDetailField>
              <TrainingDetailField label="Completed">{fmtDate(viewing.completion_date)}</TrainingDetailField>
              <TrainingDetailField label="Expires">{fmtDate(viewing.expiry_date)}</TrainingDetailField>
              <TrainingDetailField label="Crew">{viewing.crew || '—'}</TrainingDetailField>
              <TrainingDetailField label="Location">{viewing.location || '—'}</TrainingDetailField>
              <TrainingDetailField label="Session time">{viewing.session_time || '—'}</TrainingDetailField>
              <TrainingDetailField label="Hours">
                {viewing.duration_hours != null ? viewing.duration_hours : '—'}
              </TrainingDetailField>
              <TrainingDetailField label="Certificate #">{viewing.certificate_number || '—'}</TrainingDetailField>
              <TrainingDetailField label="Notes">{viewing.notes || '—'}</TrainingDetailField>
            </dl>
          </AppCard>
        ) : null}
      </AppFormModal>
    </div>
  );
}
