import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import FuelCardListNewModal from '@/components/companyAssets/FuelCardListNewModal';
import { Fuel, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDateLocal, parseApiDateForDisplay } from '@/lib/dateUtils';
import {
  formatFuelCardStatus,
  getFuelCardCustodyBadgeVariant,
  getFuelCardStatusBadgeVariant,
} from '@/lib/fuelCardUi';
import LoadingOverlay from '@/components/LoadingOverlay';
import {
  AppBadge,
  AppButton,
  AppCard,
  AppEmptyState,
  AppInput,
  AppListCreateItem,
  AppPageHeader,
  AppSelect,
  uiBorders,
  uiCx,
  uiLayout,
  uiShadows,
  uiSpacing,
  uiTypography,
} from '@/components/ui';

type CardRow = {
  id: string;
  card_number: string;
  pin: string;
  date_issued?: string | null;
  crew?: string | null;
  status: string;
  notes?: string | null;
  assigned_to_name?: string | null;
};

type ListResponse = {
  items: CardRow[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
};

type SortColumn = 'card_number' | 'date_issued' | 'crew' | 'status';

const STATUS_FILTER_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'replaced', label: 'Replaced' },
  { value: 'lost', label: 'Lost' },
];

function formatDateIssued(dateIssued?: string | null): string {
  if (!dateIssued) return '\u2014';
  const d = parseApiDateForDisplay(dateIssued);
  return d ? formatDateLocal(d) : '\u2014';
}

function SortHeader({
  label,
  column,
  sortBy,
  sortDir,
  onSort,
}: {
  label: string;
  column: SortColumn;
  sortBy: SortColumn;
  sortDir: 'asc' | 'desc';
  onSort: (column: SortColumn) => void;
}) {
  const active = sortBy === column;
  return (
    <th className="px-3 py-2 text-left" scope="col">
      <button
        type="button"
        onClick={() => onSort(column)}
        className={uiCx(
          uiTypography.controlLabel,
          'flex items-center gap-1 rounded py-0.5 hover:text-gray-900 focus:outline-none',
        )}
      >
        {label}
        {active ? (sortDir === 'asc' ? ' ↑' : ' ↓') : null}
      </button>
    </th>
  );
}

export default function FuelCardsList() {
  const nav = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [showNewCardModal, setShowNewCardModal] = useState(false);

  const search = searchParams.get('search') ?? '';
  const statusParam = searchParams.get('status') ?? '';
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
  const limit = 25;

  const validSorts: SortColumn[] = ['card_number', 'date_issued', 'crew', 'status'];
  const rawSort = searchParams.get('sort');
  const sortBy: SortColumn =
    rawSort && validSorts.includes(rawSort as SortColumn) ? (rawSort as SortColumn) : 'card_number';
  const sortDir = (searchParams.get('dir') === 'desc' ? 'desc' : 'asc') as 'asc' | 'desc';

  const setListSort = (column: SortColumn) => {
    const params = new URLSearchParams(searchParams);
    const nextDir = sortBy === column && sortDir === 'asc' ? 'desc' : 'asc';
    params.set('sort', column);
    params.set('dir', nextDir);
    params.set('page', '1');
    setSearchParams(params, { replace: true });
  };

  const setSearchFilter = (next: string) => {
    const params = new URLSearchParams(searchParams);
    if (next) params.set('search', next);
    else params.delete('search');
    params.set('page', '1');
    setSearchParams(params, { replace: true });
  };

  const setStatusFilter = (next: string) => {
    const params = new URLSearchParams(searchParams);
    if (next) params.set('status', next);
    else params.delete('status');
    params.set('page', '1');
    setSearchParams(params, { replace: true });
  };

  const paramsString = useMemo(() => {
    const p = new URLSearchParams();
    p.set('page', String(page));
    p.set('limit', String(limit));
    p.set('sort', sortBy);
    p.set('dir', sortDir);
    if (search.trim()) p.set('search', search.trim());
    if (statusParam) p.set('status', statusParam);
    return p.toString();
  }, [page, limit, sortBy, sortDir, search, statusParam]);

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ['fuel-cards', paramsString],
    queryFn: () => api<ListResponse>('GET', `/fuel-cards?${paramsString}`),
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.total_pages ?? 1;
  const currentPage = data?.page ?? page;

  useEffect(() => {
    if (searchParams.get('create') !== '1') return;
    setShowNewCardModal(true);
    const params = new URLSearchParams(searchParams);
    params.delete('create');
    setSearchParams(params, { replace: true });
  }, [searchParams, setSearchParams]);

  const openNewCardModal = () => setShowNewCardModal(true);

  const showEmptyList = !isLoading && !error && items.length === 0;

  const emptyTitle = useMemo(() => {
    let title = 'No fuel cards found';
    if (statusParam) title += ` (${formatFuelCardStatus(statusParam)})`;
    return title;
  }, [statusParam]);

  return (
    <div className={uiCx('w-full min-w-0 overflow-x-hidden', uiSpacing.pageStack, 'min-h-full bg-gray-50')}>
      <AppPageHeader
        title="Fuel cards"
        subtitle="Card #, PIN #, crew, and issue date — assign custody like equipment"
        icon={<Fuel className="h-4 w-4" />}
      />

      <AppCard bodyClassName={uiSpacing.cardPadding}>
        <div className={uiCx(uiLayout.actionsRow, 'flex-wrap items-end gap-3')}>
          <div className="min-w-0 flex-1">
            <AppInput
              placeholder="Search card #, crew, or notes…"
              value={search}
              onChange={(e) => setSearchFilter(e.target.value)}
              leftIcon={<Search className="h-4 w-4" />}
              aria-label="Search fuel cards"
            />
          </div>
          <div className="w-full sm:w-auto sm:min-w-[180px]">
            <AppSelect
              value={statusParam}
              onChange={(e) => setStatusFilter(e.target.value)}
              options={STATUS_FILTER_OPTIONS}
              aria-label="Filter by status"
            />
          </div>
        </div>
      </AppCard>

      {error ? (
        <AppCard className="border-red-200 bg-red-50" bodyClassName="p-4">
          <p className={uiCx(uiTypography.body, 'text-red-800')}>
            {(error as Error).message || 'Failed to load cards'}
          </p>
        </AppCard>
      ) : null}

      <LoadingOverlay isLoading={isLoading} text="Loading cards…">
        <AppCard className={uiShadows.card} bodyClassName="!p-0">
          <div className="flex flex-col">
            {showEmptyList ? (
              <div className={uiCx(uiSpacing.cardPadding, uiSpacing.sectionStack, 'min-h-[12rem] pb-10')}>
                <AppListCreateItem
                  label="New fuel card"
                  layout="row"
                  className="w-full"
                  onClick={openNewCardModal}
                />
                <AppEmptyState title={emptyTitle} className="border-0 bg-transparent p-0 shadow-none" />
              </div>
            ) : (
              <>
                <div className={uiCx(uiSpacing.cardPadding, items.length === 0 ? 'pb-10' : 'pb-3')}>
                  <AppListCreateItem
                    label="New fuel card"
                    layout="row"
                    className="w-full"
                    onClick={openNewCardModal}
                  />
                </div>
                {items.length > 0 ? (
                  <div className="min-w-0 overflow-x-auto border-t border-gray-100">
                    <table className="w-full min-w-0 border-collapse">
                      <thead className={uiCx(uiBorders.subtle, 'border-b bg-gray-50')}>
                        <tr>
                          <SortHeader
                            label="Card #"
                            column="card_number"
                            sortBy={sortBy}
                            sortDir={sortDir}
                            onSort={setListSort}
                          />
                          <SortHeader
                            label="Date issued"
                            column="date_issued"
                            sortBy={sortBy}
                            sortDir={sortDir}
                            onSort={setListSort}
                          />
                          <SortHeader
                            label="Crew"
                            column="crew"
                            sortBy={sortBy}
                            sortDir={sortDir}
                            onSort={setListSort}
                          />
                          <th className={uiCx(uiTypography.controlLabel, 'px-3 py-2 text-left')} scope="col">
                            Custody
                          </th>
                          <SortHeader
                            label="Status"
                            column="status"
                            sortBy={sortBy}
                            sortDir={sortDir}
                            onSort={setListSort}
                          />
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((row) => {
                          const inCustody = !!row.assigned_to_name;
                          return (
                            <tr
                              key={row.id}
                              className="min-h-[52px] cursor-pointer border-b border-gray-100 transition-colors last:border-b-0 hover:bg-gray-50"
                              onClick={() => nav(`/company-assets/fuel-cards/${row.id}`)}
                            >
                              <td className="px-3 py-3 align-top font-mono text-xs tracking-wider text-gray-800">
                                {row.card_number}
                              </td>
                              <td className={uiCx(uiTypography.body, 'px-3 py-3 align-top text-gray-700')}>
                                {formatDateIssued(row.date_issued)}
                              </td>
                              <td className={uiCx(uiTypography.body, 'px-3 py-3 align-top text-gray-700')}>
                                {row.crew?.trim() || '\u2014'}
                              </td>
                              <td className="min-w-0 px-3 py-3 align-top">
                                <div className="flex min-w-0 flex-col gap-0.5">
                                  <AppBadge
                                    variant={getFuelCardCustodyBadgeVariant(inCustody)}
                                    className="w-fit !normal-case"
                                  >
                                    {inCustody ? 'Assigned' : 'Available'}
                                  </AppBadge>
                                  {inCustody ? (
                                    <span className={uiCx(uiTypography.helper, 'truncate')}>
                                      {row.assigned_to_name}
                                    </span>
                                  ) : null}
                                </div>
                              </td>
                              <td className="px-3 py-3 align-top">
                                <AppBadge
                                  variant={getFuelCardStatusBadgeVariant(row.status)}
                                  className="!normal-case"
                                >
                                  {formatFuelCardStatus(row.status || '—')}
                                </AppBadge>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </>
            )}
          </div>
          {total > 0 ? (
            <div className={uiCx(uiLayout.actionsRow, 'flex-wrap justify-between gap-3 border-t border-gray-200 p-4')}>
              <p className={uiTypography.helper}>
                Showing {(currentPage - 1) * limit + 1} to {Math.min(currentPage * limit, total)} of {total} cards
              </p>
              <div className={uiCx(uiLayout.actionsRow, 'items-center')}>
                <AppButton
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={currentPage <= 1 || isFetching}
                  onClick={() => {
                    const next = new URLSearchParams(searchParams);
                    next.set('page', String(Math.max(1, currentPage - 1)));
                    setSearchParams(next);
                  }}
                >
                  Previous
                </AppButton>
                <span className={uiTypography.helper}>
                  Page {currentPage} of {totalPages}
                </span>
                <AppButton
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={currentPage >= totalPages || isFetching}
                  onClick={() => {
                    const next = new URLSearchParams(searchParams);
                    next.set('page', String(Math.min(totalPages, currentPage + 1)));
                    setSearchParams(next);
                  }}
                >
                  Next
                </AppButton>
              </div>
            </div>
          ) : null}
        </AppCard>
      </LoadingOverlay>

      <FuelCardListNewModal
        open={showNewCardModal}
        onClose={() => setShowNewCardModal(false)}
        onCreated={(data) => {
          setShowNewCardModal(false);
          queryClient.invalidateQueries({ queryKey: ['fuel-cards'] });
          nav(`/company-assets/fuel-cards/${data.id}`);
        }}
      />
    </div>
  );
}
