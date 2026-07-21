<<<<<<< HEAD
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import CompanyCreditCardListNewModal from '@/components/companyAssets/CompanyCreditCardListNewModal';
import { CreditCard, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { expiryLabel, getExpiryBadgeVariant } from '@/lib/companyCreditCardExpiry';
import {
  formatCorporateCardStatus,
  getCorporateCardCustodyBadgeVariant,
  getCorporateCardStatusBadgeVariant,
} from '@/lib/companyCreditCardUi';
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
  label: string;
  network: string;
  last_four: string;
  expiry_month: number;
  expiry_year: number;
  status: string;
  assigned_to_name?: string | null;
};

type ListResponse = {
  items: CardRow[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
};

const NETWORK_LABEL: Record<string, string> = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  amex: 'Amex',
  other: 'Other',
};

type SortColumn = 'label' | 'expiry' | 'status';

const STATUS_FILTER_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'replaced', label: 'Replaced' },
  { value: 'lost', label: 'Lost' },
];

function SortHeader({
  label,
  column,
  sortBy,
  sortDir,
  onSort,
}: {
  label: string;
  column: SortColumn;
  sortBy: SortColumn | null;
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

export default function CompanyCreditCardsList() {
  const nav = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [showNewCardModal, setShowNewCardModal] = useState(false);

  const search = searchParams.get('search') ?? '';
  const statusParam = searchParams.get('status') ?? '';
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
  const limit = 25;

  const validSorts: SortColumn[] = ['label', 'expiry', 'status'];
  const rawSort = searchParams.get('sort');
  const sortBy: SortColumn | null =
    rawSort && validSorts.includes(rawSort as SortColumn) ? (rawSort as SortColumn) : null;
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
    if (sortBy) {
      p.set('sort', sortBy);
      p.set('dir', sortDir);
    }
    if (search.trim()) p.set('search', search.trim());
    if (statusParam) p.set('status', statusParam);
    return p.toString();
  }, [page, limit, sortBy, sortDir, search, statusParam]);

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ['company-credit-cards', paramsString],
    queryFn: () => api<ListResponse>('GET', `/company-credit-cards?${paramsString}`),
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
    let title = 'No corporate cards found';
    if (statusParam) title += ` (${formatCorporateCardStatus(statusParam)})`;
    return title;
  }, [statusParam]);

  return (
    <div className={uiCx('w-full min-w-0 overflow-x-hidden', uiSpacing.pageStack, 'min-h-full bg-gray-50')}>
      <AppPageHeader
        title="Corporate cards"
        subtitle="Last four digits & expiry only — assign custody like equipment"
        icon={<CreditCard className="h-4 w-4" />}
      />

      <AppCard bodyClassName={uiSpacing.cardPadding}>
        <div className={uiCx(uiLayout.actionsRow, 'flex-wrap items-end gap-3')}>
          <div className="min-w-0 flex-1">
            <AppInput
              placeholder="Search label, last four, cardholder, issuer…"
              value={search}
              onChange={(e) => setSearchFilter(e.target.value)}
              leftIcon={<Search className="h-4 w-4" />}
              aria-label="Search corporate cards"
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
                  label="New corporate card"
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
                    label="New corporate card"
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
                            label="Label"
                            column="label"
                            sortBy={sortBy}
                            sortDir={sortDir}
                            onSort={setListSort}
                          />
                          <th className={uiCx(uiTypography.controlLabel, 'px-3 py-2 text-left')} scope="col">
                            Card
                          </th>
                          <SortHeader
                            label="Expires"
                            column="expiry"
                            sortBy={sortBy}
                            sortDir={sortDir}
                            onSort={setListSort}
                          />
                          <th className={uiCx(uiTypography.controlLabel, 'px-3 py-2 text-left')} scope="col">
                            Network
                          </th>
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
                          const net = NETWORK_LABEL[row.network?.toLowerCase?.() ?? ''] || row.network;
                          const inCustody = !!row.assigned_to_name;
                          return (
                            <tr
                              key={row.id}
                              className="min-h-[52px] cursor-pointer border-b border-gray-100 transition-colors last:border-b-0 hover:bg-gray-50"
                              onClick={() => nav(`/company-assets/credit-cards/${row.id}`)}
                            >
                              <td className={uiCx(uiTypography.body, 'px-3 py-3 align-top font-medium text-gray-900')}>
                                {row.label}
                              </td>
                              <td className="px-3 py-3 align-top font-mono text-xs tracking-wider text-gray-800">
                                •••• {row.last_four}
                              </td>
                              <td className="px-3 py-3 align-top">
                                <AppBadge
                                  variant={getExpiryBadgeVariant(row.expiry_month, row.expiry_year)}
                                  className="!normal-case"
                                >
                                  {expiryLabel(row.expiry_month, row.expiry_year)}
                                </AppBadge>
                              </td>
                              <td className={uiCx(uiTypography.body, 'px-3 py-3 align-top text-gray-700')}>{net}</td>
                              <td className="min-w-0 px-3 py-3 align-top">
                                <div className="flex min-w-0 flex-col gap-0.5">
                                  <AppBadge
                                    variant={getCorporateCardCustodyBadgeVariant(inCustody)}
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
                                  variant={getCorporateCardStatusBadgeVariant(row.status)}
                                  className="!normal-case"
                                >
                                  {formatCorporateCardStatus(row.status || '—')}
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

      <CompanyCreditCardListNewModal
        open={showNewCardModal}
        onClose={() => setShowNewCardModal(false)}
        onCreated={(data) => {
          setShowNewCardModal(false);
          queryClient.invalidateQueries({ queryKey: ['company-credit-cards'] });
          nav(`/company-assets/credit-cards/${data.id}`);
        }}
      />
    </div>
  );
}
=======
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import CompanyCreditCardListNewModal from '@/components/companyAssets/CompanyCreditCardListNewModal';
import { canEditCorporateCards } from '@/lib/companyAssetsPermissions';
import { CreditCard, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { expiryLabel, getExpiryBadgeVariant } from '@/lib/companyCreditCardExpiry';
import {
  formatCorporateCardStatus,
  getCorporateCardCustodyBadgeVariant,
  getCorporateCardStatusBadgeVariant,
} from '@/lib/companyCreditCardUi';
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
  label: string;
  network: string;
  last_four: string;
  expiry_month: number;
  expiry_year: number;
  status: string;
  assigned_to_name?: string | null;
};

type ListResponse = {
  items: CardRow[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
};

const NETWORK_LABEL: Record<string, string> = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  amex: 'Amex',
  other: 'Other',
};

type SortColumn = 'label' | 'expiry' | 'status';

const STATUS_FILTER_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'replaced', label: 'Replaced' },
  { value: 'lost', label: 'Lost' },
];

function SortHeader({
  label,
  column,
  sortBy,
  sortDir,
  onSort,
}: {
  label: string;
  column: SortColumn;
  sortBy: SortColumn | null;
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

export default function CompanyCreditCardsList() {
  const nav = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [showNewCardModal, setShowNewCardModal] = useState(false);

  const { data: me } = useQuery({ queryKey: ['me'], queryFn: () => api<any>('GET', '/auth/me') });
  const isAdmin = (me?.roles || []).includes('admin');
  const permissions = useMemo(() => new Set<string>(me?.permissions || []), [me?.permissions]);
  const canCreateCard = canEditCorporateCards(isAdmin, permissions);

  const search = searchParams.get('search') ?? '';
  const statusParam = searchParams.get('status') ?? '';
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
  const limit = 25;

  const validSorts: SortColumn[] = ['label', 'expiry', 'status'];
  const rawSort = searchParams.get('sort');
  const sortBy: SortColumn | null =
    rawSort && validSorts.includes(rawSort as SortColumn) ? (rawSort as SortColumn) : null;
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
    if (sortBy) {
      p.set('sort', sortBy);
      p.set('dir', sortDir);
    }
    if (search.trim()) p.set('search', search.trim());
    if (statusParam) p.set('status', statusParam);
    return p.toString();
  }, [page, limit, sortBy, sortDir, search, statusParam]);

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ['company-credit-cards', paramsString],
    queryFn: () => api<ListResponse>('GET', `/company-credit-cards?${paramsString}`),
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

  const todayLabel = useMemo(() => {
    return new Date().toLocaleDateString('en-CA', {
      weekday: 'long',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }, []);

  const showEmptyList = !isLoading && !error && items.length === 0;

  const emptyTitle = useMemo(() => {
    let title = 'No corporate cards found';
    if (statusParam) title += ` (${formatCorporateCardStatus(statusParam)})`;
    return title;
  }, [statusParam]);

  return (
    <div className={uiCx('w-full min-w-0 overflow-x-hidden', uiSpacing.pageStack, 'min-h-full bg-gray-50')}>
      <AppPageHeader
        title="Corporate cards"
        subtitle="Last four digits & expiry only — assign custody like equipment"
        icon={<CreditCard className="h-4 w-4" />}
        actions={
          <div className="text-right">
            <div className={uiTypography.overline}>Today</div>
            <div className={uiCx(uiTypography.sectionTitle, 'mt-0.5')}>{todayLabel}</div>
          </div>
        }
      />

      <AppCard bodyClassName={uiSpacing.cardPadding}>
        <div className={uiCx(uiLayout.actionsRow, 'flex-wrap items-end gap-3')}>
          <div className="min-w-0 flex-1">
            <AppInput
              placeholder="Search label, last four, cardholder, issuer…"
              value={search}
              onChange={(e) => setSearchFilter(e.target.value)}
              leftIcon={<Search className="h-4 w-4" />}
              aria-label="Search corporate cards"
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
                {canCreateCard ? (
                  <AppListCreateItem
                    label="New corporate card"
                    layout="row"
                    className="w-full"
                    onClick={openNewCardModal}
                  />
                ) : null}
                <AppEmptyState title={emptyTitle} className="border-0 bg-transparent p-0 shadow-none" />
              </div>
            ) : (
              <>
                {canCreateCard ? (
                  <div className={uiCx(uiSpacing.cardPadding, items.length === 0 ? 'pb-10' : 'pb-3')}>
                    <AppListCreateItem
                      label="New corporate card"
                      layout="row"
                      className="w-full"
                      onClick={openNewCardModal}
                    />
                  </div>
                ) : null}
                {items.length > 0 ? (
                  <div className="min-w-0 overflow-x-auto border-t border-gray-100">
                    <table className="w-full min-w-0 border-collapse">
                      <thead className={uiCx(uiBorders.subtle, 'border-b bg-gray-50')}>
                        <tr>
                          <SortHeader
                            label="Label"
                            column="label"
                            sortBy={sortBy}
                            sortDir={sortDir}
                            onSort={setListSort}
                          />
                          <th className={uiCx(uiTypography.controlLabel, 'px-3 py-2 text-left')} scope="col">
                            Card
                          </th>
                          <SortHeader
                            label="Expires"
                            column="expiry"
                            sortBy={sortBy}
                            sortDir={sortDir}
                            onSort={setListSort}
                          />
                          <th className={uiCx(uiTypography.controlLabel, 'px-3 py-2 text-left')} scope="col">
                            Network
                          </th>
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
                          const net = NETWORK_LABEL[row.network?.toLowerCase?.() ?? ''] || row.network;
                          const inCustody = !!row.assigned_to_name;
                          return (
                            <tr
                              key={row.id}
                              className="min-h-[52px] cursor-pointer border-b border-gray-100 transition-colors last:border-b-0 hover:bg-gray-50"
                              onClick={() => nav(`/company-assets/credit-cards/${row.id}`)}
                            >
                              <td className={uiCx(uiTypography.body, 'px-3 py-3 align-top font-medium text-gray-900')}>
                                {row.label}
                              </td>
                              <td className="px-3 py-3 align-top font-mono text-xs tracking-wider text-gray-800">
                                •••• {row.last_four}
                              </td>
                              <td className="px-3 py-3 align-top">
                                <AppBadge
                                  variant={getExpiryBadgeVariant(row.expiry_month, row.expiry_year)}
                                  className="!normal-case"
                                >
                                  {expiryLabel(row.expiry_month, row.expiry_year)}
                                </AppBadge>
                              </td>
                              <td className={uiCx(uiTypography.body, 'px-3 py-3 align-top text-gray-700')}>{net}</td>
                              <td className="min-w-0 px-3 py-3 align-top">
                                <div className="flex min-w-0 flex-col gap-0.5">
                                  <AppBadge
                                    variant={getCorporateCardCustodyBadgeVariant(inCustody)}
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
                                  variant={getCorporateCardStatusBadgeVariant(row.status)}
                                  className="!normal-case"
                                >
                                  {formatCorporateCardStatus(row.status || '—')}
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

      <CompanyCreditCardListNewModal
        open={canCreateCard && showNewCardModal}
        onClose={() => setShowNewCardModal(false)}
        onCreated={(data) => {
          setShowNewCardModal(false);
          queryClient.invalidateQueries({ queryKey: ['company-credit-cards'] });
          nav(`/company-assets/credit-cards/${data.id}`);
        }}
      />
    </div>
  );
}
>>>>>>> 3f9e83a9bfba1f0a57d66621cb210c385b724fb8
