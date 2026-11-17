import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ClipboardList, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import LoadingOverlay from '@/components/LoadingOverlay';
import {
  AppBadge,
  AppCard,
  AppEmptyState,
  AppInput,
  AppPageHeader,
  AppQuickFilterRow,
  AppSelect,
  uiCx,
  uiSpacing,
  uiTypography,
} from '@/components/ui';
import { useNavigateBack } from '@/hooks/useNavigateBack';
import { api } from '@/lib/api';
import { formatDateLocal } from '@/lib/dateUtils';
import { listPageSizeSelectOptions, parseListPageLimit } from '@/lib/listPagination';
import type { FieldworkInboxResponse } from '@/types/fieldwork';

type StatusFilter = 'pending' | 'changes_requested' | 'approved' | 'draft' | 'all';

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'pending', label: 'Pending review' },
  { value: 'changes_requested', label: 'Changes requested' },
  { value: 'approved', label: 'Approved' },
  { value: 'draft', label: 'Draft' },
  { value: 'all', label: 'All' },
];

function kindLabel(kind: string | null | undefined): string {
  const k = (kind || '').toLowerCase();
  if (k === 'site_assessment') return 'Site Assessment';
  if (k === 'work_report') return 'Work Report';
  return kind || 'Field report';
}

function statusBadge(status: string | null | undefined, pendingReview?: boolean) {
  const st = (status || '').toLowerCase();
  if (st === 'approved') return <AppBadge variant="success">Approved</AppBadge>;
  if (st === 'submitted' || pendingReview) return <AppBadge variant="warning">Pending review</AppBadge>;
  if (st === 'changes_requested') return <AppBadge variant="danger">Changes requested</AppBadge>;
  if (st === 'superseded') return <AppBadge variant="neutral">Superseded</AppBadge>;
  return <AppBadge variant="neutral">Draft</AppBadge>;
}

function fmtWhen(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return formatDateLocal(new Date(iso));
  } catch {
    return '—';
  }
}

export default function FieldReportsPage() {
  const navigateBack = useNavigateBack('/rm-business');
  const [searchParams, setSearchParams] = useSearchParams();
  const queryParam = searchParams.get('q') || '';
  const [q, setQ] = useState(queryParam);
  const [debouncedQ, setDebouncedQ] = useState(queryParam);

  const rawStatus = searchParams.get('status') || 'pending';
  const status: StatusFilter = STATUS_FILTERS.some((s) => s.value === rawStatus)
    ? (rawStatus as StatusFilter)
    : 'pending';
  const kind = searchParams.get('kind') || '';
  const page = Number(searchParams.get('page') || '1') || 1;
  const limit = parseListPageLimit(searchParams.get('limit'));

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQ(q), 350);
    return () => clearTimeout(timer);
  }, [q]);

  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    const currentQ = params.get('q') || '';
    if (debouncedQ === currentQ) return;
    if (debouncedQ) params.set('q', debouncedQ);
    else params.delete('q');
    params.set('page', '1');
    setSearchParams(params, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQ]);

  useEffect(() => {
    const urlQ = searchParams.get('q') || '';
    if (urlQ !== q) setQ(urlQ);
    if (urlQ !== debouncedQ) setDebouncedQ(urlQ);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const setStatus = (next: string) => {
    const params = new URLSearchParams(searchParams);
    params.set('status', next);
    params.set('page', '1');
    setSearchParams(params, { replace: true });
  };

  const setKind = (next: string) => {
    const params = new URLSearchParams(searchParams);
    if (next) params.set('kind', next);
    else params.delete('kind');
    params.set('page', '1');
    setSearchParams(params, { replace: true });
  };

  const qs = useMemo(() => {
    const params = new URLSearchParams();
    if (debouncedQ) params.set('q', debouncedQ);
    if (status && status !== 'all') params.set('status', status);
    if (kind) params.set('kind', kind);
    params.set('page', String(page));
    params.set('limit', String(limit));
    return `?${params.toString()}`;
  }, [debouncedQ, status, kind, page, limit]);

  const { data, isLoading, isFetching, isError, error } = useQuery({
    queryKey: ['fieldwork-inbox', qs],
    queryFn: () => api<FieldworkInboxResponse>('GET', `/fieldwork/records${qs}`),
    placeholderData: keepPreviousData,
  });

  const items = data?.items || [];
  const totalCount = data?.total ?? 0;
  const counts = data?.counts || {};
  const currentPage = data?.page ?? page;
  const limitPage = data?.limit ?? limit;
  const totalPages = Math.max(1, Math.ceil(totalCount / limitPage));
  const listPageSizeOptions = useMemo(() => listPageSizeSelectOptions(), []);
  const isInitialLoading = isLoading && !data;

  const filterSegments = STATUS_FILTERS.map((s) => {
    const countKey =
      s.value === 'pending'
        ? 'pending'
        : s.value === 'all'
          ? 'all'
          : s.value;
    const count = counts[countKey as keyof typeof counts];
    return {
      key: s.value,
      label: s.label,
      active: status === s.value,
      count: typeof count === 'number' ? count : undefined,
      onClick: () => setStatus(s.value),
    };
  });

  return (
    <div className={uiCx('w-full min-w-0', uiSpacing.pageStack, 'min-h-full bg-gray-50')}>
      <AppPageHeader
        title="Field Reports"
        subtitle="Review queue for Site Assessments and Work Reports across R&M projects"
        onBack={navigateBack}
      />

      <AppCard bodyClassName={uiCx(uiSpacing.cardPadding, 'space-y-3')}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0 flex-1 max-w-xl">
            <AppInput
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search project, code, or address…"
              leftIcon={<Search className="h-4 w-4" />}
              aria-label="Search field reports"
            />
          </div>
          <div className="w-full sm:w-56">
            <AppSelect
              label="Report type"
              value={kind}
              onChange={(e) => setKind(e.target.value)}
              options={[
                { value: '', label: 'All types' },
                { value: 'site_assessment', label: 'Site Assessment' },
                { value: 'work_report', label: 'Work Report' },
              ]}
            />
          </div>
        </div>
        <AppQuickFilterRow segments={filterSegments} label="Status:" />
      </AppCard>

      <div className="relative">
        {(isFetching || isInitialLoading) && <LoadingOverlay />}
        <AppCard bodyClassName="!p-0 overflow-hidden">
          {isError ? (
            <div className={uiCx(uiSpacing.cardPadding)}>
              <p className="text-sm text-red-700">
                Could not load field reports.
                {error instanceof Error ? ` ${error.message}` : ''}
              </p>
            </div>
          ) : items.length === 0 && !isInitialLoading ? (
            <div className={uiCx(uiSpacing.cardPadding)}>
              <AppEmptyState
                title={status === 'pending' ? 'No reports waiting for review' : 'No field reports found'}
                description={
                  status === 'pending'
                    ? 'When technicians submit a report, it will show up here.'
                    : 'Try another status filter or search.'
                }
                className="border-0 bg-transparent p-0 shadow-none"
              />
            </div>
          ) : (
            <ul className="divide-y divide-gray-100 list-none">
              {items.map((row) => {
                const reviewPath = `/rm-field-reports/${row.project_id}/${row.id}`;
                const photos = Number(row.photo_count || 0);
                return (
                  <li key={row.id}>
                    <Link
                      to={reviewPath}
                      className="flex items-start justify-between gap-3 px-4 py-3.5 hover:bg-white transition-colors"
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-gray-900">{kindLabel(row.kind)}</span>
                          {statusBadge(row.status, row.pending_review)}
                          {row.version > 1 ? (
                            <span className="text-xs text-gray-500">v{row.version}</span>
                          ) : null}
                        </div>
                        <p className="text-sm font-medium text-gray-800 truncate">
                          {row.project_name || 'Project'}
                          {row.project_code ? (
                            <span className="text-gray-500 font-normal"> · {row.project_code}</span>
                          ) : null}
                        </p>
                        {row.project_address ? (
                          <p className={uiCx(uiTypography.helper, 'truncate')}>{row.project_address}</p>
                        ) : null}
                        <p className={uiTypography.helper}>
                          Submitted {fmtWhen(row.submitted_at)} by {row.submitted_by_name || row.created_by_name || '—'}
                          {photos > 0 ? ` · ${photos} photo${photos === 1 ? '' : 's'}` : ''}
                          {row.is_bidding ? ' · Opportunity' : ''}
                        </p>
                      </div>
                      <ClipboardList className="h-5 w-5 text-gray-400 shrink-0 mt-1" aria-hidden />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </AppCard>
      </div>

      {totalCount > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className={uiTypography.helper}>
            {totalCount} report{totalCount === 1 ? '' : 's'} · page {currentPage} of {totalPages}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <AppSelect
              value={String(limitPage)}
              onChange={(e) => {
                const params = new URLSearchParams(searchParams);
                params.set('limit', e.target.value);
                params.set('page', '1');
                setSearchParams(params, { replace: true });
              }}
              options={listPageSizeOptions}
              aria-label="Page size"
            />
            <button
              type="button"
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm disabled:opacity-40"
              disabled={currentPage <= 1}
              onClick={() => {
                const params = new URLSearchParams(searchParams);
                params.set('page', String(Math.max(1, currentPage - 1)));
                setSearchParams(params, { replace: true });
              }}
            >
              Previous
            </button>
            <button
              type="button"
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm disabled:opacity-40"
              disabled={currentPage >= totalPages}
              onClick={() => {
                const params = new URLSearchParams(searchParams);
                params.set('page', String(currentPage + 1));
                setSearchParams(params, { replace: true });
              }}
            >
              Next
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
